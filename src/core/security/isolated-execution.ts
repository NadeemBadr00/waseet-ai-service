import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { featureError } from "./model-output.js";
import { fetchBounded } from "./content-inspector.js";
import { DurableStore } from "../database/durable-store.js";
import { getTenantContext, tenantNamespace } from "../auth/tenant-context.js";
export interface IsolatedArtifact { name: string; sourceUrl: string; sha256: string; contentBase64: string }
export interface IsolatedExecutionRequest { artifactHash: string; artifacts: IsolatedArtifact[]; acceptanceCriteria: string[]; commands: string[][]; timeoutSeconds: number; memoryMb: number; cpuCount: number; network: false; actorId?: string; tenant?: string }
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const commandSchema = z.array(z.string().min(1).max(500)).min(1).max(30);
const evidenceSchema = z.object({ command: commandSchema, exitCode: z.number().int().min(0).max(255), stdout: z.string().max(12000), stderr: z.string().max(12000), stdoutHash: z.string().regex(/^[a-f0-9]{64}$/), stderrHash: z.string().regex(/^[a-f0-9]{64}$/), artifactHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export interface IsolatedExecutionResult { status: "UNAVAILABLE" | "EXECUTED"; executed: boolean; reason: string; evidence: z.infer<typeof evidenceSchema>[] }
const requestSchema = z.object({ artifactHash: z.string().regex(/^[a-f0-9]{64}$/), artifacts: z.array(z.object({ name: z.string().regex(/^[a-z0-9_][a-z0-9_.-]*$/i).max(100), sourceUrl: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/), contentBase64: z.string().max(700000) }).strict()).min(1).max(6), acceptanceCriteria: z.array(z.string().max(2000)).max(50), commands: z.array(commandSchema).min(1).max(5), timeoutSeconds: z.number().int().min(1).max(120), memoryMb: z.number().int().min(64).max(1024), cpuCount: z.number().min(0.1).max(2), network: z.literal(false), actorId: z.string().optional(), tenant: z.string().optional() }).strict();
export function artifactBundleHash(artifacts: Array<Pick<IsolatedArtifact, "name" | "sha256">>): string { return hash(JSON.stringify(artifacts.map(item => ({ name: item.name, sha256: item.sha256 })).sort((a, b) => a.name.localeCompare(b.name)))); }
/** No submitted code runs in this service. A separately configured, authenticated worker must provide signed execution evidence. */
export async function requestIsolatedExecution(input: IsolatedExecutionRequest, signal?: AbortSignal): Promise<IsolatedExecutionResult> {
  const workerUrl = process.env.WASEET_AI_ISOLATED_WORKER_URL, token = process.env.WASEET_AI_ISOLATED_WORKER_TOKEN, attestation = process.env.WASEET_AI_ISOLATED_ATTESTATION_SECRET;
  if (!workerUrl || !token || !attestation || process.env.WASEET_AI_ISOLATION_VERIFIED !== "true") return { status: "UNAVAILABLE", executed: false, reason: "An independently verified isolated worker is not configured; no code was executed.", evidence: [] };
  requestSchema.parse(input);
  const url = new URL(workerUrl);
  if (url.protocol !== "https:" || url.username || url.password || token.length < 32 || attestation.length < 32) throw featureError("ISOLATION_POLICY_INVALID", "Worker transport or credentials are not securely configured.", 422);
  if (new Set(input.artifacts.map(item => item.name)).size !== input.artifacts.length || input.artifacts.some(item => hash(Buffer.from(item.contentBase64, "base64")) !== item.sha256) || artifactBundleHash(input.artifacts) !== input.artifactHash) throw featureError("ARTIFACT_HASH_MISMATCH", "Artifact content does not match its immutable hash.", 422);
  const idempotencyKey = hash(JSON.stringify(input)), actor = getTenantContext()?.actor.userId;
  const cacheKey = (actor ?? "offline") + ":" + idempotencyKey;
  const cached = DurableStore.get<IsolatedExecutionResult>("execution-evidence", cacheKey); if (cached) return cached;
  const response = await fetch(url, { method: "POST", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(130000)]) : AbortSignal.timeout(130000), headers: { "content-type": "application/json", authorization: "Bearer " + token, "idempotency-key": idempotencyKey }, body: JSON.stringify(input) });
  if (!response.ok || !response.body) throw featureError("ISOLATED_WORKER_FAILED", "Worker execution could not be verified.");
  const reader = response.body.getReader(); const pieces: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 256000) { await reader.cancel(); throw featureError("ISOLATED_WORKER_RESPONSE_LIMIT", "Worker evidence exceeds the output limit."); } pieces.push(part.value); }
  const raw = Buffer.concat(pieces).toString("utf8"), signature = response.headers.get("x-worker-signature") ?? "", expected = createHmac("sha256", attestation).update(raw).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw featureError("ISOLATION_ATTESTATION_INVALID", "Worker evidence signature is invalid.");
  const data = z.object({ workerId: z.string().min(1), jobId: z.string().min(1), idempotencyKey: z.literal(idempotencyKey), artifactHash: z.literal(input.artifactHash), policy: z.object({ isolated: z.literal(true), network: z.literal(false), secretsInjected: z.literal(false), readOnlyRoot: z.literal(true), nonRoot: z.literal(true), capabilitiesDropped: z.literal(true), memoryMb: z.literal(input.memoryMb), cpuCount: z.literal(input.cpuCount), timeoutSeconds: z.literal(input.timeoutSeconds), pidsLimit: z.number().int().min(1).max(128), imageDigest: z.string().regex(/^.+@sha256:[a-f0-9]{64}$/) }).strict(), evidence: z.array(evidenceSchema).length(input.commands.length).min(1) }).strict().safeParse(JSON.parse(raw));
  if (!data.success || data.data.evidence.some((item, index) => item.artifactHash !== input.artifactHash || JSON.stringify(item.command) !== JSON.stringify(input.commands[index]) || item.stdoutHash !== hash(item.stdout) || item.stderrHash !== hash(item.stderr))) throw featureError("ISOLATION_ATTESTATION_INVALID", "Worker commands, resource policy or output hashes did not match the request.");
  const result: IsolatedExecutionResult = { status: "EXECUTED", executed: true, reason: "Signed evidence received from the configured verified worker; success depends on each exit code.", evidence: data.data.evidence };
  DurableStore.put("execution-evidence", cacheKey, result); return result;
}
/** Trusted backend uses owned artifact URLs. Actual fetched bytes, not excerpts, are sent to the isolated worker. */
export async function executeArtifacts(urls: string[], options: Omit<IsolatedExecutionRequest, "artifactHash" | "artifacts" | "actorId" | "tenant">, signal?: AbortSignal): Promise<IsolatedExecutionResult> {
  if (!process.env.WASEET_AI_ISOLATED_WORKER_URL || process.env.WASEET_AI_ISOLATION_VERIFIED !== "true") return { status: "UNAVAILABLE", executed: false, reason: "A verified isolated worker is required; no code was executed.", evidence: [] };
  const artifacts: IsolatedArtifact[] = [];
  for (const [index, url] of [...new Set(urls)].slice(0, 6).entries()) {
    const fetched = await fetchBounded(url, signal);
    const name = String(index) + "-" + (new URL(fetched.url).pathname.split("/").pop() ?? "artifact").replace(/[^\w.-]/g, "_").slice(0, 80);
    artifacts.push({ name, sourceUrl: fetched.url, sha256: hash(fetched.body), contentBase64: fetched.body.toString("base64") });
  }
  return requestIsolatedExecution({ ...options, artifacts, artifactHash: artifactBundleHash(artifacts), actorId: getTenantContext()?.actor.userId, tenant: tenantNamespace() }, signal);
}
