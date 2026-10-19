import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiGateway, ProjectPoolManager, paidFixture, forbidNetwork } from "../helpers/ai-fixtures.js";
import type { InferenceRequest } from "../../src/router/types.js";

const request = (patch: Partial<InferenceRequest> = {}): InferenceRequest => ({ featureId: "AI-21-HELP-GENERAL", modelTier: "NORMAL", classification: "PERSONAL", prompt: "ما أحدث مصادر تخطيط المشاريع العامة؟", maxOutputTokens: 2000, ...patch });
const answer = "مصدر عام جديد.";
const metadata = () => ({ webSearchQueries: ["public project planning"], groundingChunks: [{ web: { uri: "https://www.example.org/article", title: "A source" } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: Buffer.byteLength(answer), text: answer }, groundingChunkIndices: [0] }] });
const response = (groundingMetadata: unknown = metadata(), parts: unknown[] = [{ text: answer }], finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts }, ...(groundingMetadata === undefined ? {} : { groundingMetadata }) }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 12, totalTokenCount: 25 } });
let calls: Array<{ url: string; body: any }>;
beforeEach(() => { paidFixture(); process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true"; calls = []; GeminiGateway.setMockHandler(null); globalThis.fetch = forbidNetwork; });
afterEach(() => { delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; globalThis.fetch = forbidNetwork; GeminiGateway.setMockHandler(null); });
function provider(factory: () => Response = response): void {
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return factory(); };
}

test("normal generation retains JSON behavior and never adds the search tool", async () => {
  provider(() => response(undefined, [{ text: '{"answer":"A normal draft."}' }]));
  const result = await GeminiGateway.generate(request({ responseJsonSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } }));
  assert.equal(result.text, '{"answer":"A normal draft."}');
  assert.equal(calls[0].body.tools, undefined);
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.equal(result.groundingMetadata, undefined);
});

test("grounding requires a trusted flag and the exact help feature and PERSONAL classification", async () => {
  provider(); delete process.env.WASEET_AI_ENABLE_WEB_SEARCH;
  await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_WEB_SEARCH_DISABLED" });
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "TRUE";
  await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_WEB_SEARCH_DISABLED" });
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true";
  for (const patch of [{ featureId: "AI-21-HELP" }, { classification: "PUBLIC_APPROVED" as const }, { classification: "SYNTHETIC" as const }, { classification: "SENSITIVE" as const }]) await assert.rejects(() => GeminiGateway.generateGrounded(request(patch)), { code: "AI_WEB_SEARCH_DENIED" });
  assert.equal(calls.length, 0);
});

test("grounding requires the existing paid gate and a valid paid daily request budget", async () => {
  provider(); delete process.env.WASEET_AI_ALLOW_PAID;
  await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_WEB_SEARCH_PAID_DISABLED" });
  process.env.WASEET_AI_ALLOW_PAID = "true";
  for (const budget of ["0", "NaN", "100001"]) { process.env.WASEET_AI_PAID_DAILY_REQUEST_BUDGET = budget; await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_WEB_SEARCH_PAID_DISABLED" }); }
  assert.equal(calls.length, 0);
});

test("search rejects private history, structured JSON and excessive input/output before dispatch", async () => {
  provider();
  for (const patch of [{ contents: [{ role: "user" as const, parts: [{ text: "PRIVATE_HISTORY" }] }] }, { responseJsonSchema: { type: "object" } }, { prompt: "a".repeat(6001) }]) await assert.rejects(() => GeminiGateway.generateGrounded(request(patch)), { code: "AI_WEB_SEARCH_CONTEXT_DENIED" });
  await assert.rejects(() => GeminiGateway.generateGrounded(request({ maxOutputTokens: 8193 })), { code: "AI_CONTEXT_LIMIT" });
  assert.equal(calls.length, 0);
});

test("native search transport preserves validated sources and Arabic byte citations without thought text", async () => {
  const prefix = "تمهيد. ", grounding = metadata();
  grounding.groundingSupports[0].segment = { ...grounding.groundingSupports[0].segment, partIndex: 2 } as any;
  (grounding as any).searchEntryPoint = { renderedContent: "<div>Provider attribution</div>" };
  provider(() => response(grounding, [{ thought: true, text: "PRIVATE_THOUGHT" }, { text: prefix }, { text: answer }]));
  let dispatched = 0;
  const result = await GeminiGateway.generateGrounded(request({ onRequest: () => dispatched++ }));
  assert.equal(dispatched, 1); assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^:]+:generateContent$/);
  assert.deepEqual(calls[0].body.tools, [{ google_search: {} }]);
  assert.deepEqual(calls[0].body.contents, [{ role: "user", parts: [{ text: request().prompt }] }]);
  assert.equal(calls[0].body.generationConfig.responseMimeType, undefined);
  assert.equal(result.text, prefix + answer); assert.equal(result.status, "completed");
  assert.equal(result.projectAliasUsed, "paid-fixture");
  assert.deepEqual(result.groundingMetadata?.groundingSupports, [{ segment: { startIndex: Buffer.byteLength(prefix), endIndex: Buffer.byteLength(prefix + answer), text: answer }, groundingChunkIndices: [0] }]);
  assert.deepEqual(result.groundingMetadata?.groundingChunks, grounding.groundingChunks);
  assert.deepEqual(result.groundingMetadata?.webSearchQueries, grounding.webSearchQueries);
  assert.equal(result.groundingMetadata?.searchEntryPoint?.renderedContent, "<div>Provider attribution</div>");
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 12, totalTokens: 25 }); assert.equal(result.usageMeasured, true);
});

