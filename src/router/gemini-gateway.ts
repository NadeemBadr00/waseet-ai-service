import { ProjectPoolManager } from "./project-pool.manager.js";
import { modelRoute, reasoningConfig } from "./model-registry.js";
import { AiProviderError, SmartRouter } from "./smart-router.js";
import { deadlineSignal, modelOperation, providerFetch, readJsonBounded, responseUsage, sseEvents } from "./transport.js";
import type { GroundingMetadata, InferenceRequest, InferenceResponse } from "./types.js";

type Candidate = { content?: { parts?: Array<{ text?: string; thought?: boolean; functionCall?: unknown }> }; finishReason?: string; groundingMetadata?: unknown };
export interface TextStreamChunk { chunk: string; projectAliasUsed: string; modelUsed: string; usage?: InferenceResponse["usage"]; usageMeasured?: boolean; }
export interface NativeTool { name: string; description: string; parameters: Record<string, unknown>; validate(args: unknown): unknown; execute(args: unknown, signal: AbortSignal): Promise<unknown>; }
export class GeminiGateway {
  private static estimate(request: InferenceRequest): number { return Buffer.byteLength(request.prompt) + Buffer.byteLength(request.systemInstruction ?? "") + Buffer.byteLength(JSON.stringify(request.contents ?? [])) + (request.maxOutputTokens ?? 2048); }
  private static mockHandler: ((req: InferenceRequest, model: string, projectAlias: string) => Promise<string>) | null = null;
  public static setMockHandler(handler: typeof GeminiGateway.mockHandler): void { this.mockHandler = handler; }
  private static validate(request: InferenceRequest): void {
    if (!request.prompt || request.prompt.length > 120000 || (request.systemInstruction?.length ?? 0) > 24000 || !Number.isInteger(request.maxOutputTokens ?? 2048) || (request.maxOutputTokens ?? 2048) > 8192 || (request.maxOutputTokens ?? 2048) < 1) throw new AiProviderError("AI_CONTEXT_LIMIT", 400);
    if (JSON.stringify(request.contents ?? []).length > 160000) throw new AiProviderError("AI_CONTEXT_LIMIT", 400);
  }
  private static payload(request: InferenceRequest, model: string): Record<string, unknown> {
    const thinkingConfig = reasoningConfig(model, request.effort ?? (request.modelTier === "HEAVY" ? "high" : request.modelTier === "MEDIUM" ? "medium" : "low"), request.thinkingLevel === "minimal" && model !== "gemini-3.5-flash-lite" ? undefined : request.thinkingLevel);
    const thinkingBudget = typeof thinkingConfig.thinkingBudget === "number" ? thinkingConfig.thinkingBudget : 0;
    const requestedTokens = request.maxOutputTokens ?? 2048;
    const maxOutputTokens = thinkingBudget > 0 ? Math.min(8192, requestedTokens + thinkingBudget) : requestedTokens;
    const generationConfig: Record<string, unknown> = { maxOutputTokens, thinkingConfig };
    // Sampling is legacy-model-specific; Gemini 3 adapters omit deprecated parameters.
    if (model.startsWith("gemini-2.5-") && request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.responseJsonSchema) {
      generationConfig.responseMimeType = "application/json";
      if (Object.keys(request.responseJsonSchema).length > 0) generationConfig.responseJsonSchema = request.responseJsonSchema;
    }
    return { contents: [...(request.contents ?? []), { role: "user", parts: [{ text: request.prompt }] }], generationConfig,
      ...(request.systemInstruction ? { systemInstruction: { parts: [{ text: request.systemInstruction }] } } : {}) };
  }
  private static text(data: Record<string, unknown>): string {
    const candidate = (data.candidates as Candidate[] | undefined)?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new AiProviderError(`AI_INCOMPLETE_RESPONSE_${candidate.finishReason}`);
    return (candidate?.content?.parts ?? []).filter(p => !p.thought && typeof p.text === "string").map(p => p.text).join("");
  }
  public static async generate(request: InferenceRequest): Promise<InferenceResponse> {
    this.validate(request); const route = modelRoute(request.modelTier, request.effort, request.preferredModel, request.modelPin);
    const { result, model, project, hadFailedAttempts } = await modelOperation(route, request.classification, async (project, model, signal, lease) => {
      if (this.mockHandler) {
        const text = await Promise.race([this.mockHandler(request, model, project.alias), new Promise<never>((_, reject) => { const abort = () => reject(signal.reason); if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true }); })]);
        return { text, usage: undefined };
      }
      request.onRequest?.();
      const response = await providerFetch(project, `models/${model}:generateContent`, this.payload(request, model), signal);
      const data = await readJsonBounded(response, signal), text = this.text(data), usage = responseUsage(data);
      if (!text.trim()) throw new AiProviderError("AI_EMPTY_RESPONSE");
      if (request.responseJsonSchema) { const parsed: unknown = JSON.parse(text); if (parsed === undefined) throw new AiProviderError("AI_INVALID_JSON"); }
      if (usage) ProjectPoolManager.accountTokens(lease, usage.totalTokens);
      return { text, usage };
    }, { signal: request.signal, deadlineMs: request.deadlineMs, attemptTimeoutMs: request.attemptTimeoutMs, maxAttempts: request.maxAttempts, estimatedTokens: this.estimate(request) });
    return { text: result.text, usage: result.usage, usageMeasured: !!result.usage && !hadFailedAttempts, modelUsed: model, projectAliasUsed: project.alias, status: "completed" };
  }
  private static grounding(candidate: Candidate): GroundingMetadata | undefined {
    if (candidate.groundingMetadata === undefined) return undefined;
    const invalid = (): never => { throw new AiProviderError("AI_INVALID_GROUNDING_METADATA"); };
    const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
    const array = (value: unknown, limit: number): unknown[] => value === undefined ? [] : Array.isArray(value) && value.length <= limit ? value : invalid();
    const string = (value: unknown, limit: number): string => typeof value === "string" && value.length <= limit ? value : invalid();
    const metadata = record(candidate.groundingMetadata);
    const webSearchQueries = array(metadata.webSearchQueries, 20).map(value => string(value, 2000));
    const groundingChunks = array(metadata.groundingChunks, 20).map(value => {
      const web = record(record(value).web), rawUrl = string(web.uri, 4096); let url: URL;
      try { url = new URL(rawUrl); } catch { return invalid(); }
      const host = url.hostname.toLowerCase().replace(/\.$/, ""), labels = host.split(".");
      // Sources are links, never fetched here. Exclude credentials, IP literals and local/reserved hostnames.
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/[a-z]/.test(labels.at(-1) ?? "") || /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|test|invalid|example|onion)$/.test(host)) return invalid();
      return { web: { uri: url.href, title: web.title === undefined ? host : string(web.title, 500) } };
    });
    let offset = 0;
    const parts = (candidate.content?.parts ?? []).map(part => {
      const publicText = !part.thought && typeof part.text === "string" ? part.text : undefined;
      const result = { text: publicText, offset }; if (publicText !== undefined) offset += Buffer.byteLength(publicText); return result;
    });
    const groundingSupports = array(metadata.groundingSupports, 100).map(value => {
      const support = record(value), segment = record(support.segment), partIndex = segment.partIndex ?? 0;
      if (typeof partIndex !== "number" || !Number.isInteger(partIndex) || partIndex < 0) return invalid();
      const part = parts[partIndex]; if (part?.text === undefined) return invalid();
      const bytes = Buffer.from(part.text), start = segment.startIndex ?? 0, end = segment.endIndex;
      const boundary = (index: number): boolean => index === bytes.length || ((bytes[index] ?? 0) & 0xc0) !== 0x80;
      if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > bytes.length || !boundary(start) || !boundary(end)) return invalid();
      const text = bytes.subarray(start, end).toString("utf8");
      if (segment.text !== undefined && string(segment.text, 32000) !== text) return invalid();
      const groundingChunkIndices = array(support.groundingChunkIndices, 20).map(index => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < groundingChunks.length ? index : invalid());
      return { segment: { startIndex: part.offset + start, endIndex: part.offset + end, text }, groundingChunkIndices: [...new Set(groundingChunkIndices)] };
    });
    const entry = metadata.searchEntryPoint === undefined ? undefined : record(metadata.searchEntryPoint);
    const searchEntryPoint = entry?.renderedContent === undefined ? undefined : { renderedContent: string(entry.renderedContent, 64000) };
    return { webSearchQueries, groundingChunks, groundingSupports, ...(searchEntryPoint ? { searchEntryPoint } : {}) };
  }
  public static async generateGrounded(request: InferenceRequest): Promise<InferenceResponse> {
    if (request.featureId !== "AI-21-HELP-GENERAL" || request.classification !== "PERSONAL") throw new AiProviderError("AI_WEB_SEARCH_DENIED", 403);
    if (process.env.WASEET_AI_ENABLE_WEB_SEARCH !== "true") throw new AiProviderError("AI_WEB_SEARCH_DISABLED", 403);
    if (!ProjectPoolManager.paidAllowed()) throw new AiProviderError("AI_WEB_SEARCH_PAID_DISABLED", 403);
    this.validate(request);
    if (request.responseJsonSchema || request.contents?.length || request.prompt.length > 6000) throw new AiProviderError("AI_WEB_SEARCH_CONTEXT_DENIED", 400);
    const bounded = { ...request, deadlineMs: Math.min(request.deadlineMs ?? 60000, 60000), attemptTimeoutMs: Math.min(request.attemptTimeoutMs ?? 60000, 60000), maxAttempts: 1 };
    const route = modelRoute(request.modelTier, request.effort, request.preferredModel, request.modelPin);
    const { result, model, project } = await modelOperation(route, request.classification, async (project, model, signal, lease) => {
      const payload = this.payload(bounded, model); payload.tools = [{ google_search: {} }];
      request.onRequest?.();
      const response = await providerFetch(project, `models/${model}:generateContent`, payload, signal);
      const data = await readJsonBounded(response, signal), candidate = (data.candidates as Candidate[] | undefined)?.[0];
      if (!candidate || candidate.finishReason !== "STOP") throw new AiProviderError("AI_INCOMPLETE_GROUNDED_RESPONSE");
      if (candidate.content?.parts?.some(part => part.functionCall)) throw new AiProviderError("AI_WEB_SEARCH_TOOL_DENIED");
      const text = this.text(data), usage = responseUsage(data);
      if (!text.trim()) throw new AiProviderError("AI_EMPTY_RESPONSE");
      const groundingMetadata = this.grounding(candidate);
      if (usage) ProjectPoolManager.accountTokens(lease, usage.totalTokens);
      return { text, usage, groundingMetadata };
    }, { signal: request.signal, deadlineMs: bounded.deadlineMs, attemptTimeoutMs: bounded.attemptTimeoutMs, maxAttempts: 1, estimatedTokens: this.estimate(request) });
    return { text: result.text, usage: result.usage, usageMeasured: !!result.usage, modelUsed: model, projectAliasUsed: project.alias, status: "completed", ...(result.groundingMetadata ? { groundingMetadata: result.groundingMetadata } : {}) };
  }
  public static async* generateStream(request: InferenceRequest): AsyncGenerator<TextStreamChunk> {
    this.validate(request);
    if (request.responseJsonSchema) throw new AiProviderError("AI_STRUCTURED_STREAM_NOT_PUBLIC", 400);
    if (this.mockHandler) { const result = await this.generate(request); yield { chunk: result.text, modelUsed: result.modelUsed, projectAliasUsed: result.projectAliasUsed }; return; }
    const route = modelRoute(request.modelTier, request.effort, request.preferredModel, request.modelPin), deadline = deadlineSignal(request), excluded = new Set<string>(); let emitted = false, hadFailedAttempts = false;
    try {
      const attempts = request.maxAttempts ?? 3; if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8) throw new AiProviderError("AI_INVALID_ATTEMPTS", 400);
      for (let i = 0; i < attempts; i++) {
        deadline.signal.throwIfAborted(); const choice = SmartRouter.selectForModels(route, request.classification, excluded);
        if (!choice) throw new AiProviderError(SmartRouter.isFreeEligible(request.classification) ? "AI_ROUTE_UNAVAILABLE" : "AI_DATA_POLICY_BLOCKED");
        const lease = ProjectPoolManager.reserve(choice.project, choice.model, this.estimate(request), (request.deadlineMs ?? 60000) + 5000); if (!lease) { excluded.add(`${choice.project.alias}:${choice.model}`); continue; }
        const attempt = request.attemptTimeoutMs ? AbortSignal.timeout(request.attemptTimeoutMs) : undefined, signal = attempt ? AbortSignal.any([deadline.signal, attempt]) : deadline.signal; let finished = false;
        try {
          request.onRequest?.();
          const response = await providerFetch(choice.project, `models/${choice.model}:streamGenerateContent?alt=sse`, this.payload(request, choice.model), signal);
          for await (const data of sseEvents(response, signal)) {
            const candidate = (data.candidates as Candidate[] | undefined)?.[0], usage = responseUsage(data);
            if (data.error || data.promptFeedback && !(data.candidates as unknown[] | undefined)?.length) throw new AiProviderError("AI_STREAM_BLOCKED");
            const text = this.text(data); if (candidate?.finishReason === "STOP") finished = true;
            if (usage) { ProjectPoolManager.accountTokens(lease, usage.totalTokens); yield { chunk: "", modelUsed: choice.model, projectAliasUsed: choice.project.alias, usage, usageMeasured: !hadFailedAttempts }; }
            if (text) { emitted = true; yield { chunk: text, modelUsed: choice.model, projectAliasUsed: choice.project.alias }; }
          }
          if (!emitted || !finished) throw new AiProviderError("AI_PARTIAL_STREAM"); return;
        } catch (error) { hadFailedAttempts = true; deadline.signal.throwIfAborted(); if (emitted) throw new AiProviderError("AI_PARTIAL_STREAM"); if (attempt?.aborted) excluded.add(`${choice.project.alias}:${choice.model}`); else if (!SmartRouter.handleFailure(choice.project, choice.model, error, excluded)) throw error; }
        finally { ProjectPoolManager.release(lease); }
      }
      throw new AiProviderError("AI_ATTEMPTS_EXHAUSTED");
    } finally { deadline.dispose(); }
  }
  public static async generateWithTools(request: InferenceRequest, tools: readonly NativeTool[]): Promise<InferenceResponse> {
    if (tools.length === 0) return this.generate(request);
    this.validate(request); if (tools.length > 20 || new Set(tools.map(t => t.name)).size !== tools.length) throw new AiProviderError("AI_TOOL_LIMIT", 400);
    const route = modelRoute(request.modelTier, request.effort, request.preferredModel, request.modelPin);
    const out = await modelOperation(route, request.classification, async (project, model, signal, lease) => {
      const history = [...(request.contents ?? []), { role: "user" as const, parts: [{ text: request.prompt }] }]; let usage: InferenceResponse["usage"], usageMeasured = true;
      for (let turn = 0; turn < 12; turn++) {
        signal.throwIfAborted(); if (JSON.stringify(history).length > 160000) throw new AiProviderError("AI_CONTEXT_LIMIT");
        const payload = this.payload({ ...request, prompt: "Continue the assigned task.", contents: history }, model);
        // Avoid adding the artificial user turn; preserve native parts and signatures exactly.
        payload.contents = history; payload.tools = [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }];
        const currentLease = turn === 0 ? lease : ProjectPoolManager.reserve(project, model, Buffer.byteLength(JSON.stringify(payload)), request.deadlineMs ?? 60000);
        if (!currentLease) throw new AiProviderError("AI_TOOL_QUOTA_EXHAUSTED", 429);
        let data: Record<string, unknown>;
        try { request.onRequest?.(); const response = await providerFetch(project, `models/${model}:generateContent`, payload, signal); data = await readJsonBounded(response, signal); const currentUsage = responseUsage(data); if (currentUsage) { usage = usage ? { promptTokens: usage.promptTokens + currentUsage.promptTokens, completionTokens: usage.completionTokens + currentUsage.completionTokens, totalTokens: usage.totalTokens + currentUsage.totalTokens } : currentUsage; ProjectPoolManager.accountTokens(currentLease, currentUsage.totalTokens); } else usageMeasured = false; }
        finally { ProjectPoolManager.release(currentLease); }
        const candidate = (data.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }> | undefined)?.[0];
        const parts = candidate?.content?.parts; if (!parts?.length) throw new AiProviderError("AI_EMPTY_RESPONSE");
        if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new AiProviderError("AI_INCOMPLETE_TOOL_RESPONSE");
        const calls = parts.filter(p => p.functionCall); history.push({ role: "model", parts });
        if (!calls.length) { const text = this.text(data); if (!text.trim()) throw new AiProviderError("AI_EMPTY_RESPONSE"); return { text, usage, usageMeasured }; }
        const results: Array<Record<string, unknown>> = [];
        for (const part of calls) {
          const call = part.functionCall as { name?: string; args?: unknown; id?: string; call_id?: string };
          const tool = tools.find(t => t.name === call.name); if (!tool) throw new AiProviderError("AI_TOOL_DENIED", 403);
          const args = tool.validate(call.args ?? {}); signal.throwIfAborted(); const result = await tool.execute(args, signal); signal.throwIfAborted();
          if (JSON.stringify(result).length > 32000) throw new AiProviderError("AI_TOOL_OUTPUT_LIMIT");
          results.push({ functionResponse: { name: tool.name, ...(call.id ? { id: call.id } : {}), ...(call.call_id ? { call_id: call.call_id } : {}), response: { result } } });
        }
        history.push({ role: "user", parts: results });
      }
      throw new AiProviderError("AI_TOOL_TURN_LIMIT");
    }, { signal: request.signal, deadlineMs: request.deadlineMs, maxAttempts: 1, estimatedTokens: this.estimate(request) + Buffer.byteLength(JSON.stringify(tools.map(t => t.parameters))) });
    return { text: out.result.text, usage: out.result.usage, usageMeasured: !!out.result.usage && out.result.usageMeasured, modelUsed: out.model, projectAliasUsed: out.project.alias, status: "completed" };
  }
}
