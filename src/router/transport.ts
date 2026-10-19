import { ProjectPoolManager } from "./project-pool.manager.js";
import { AiProviderError, SmartRouter } from "./smart-router.js";
import type { DataClassification, InferenceResponse, ProjectManifest } from "./types.js";
import { inferenceSignalStorage } from "./request-scope.js";

export interface OperationOptions { signal?: AbortSignal; deadlineMs?: number; attemptTimeoutMs?: number; maxAttempts?: number; estimatedTokens?: number; }
export function deadlineSignal(options: OperationOptions = {}): { signal: AbortSignal; dispose(): void } {
  if (options.attemptTimeoutMs !== undefined && (!Number.isInteger(options.attemptTimeoutMs) || options.attemptTimeoutMs < 1 || options.attemptTimeoutMs > 300000)) throw new AiProviderError("AI_INVALID_ATTEMPT_TIMEOUT", 400);
  const duration = options.deadlineMs ?? 60000;
  if (!Number.isFinite(duration) || duration < 1 || duration > 300000) throw new AiProviderError("AI_INVALID_DEADLINE", 400);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new AiProviderError("AI_DEADLINE_EXCEEDED", 504)), duration); timer.unref();
  const parent = options.signal ?? inferenceSignalStorage.getStore(); return { signal: parent ? AbortSignal.any([parent, controller.signal]) : controller.signal, dispose: () => clearTimeout(timer) };
}
export async function providerFetch(project: ProjectManifest, path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted();
  let response: Response;
  try { response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": project.apiKey }, body: JSON.stringify(body), signal }); }
  catch (error) { signal.throwIfAborted(); if (error instanceof TypeError) throw new AiProviderError("AI_PROVIDER_NETWORK", 503); throw error; }
  if (!response.ok) {
    let seconds = Number(response.headers.get("retry-after"));
    if (!Number.isFinite(seconds) || seconds <= 0) { const date = Date.parse(response.headers.get("retry-after") || ""); seconds = Number.isFinite(date) ? Math.max(1, (date - Date.now()) / 1000) : 60; }
    await response.body?.cancel(); throw new AiProviderError(`AI_PROVIDER_HTTP_${response.status}`, response.status, seconds * 1000);
  }
  return response;
}
export async function readJsonBounded(response: Response, signal: AbortSignal, maxBytes = 16000000): Promise<Record<string, unknown>> {
  if (!response.body) throw new AiProviderError("AI_EMPTY_RESPONSE");
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
  try { while (true) { signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) throw new AiProviderError("AI_RESPONSE_TOO_LARGE"); parts.push(value); } }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiProviderError("AI_INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
export async function* sseEvents(response: Response, signal: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new AiProviderError("AI_EMPTY_STREAM");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let buffer = "", bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const item = await reader.read(); buffer += item.done ? decoder.decode() : decoder.decode(item.value, { stream: true });
      bytes += item.value?.length ?? 0; if (bytes > 32000000 || buffer.length > 4000000) throw new AiProviderError("AI_STREAM_LIMIT");
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        const event: unknown = JSON.parse(data); if (!event || typeof event !== "object" || Array.isArray(event)) throw new AiProviderError("AI_INVALID_STREAM_EVENT");
        yield event as Record<string, unknown>;
      }
      if (item.done) { if (buffer.trim() && !buffer.trim().startsWith(":")) throw new AiProviderError("AI_TRUNCATED_STREAM"); break; }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export function responseUsage(data: Record<string, unknown>): InferenceResponse["usage"] {
  const u = (data.usageMetadata ?? data.usage) as Record<string, unknown> | undefined; if (!u) return undefined;
  const input = u.promptTokenCount ?? u.total_input_tokens, output = u.candidatesTokenCount ?? u.total_output_tokens, total = u.totalTokenCount ?? u.total_tokens;
  if (![input, output, total].every(x => typeof x === "number" && Number.isFinite(x) && x >= 0)) return undefined;
  return { promptTokens: input as number, completionTokens: output as number, totalTokens: total as number };
}
export async function modelOperation<T>(models: readonly string[], classification: DataClassification, work: (project: ProjectManifest, model: string, signal: AbortSignal, lease: string) => Promise<T>, options: OperationOptions = {}): Promise<{ result: T; model: string; project: ProjectManifest; hadFailedAttempts: boolean }> {
  const deadline = deadlineSignal(options), excluded = new Set<string>(), attempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8) { deadline.dispose(); throw new AiProviderError("AI_INVALID_ATTEMPTS", 400); }
  let hadFailedAttempts = false; try {
    for (let i = 0; i < attempts; i++) {
      deadline.signal.throwIfAborted(); const choice = SmartRouter.selectForModels(models, classification, excluded);
      if (!choice) throw new AiProviderError(SmartRouter.isFreeEligible(classification) ? "AI_ROUTE_UNAVAILABLE" : "AI_DATA_POLICY_BLOCKED");
      const lease = ProjectPoolManager.reserve(choice.project, choice.model, options.estimatedTokens ?? 0, (options.deadlineMs ?? 60000) + 5000);
      if (!lease) { excluded.add(`${choice.project.alias}:${choice.model}`); continue; }
      const attempt = options.attemptTimeoutMs ? AbortSignal.timeout(options.attemptTimeoutMs) : undefined;
      const signal = attempt ? AbortSignal.any([deadline.signal, attempt]) : deadline.signal;
      try { const result = await work(choice.project, choice.model, signal, lease); signal.throwIfAborted(); return { result, model: choice.model, project: choice.project, hadFailedAttempts }; }
      catch (error) { hadFailedAttempts = true; deadline.signal.throwIfAborted(); if (attempt?.aborted) excluded.add(`${choice.project.alias}:${choice.model}`); else if (!SmartRouter.handleFailure(choice.project, choice.model, error, excluded)) throw error; }
      finally { ProjectPoolManager.release(lease); }
    }
    throw new AiProviderError("AI_ATTEMPTS_EXHAUSTED");
  } finally { deadline.dispose(); }
}