test("a provider answer without metadata carries no invented citations or claims of a search", async () => {
  provider(() => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "Hidden thought" }, { text: answer }] } }] }));
  const result = await GeminiGateway.generateGrounded(request());
  assert.equal(result.text, answer); assert.equal(result.groundingMetadata, undefined);
  assert.equal(Object.hasOwn(result, "groundingMetadata"), false);
});

test("provider sources reject executable, credentialed, IP, local and non-web links", async () => {
  for (const uri of ["javascript:alert(1)", "file:///private", "https://user:password@example.org/", "http://127.0.0.1/", "http://10.0.0.1/", "https://[::1]/", "https://localhost/", "https://service.internal/", "https://a.local/", "https://example.org:8080/"]) {
    const grounding = metadata(); grounding.groundingChunks[0].web.uri = uri;
    provider(() => response(grounding));
    await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_INVALID_GROUNDING_METADATA" }, uri);
  }
});

test("grounding validates byte boundaries, source indexes, exact evidence and thought part indexes", async () => {
  const variants: Array<{ metadata: any; parts?: unknown[] }> = [];
  let bad: any = metadata(); bad.groundingSupports[0].groundingChunkIndices = [1]; variants.push({ metadata: bad });
  bad = metadata(); bad.groundingSupports[0].segment.endIndex = 1; variants.push({ metadata: bad });
  bad = metadata(); bad.groundingSupports[0].segment.endIndex = Buffer.byteLength(answer) + 1; variants.push({ metadata: bad });
  bad = metadata(); bad.groundingSupports[0].segment.text = "Invented evidence"; variants.push({ metadata: bad });
  bad = metadata(); bad.groundingSupports[0].segment.partIndex = 0; variants.push({ metadata: bad, parts: [{ thought: true, text: answer }, { text: answer }] });
  for (const variant of variants) { provider(() => response(variant.metadata, variant.parts)); await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_INVALID_GROUNDING_METADATA" }); }
});

test("metadata has bounded sources, queries, supports and attribution content", async () => {
  const variants: any[] = [];
  let bad: any = metadata(); bad.groundingChunks = Array(21).fill(bad.groundingChunks[0]); variants.push(bad);
  bad = metadata(); bad.webSearchQueries = Array(21).fill("query"); variants.push(bad);
  bad = metadata(); bad.groundingSupports = Array(101).fill(bad.groundingSupports[0]); variants.push(bad);
  bad = metadata(); bad.searchEntryPoint = { renderedContent: "x".repeat(64001) }; variants.push(bad);
  for (const grounding of variants) { provider(() => response(grounding)); await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_INVALID_GROUNDING_METADATA" }); }
});

test("grounding never executes custom functions and rejects incomplete public answers", async () => {
  provider(() => response(undefined, [{ text: answer }, { functionCall: { name: "arbitrary_tool", args: {} } }]));
  await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_WEB_SEARCH_TOOL_DENIED" });
  provider(() => response(undefined, [{ text: answer }], "MAX_TOKENS"));
  await assert.rejects(() => GeminiGateway.generateGrounded(request()), { code: "AI_INCOMPLETE_GROUNDED_RESPONSE" });
});

test("search cannot retry or silently replace the provider after a failed request", async () => {
  provider(() => new Response("quota", { status: 429 }));
  await assert.rejects(() => GeminiGateway.generateGrounded(request({ maxAttempts: 8 })), { code: "AI_ATTEMPTS_EXHAUSTED" });
  assert.equal(calls.length, 1);
});

test("caller cancellation reaches the actual provider transport and preserves its reason", async () => {
  const controller = new AbortController(), reason = new Error("USER_CANCELLED_SEARCH"); let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++; const signal = init?.signal!;
    return new Promise<Response>((_resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
  };
  const timer = setTimeout(() => controller.abort(reason), 15);
  try { await assert.rejects(() => GeminiGateway.generateGrounded(request({ signal: controller.signal })), error => error === reason); }
  finally { clearTimeout(timer); }
  assert.equal(requests, 1);
  // Lease release allows a subsequent independent request instead of leaking an active slot.
  provider(); assert.equal((await GeminiGateway.generateGrounded(request())).status, "completed");
});

test("the search request honors a shorter caller deadline", async () => {
  globalThis.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); });
  await assert.rejects(() => GeminiGateway.generateGrounded(request({ deadlineMs: 15 })), { code: "AI_DEADLINE_EXCEEDED" });
  assert.equal(ProjectPoolManager.paidAllowed(), true);
});
