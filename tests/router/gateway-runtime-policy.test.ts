import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

process.env.NODE_ENV = "test";
process.env.WASEET_AI_STATE_DIR = mkdtempSync(resolve(tmpdir(), "waseet-model-tests-"));
process.env.WASEET_AI_CLIENT_ID = "test-client";
process.env.WASEET_AI_CLIENT_SECRET = "test-client-secret-32-characters-long";
process.env.WASEET_AI_TOKEN_SIGNING_SECRET = "test-signing-secret-32-characters-long";
process.env.WASEET_AI_ENVIRONMENT = "dev";
delete process.env.WASEET_AI_ALLOW_PAID;
const { ProjectPoolManager } = await import("../../src/router/project-pool.manager.js");
const { SmartRouter } = await import("../../src/router/smart-router.js");
const { MODEL_CAPABILITIES, MODEL_ROUTES, reasoningConfig } = await import("../../src/router/model-registry.js");
const { GeminiGateway } = await import("../../src/router/gemini-gateway.js");
const { TtsService } = await import("../../src/features/tts/tts.service.js");
const { transcribeSchema, VoiceGateway, embedText } = await import("../../src/runtime/voice.js");
const { TaskRuntime, validateTaskPlan } = await import("../../src/runtime/task-runtime.js");
const { TaskStore } = await import("../../src/runtime/task-store.js");
const { buildApp } = await import("../../src/app.js");
const { TenantAuthService } = await import("../../src/core/auth/tenant-auth.service.js");
const originalFetch = globalThis.fetch;
const project = (alias: string, projectId = "same-google-project") => ({ alias, projectId, apiKey: "test-fixture-key", tier: "FREE" as const, enabled: true, freeConfirmed: true, maxRpm: 100, maxTpm: 1000000, supportedModels: Object.keys(MODEL_CAPABILITIES) });
beforeEach(() => { ProjectPoolManager.setProjectsForTesting([project("a"), project("b")]); ProjectPoolManager.resetCooldowns(); GeminiGateway.setMockHandler(null); globalThis.fetch = async () => { throw new Error("UNMOCKED_NETWORK_FORBIDDEN"); }; });
afterEach(() => { globalThis.fetch = originalFetch; GeminiGateway.setMockHandler(null); });
const request = { featureId: "fixture", modelTier: "LIGHT" as const, classification: "SYNTHETIC" as const, prompt: "Synthetic test question", maxOutputTokens: 100 };
const jsonText = (text: string, usage = true) => Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], ...(usage ? { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 9, totalTokenCount: 16 } } : {}) });
const sse = (events: unknown[]) => new Response(events.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const ttsInput = { text: "Synthetic greeting", model: "gemini-3.8-flash-lite-tts" as const, voice: "Puck" as const, dialect: "english" as const, speakingRate: "normal" as const, mimeType: "audio/wav" as const };

test("frozen effort routes and reasoning adapters preserve model-specific semantics", () => {
  assert.deepEqual(MODEL_ROUTES.low, ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash-lite"]);
  assert.deepEqual(MODEL_ROUTES.max, ["gemini-2.5-flash", "gemini-3.8-flash"]);
  assert.equal(reasoningConfig("gemini-2.5-flash", "high").thinkingBudget, 4096);
  assert.equal(reasoningConfig("gemini-3.8-flash", "max").thinkingLevel, "HIGH");
  assert.throws(() => reasoningConfig("gemini-3.8-flash", "low", "minimal"), /CAPABILITY_MISMATCH/);
  assert.deepEqual(SmartRouter.getCandidateModels("LIGHT", undefined, "low", "gemini-3.8-flash"), ["gemini-3.8-flash"]);
  assert.throws(() => SmartRouter.getCandidateModels("LIGHT", undefined, "low", "unapproved"), /UNAPPROVED/);
});
test("same-project key aliases share cooldown and concurrency; unknown IDs share a conservative group", () => {
  ProjectPoolManager.recordRateLimit("a", "gemini-2.5-flash-lite", 60000);
  assert.equal(ProjectPoolManager.isProjectAvailable("b", "gemini-2.5-flash-lite"), false);
  const first = ProjectPoolManager.reserve(project("a"), "gemini-2.5-flash", 1), second = ProjectPoolManager.reserve(project("b"), "gemini-3.8-flash", 1);
  assert.ok(first && second); assert.equal(ProjectPoolManager.reserve(project("b"), "gemini-3.5-flash-lite", 1), null);
  ProjectPoolManager.release(first); assert.ok(ProjectPoolManager.reserve(project("b"), "gemini-3.5-flash-lite", 1));
  assert.equal(ProjectPoolManager.scope(project("a", "free-proj-1")), "unverified");
});
test("credential rotation clears only its authentication block; project cooldown and deployment storage gates remain", () => {
  ProjectPoolManager.blockAuthentication("a"); assert.equal(ProjectPoolManager.isProjectAvailable("a", "gemini-2.5-flash"), false);
  ProjectPoolManager.recordRateLimit("a", "gemini-3.8-flash", 60000); ProjectPoolManager.setProjectsForTesting([{ ...project("a"), apiKey: "rotated-fixture-key" }]);
  assert.equal(ProjectPoolManager.isProjectAvailable("a", "gemini-2.5-flash"), true); assert.equal(ProjectPoolManager.isProjectAvailable("a", "gemini-3.8-flash"), false);
  for (const variable of ["WASEET_AI_DISTRIBUTED", "WASEET_AI_DISTRIBUTED_REPLICAS", "K_SERVICE"]) { process.env[variable] = "true"; try { assert.throws(() => ProjectPoolManager.reserve(project("a"), "gemini-2.5-flash", 1), /durable shared storage/); const store = new TaskStore(); assert.throws(() => store.get({ tenantId: "x", userId: "x" }, "missing"), /durable shared storage/); } finally { delete process.env[variable]; } }
});
test("free keys require explicit unbilled confirmation; personal/sensitive input cannot silently use free or paid", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return jsonText("never"); };
  await assert.rejects(GeminiGateway.generate({ ...request, classification: "PERSONAL" }), /DATA_POLICY_BLOCKED/);
  assert.equal(calls, 0); ProjectPoolManager.setProjectsForTesting([{ ...project("a"), freeConfirmed: false }]);
  await assert.rejects(GeminiGateway.generate(request), /ROUTE_UNAVAILABLE/); assert.equal(calls, 0);
});
test("real unary usage is preserved; absent usage stays absent; auth failures stop without exposing keys", async () => {
  globalThis.fetch = async (url, options) => { assert.ok(!String(url).includes("key=")); assert.equal((options?.headers as Record<string, string>)["x-goog-api-key"], "test-fixture-key"); return jsonText("answer"); };
  const measured = await GeminiGateway.generate(request); assert.equal(measured.usage?.totalTokens, 16);
  globalThis.fetch = async () => jsonText("answer", false); assert.equal((await GeminiGateway.generate(request)).usage, undefined);
  let attempts = 0; globalThis.fetch = async () => { attempts++; return new Response("secret-provider-details", { status: 401 }); };
  await assert.rejects(GeminiGateway.generate(request), /AI_AUTH_FAILED/); assert.equal(attempts, 1);
});
test("native SSE requires a final STOP and never splices fallback after visible partial text", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return sse([{ candidates: [{ content: { parts: [{ text: "partial" }] } }] }]); };
  const chunks: string[] = []; await assert.rejects(async () => { for await (const item of GeminiGateway.generateStream(request)) chunks.push(item.chunk); }, /PARTIAL_STREAM/);
  assert.deepEqual(chunks, ["partial"]); assert.equal(calls, 1);
  globalThis.fetch = async () => sse([{ candidates: [{ content: { parts: [{ text: "complete" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } }]);
  const output = []; for await (const item of GeminiGateway.generateStream(request)) output.push(item); assert.equal(output.find(c => c.usage)?.usage?.totalTokens, 5); assert.equal(output.at(-1)?.chunk, "complete");
});
test("deadline cancels underlying body read and prevents a second attempt", async () => {
  let calls = 0, aborted = false; const keepAlive = setInterval(() => undefined, 1000);
  globalThis.fetch = async (_url, options) => { calls++; const signal = options!.signal!; return new Response(new ReadableStream({ start(controller) { signal.addEventListener("abort", () => { aborted = true; controller.error(signal.reason); }, { once: true }); } })); };
  try { await assert.rejects(GeminiGateway.generate({ ...request, deadlineMs: 15 }), /DEADLINE_EXCEEDED/); assert.equal(calls, 1); assert.equal(aborted, true); } finally { clearInterval(keepAlive); }
});
test("native function parts preserve signatures, whitelist and validate tools; no automatic replay", async () => {
  let calls = 0, executions = 0; globalThis.fetch = async (_url, options) => { calls++; const body = JSON.parse(String(options?.body)); if (calls === 1) return Response.json({ candidates: [{ content: { parts: [{ thoughtSignature: "opaque-signature", functionCall: { name: "read_record", args: { id: "one" }, id: "call-1" } }] }, finishReason: "STOP" }] }); assert.equal(body.contents[1].parts[0].thoughtSignature, "opaque-signature"); assert.equal(body.contents[2].parts[0].functionResponse.id, "call-1"); return jsonText("tool-backed answer"); };
  const answer = await GeminiGateway.generateWithTools(request, [{ name: "read_record", description: "Read a fixture", parameters: { type: "object" }, validate: args => { assert.deepEqual(args, { id: "one" }); return args; }, execute: async () => { executions++; return { value: "evidence" }; } }]);
  assert.equal(answer.text, "tool-backed answer"); assert.equal(executions, 1); assert.equal(calls, 2);
});
test("TTS uses shared policy, strict metadata and actual WAV; partial PCM does not fallback", async () => {
  const wav = Buffer.alloc(100); wav.write("RIFF"); wav.write("WAVE", 8); let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; const payload = JSON.parse(String(options?.body)); assert.equal(payload.store, false); assert.equal(payload.input[0].content[0].text, ttsInput.text); assert.equal(payload.input[0].content[0].annotations[0].type, "speech_metadata"); return Response.json({ status: "completed", steps: [{ content: [{ type: "audio", data: wav.toString("base64"), mime_type: "audio/wav" }] }] }); };
  await assert.rejects(TtsService.synthesize(ttsInput), /DATA_POLICY_BLOCKED/); assert.equal(calls, 0);
  const audio = await TtsService.synthesize(ttsInput, { classification: "SYNTHETIC" }); assert.equal(audio.audio.mimeType, "audio/wav"); assert.equal(audio.audio.sizeBytes, 100);
  calls = 0; globalThis.fetch = async () => { calls++; return sse([{ event_type: "content.delta", delta: { type: "audio", data: "AQIDBA==", mime_type: "audio/l16" } }]); };
  await assert.rejects(async () => { for await (const _ of TtsService.streamSynthesis(ttsInput, { classification: "SYNTHETIC" })) {} }, /PARTIAL_STREAM/); assert.equal(calls, 1);
});
test("STT enforces feature compatibility, returns genuine annotations and embedding normalization", async () => {
  assert.equal(transcribeSchema.safeParse({ audioBase64: "AAAA", mimeType: "audio/wav", mode: "smart", timestamps: true }).success, false);
  assert.equal(transcribeSchema.safeParse({ audioBase64: "AAAA", mimeType: "audio/wav", customVocabulary: ["Waseet"], diarization: true }).success, false);
  globalThis.fetch = async (_url, options) => { const body = JSON.parse(String(options?.body)); assert.deepEqual(body.generation_config.transcription_config.mode, { type: "verbatim", timestamp_granularities: ["word"] }); return Response.json({ status: "completed", output_text: "actual words", steps: [{ content: [{ type: "text", annotations: [{ type: "word_info", text: "actual", start_offset: "0s", end_offset: "1s" }] }] }] }); };
  const transcript = await VoiceGateway.transcribe({ audioBase64: "AAAA", mimeType: "audio/wav", timestamps: true, classification: "SYNTHETIC" }); assert.equal(transcript.text, "actual words"); assert.equal(transcript.words.length, 1);
  globalThis.fetch = async () => Response.json({ embedding: { values: Array(768).fill(1) } }); const embedded = await embedText({ text: "synthetic", classification: "SYNTHETIC" }); assert.equal(embedded.vector.length, 768); assert.ok(Math.abs(embedded.vector.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-8);
});
test("Live requires explicit enablement and returns constrained one-use token, wsUrl and setup", async () => {
  delete process.env.WASEET_AI_ENABLE_LIVE; await assert.rejects(VoiceGateway.liveToken({ classification: "SYNTHETIC" }, "fixture-owner"), /LIVE_DISABLED/);
  process.env.WASEET_AI_ENABLE_LIVE = "true";
  globalThis.fetch = async (url, options) => { assert.ok(String(url).endsWith("/auth_tokens")); const body = JSON.parse(String(options?.body)); assert.equal(body.uses, 1); assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.8-live"); assert.equal(body.bidiGenerateContentSetup.generationConfig.thinkingConfig, undefined); return Response.json({ name: "short-lived-test-token" }); };
  try { const live = await VoiceGateway.liveToken({ classification: "SYNTHETIC" }, "fixture-owner"); assert.equal(new URL(live.wsUrl).searchParams.get("access_token"), live.token); assert.equal(live.sessionConfig.setup.generationConfig.responseModalities[0], "AUDIO"); await assert.rejects(VoiceGateway.liveToken({ classification: "SYNTHETIC" }, "fixture-owner"), /SESSION_ACTIVE/); } finally { delete process.env.WASEET_AI_ENABLE_LIVE; }
});
test("durable DAG validates cycles, checkpoints dependencies, binds tenant/actor, enforces idempotency and cancellation", async () => {
  assert.throws(() => validateTaskPlan({ goal: "x", nodes: [{ id: "a", role: "planner", prompt: "x", dependencies: ["b"] }, { id: "b", role: "reviewer", prompt: "x", dependencies: ["a"] }] }), /CYCLIC/);
  const runtime = new TaskRuntime(), scope = { tenantId: "tenant-one", userId: "user-one" }, plan = { goal: "synthetic task", classification: "SYNTHETIC", nodes: [{ id: "plan", role: "planner", prompt: "plan", dependencies: [] }, { id: "review", role: "reviewer", prompt: "review", dependencies: ["plan"] }] };
  let calls = 0; globalThis.fetch = async () => { calls++; return jsonText("synthetic evidence"); };
  try { const created = runtime.create(scope, plan, "same-idempotency-key"); assert.equal(runtime.create(scope, plan, "same-idempotency-key").id, created.id); assert.throws(() => runtime.create(scope, { ...plan, goal: "different" }, "same-idempotency-key"), /CONFLICT/);
    await waitFor(() => runtime.store.get(scope, created.id)?.status === "COMPLETED"); const completed = runtime.store.get(scope, created.id)!; assert.equal(completed.apiCalls, 2); assert.equal(calls, 2); assert.equal(completed.verification, "MODEL_OUTPUT_ONLY"); assert.equal(runtime.store.get({ ...scope, userId: "other-user" }, created.id), undefined);
    const reopened = new TaskStore(); assert.equal(reopened.get(scope, created.id)?.nodes.review?.status, "COMPLETED"); reopened.db.close();
    globalThis.fetch = async (_url, options) => new Response(new ReadableStream({ start(controller) { options!.signal!.addEventListener("abort", () => controller.error(options!.signal!.reason), { once: true }); } }));
    const pending = runtime.create(scope, plan, "cancelled-key"); runtime.cancel(scope, pending.id); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(runtime.store.get(scope, pending.id)?.status, "CANCELLED"); assert.equal(runtime.store.get(scope, pending.id)?.nodes.plan?.text, undefined);
  } finally { runtime.stop(); }
});
test("HTTP gateway rejects anonymous requests, accepts platform JSON schema, and public Bebo keeps local commands only", async () => {
  const app = buildApp(); GeminiGateway.setMockHandler(async () => '{"answer":"fixture"}');
  const issued = TenantAuthService.issue({ clientId: "test-client", clientSecret: process.env.WASEET_AI_CLIENT_SECRET, environment: "dev", actor: { userId: "fixture-user", role: "client" } });
  try { assert.equal((await app.inject({ method: "GET", url: "/v1/ai/capabilities" })).statusCode, 401);
    const generated = await app.inject({ method: "POST", url: "/v1/ai/gateway/generate", headers: { authorization: `Bearer ${issued.token}` }, payload: { system: "fixture", user: "fixture", maxOutputTokens: 100, effort: "medium", profile: "analyst", feature: "fixture", responseFormat: "json", classification: "SYNTHETIC" } }); assert.equal(generated.statusCode, 200); assert.equal(generated.json().data.tokensIn, null); assert.equal(generated.json().data.measured, false);
    const command = await app.inject({ method: "POST", url: "/v1/bebo/chat", payload: { message: "ارقص" } }); assert.equal(command.statusCode, 200); assert.equal(command.json().source, "command");
    const arbitrary = await app.inject({ method: "POST", url: "/v1/bebo/chat", payload: { message: "Analyze my private account statement" } }); assert.equal(arbitrary.statusCode, 401); assert.equal(arbitrary.json().error.code, "BEBO_AUTH_REQUIRED");
    assert.equal((await app.inject({ method: "GET", url: "/v1/ai/tts/speak?text=private", headers: { authorization: `Bearer ${issued.token}` } })).statusCode, 404);
  } finally { await app.close(); }
});
test("runs adapter is idempotent and actor-scoped; cancellation persists before further checkpoints", async () => {
  const app = buildApp(); let calls = 0; const keepAlive = setInterval(() => undefined, 1000);
  globalThis.fetch = async (_url, options) => { calls++; return new Response(new ReadableStream({ start(controller) { options!.signal!.addEventListener("abort", () => controller.error(options!.signal!.reason), { once: true }); } })); };
  const tokenFor = (userId: string) => TenantAuthService.issue({ clientId: "test-client", clientSecret: process.env.WASEET_AI_CLIENT_SECRET, environment: "dev", actor: { userId, role: "client" } }).token;
  const headers = { authorization: `Bearer ${tokenFor("run-owner")}` }, payload = { question: "Synthetic bounded workflow", idempotencyKey: "run-idempotency-key", classification: "SYNTHETIC" };
  try { const first = await app.inject({ method: "POST", url: "/v1/ai/runs", headers, payload }); assert.equal(first.statusCode, 202); const runId = first.json().data.runId; assert.ok(runId);
    const duplicate = await app.inject({ method: "POST", url: "/v1/ai/runs", headers, payload }); assert.equal(duplicate.json().data.runId, runId);
    const foreign = await app.inject({ method: "GET", url: `/v1/ai/runs/${runId}`, headers: { authorization: `Bearer ${tokenFor("foreign-user")}` } }); assert.equal(foreign.statusCode, 404);
    const canceled = await app.inject({ method: "POST", url: `/v1/ai/runs/${runId}/cancel`, headers }); assert.equal(canceled.json().data.status, "CANCELLED"); await new Promise(resolve => setTimeout(resolve, 25));
    const events = await app.inject({ method: "GET", url: `/v1/ai/runs/${runId}/events?after=0`, headers }); assert.equal(events.json().data.status, "CANCELLED"); assert.ok(events.json().data.events.some((event: any) => event.type === "task_cancelled")); assert.equal(calls, 1);
  } finally { clearInterval(keepAlive); await app.close(); }
});
async function waitFor(check: () => boolean) { const until = Date.now() + 3000; while (!check()) { if (Date.now() > until) throw new Error("TEST_TIMEOUT"); await new Promise(resolve => setTimeout(resolve, 10)); } }
