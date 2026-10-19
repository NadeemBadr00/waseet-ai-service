import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { paidFixture, freeFixture, authHeaders, buildApp, forbidNetwork } from "../helpers/ai-fixtures.js";
import { tenantStorage } from "../../src/core/auth/tenant-context.js";
import { FirestoreService, type StoredKnowledgeDoc } from "../../src/core/database/firestore.js";
import { SemanticKnowledgeIndex, chunkKnowledge } from "../../src/core/knowledge/semantic-index.js";
import { MatchingService } from "../../src/features/marketplace/matching.service.js";
import { embedTexts, embeddingText } from "../../src/runtime/voice.js";
import { DurableStore } from "../../src/core/database/durable-store.js";

const context = (role: "admin" | "client" | "provider" = "admin", userId = "owner") => ({ clientId: "test-client", environment: "dev" as const, actor: { userId, role }, requestId: "semantic-fixture", scopes: ["ai:generate", "data:write", "knowledge:write"] });
const document = (id: string, content: string, patch: Partial<StoredKnowledgeDoc> = {}): StoredKnowledgeDoc => ({ documentId: id, title: id, content, version: "1", sourceVersion: 1, locale: "ar", status: "APPROVED", audience: "all", approvedBy: "admin", approvedAt: "2026-10-12T00:00:00Z", createdAt: "2026-10-12T00:00:00Z", ...patch });
const vector = (axis = 0) => Array.from({ length: 768 }, (_, i) => i === axis ? 1 : 0);
let calls: Array<{ path: string; body: any }>;
beforeEach(async () => { paidFixture(); calls = []; delete process.env.WASEET_AI_KNOWLEDGE_SEMANTIC; delete process.env.WASEET_AI_MATCHING_SEMANTIC; await tenantStorage.run(context(), async () => FirestoreService.clear()); globalThis.fetch = forbidNetwork; });
afterEach(() => { delete process.env.WASEET_AI_KNOWLEDGE_SEMANTIC; delete process.env.WASEET_AI_MATCHING_SEMANTIC; globalThis.fetch = forbidNetwork; DurableStore.close(); });
function mockEmbeddings() {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)), path = String(url); calls.push({ path, body });
    if (path.endsWith(":batchEmbedContents")) return Response.json({ embeddings: body.requests.map((request: any) => ({ values: vector(request.content.parts[0].text.includes("unrelated") ? 1 : 0) })) });
    if (path.endsWith(":embedContent")) return Response.json({ embedding: { values: vector() } });
    throw new Error("UNEXPECTED_PROVIDER_ROUTE");
  };
}
test("chunk windows preserve exact source offsets, bounded size, overlap and tail", () => {
  const text = ("A paragraph with evidence.\n\n".repeat(200)) + "FINAL_EVIDENCE";
  const chunks = chunkKnowledge(text, 600, 70);
  assert.ok(chunks.length > 2); assert.equal(chunks[0]?.start, 0); assert.equal(chunks.at(-1)?.end, text.length);
  for (const [i, chunk] of chunks.entries()) { assert.equal(chunk.content, text.slice(chunk.start, chunk.end)); assert.ok(chunk.content.length <= 600); if (i) assert.ok(chunk.start < chunks[i - 1]!.end && chunk.end > chunks[i - 1]!.end); }
  assert.match(chunks.at(-1)!.content, /FINAL_EVIDENCE/);
  assert.throws(() => chunkKnowledge(text, 600, 600), /INVALID_CHUNK_BOUNDS/);
});
test("Embedding 2 uses asymmetric prefixes and validates each synchronous batch independently", async () => {
  mockEmbeddings();
  assert.equal(embeddingText("find", "RETRIEVAL_QUERY"), "task: search result | query: find");
  const output = await embedTexts({ texts: Array(17).fill("Actual policy"), title: "Policy", classification: "INTERNAL", purpose: "RETRIEVAL_DOCUMENT" });
  assert.equal(output.vectors.length, 17); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.body.requests.every((r: any) => r.content.parts[0].text === "title: Policy | text: Actual policy")));
  globalThis.fetch = async () => Response.json({ embeddings: [{ values: vector() }] });
  await assert.rejects(() => embedTexts({ texts: ["one", "two"], classification: "INTERNAL" }), { code: "AI_EMBEDDING_INVALID_VECTOR" });
});
test("knowledge semantic index retrieves synonyms, persists across reopen, and invalidates on source updates", async () => {
  process.env.WASEET_AI_KNOWLEDGE_SEMANTIC = "true"; mockEmbeddings();
  await tenantStorage.run(context(), async () => {
    await FirestoreService.upsertKnowledge(document("shop", "Shopify ecommerce support"));
    await FirestoreService.upsertKnowledge(document("unrelated", "unrelated recipes"));
    const first = await FirestoreService.searchApprovedKnowledgeWithMode("متاجر إلكترونية");
    assert.equal(first.retrievalMode, "hybrid"); assert.deepEqual(first.documents.map(doc => doc.documentId), ["shop"]);
    assert.ok(calls.some(call => call.body.requests?.some((r: any) => r.content.parts[0].text.startsWith("title: shop | text: "))));
    const count = calls.length; DurableStore.close();
    await FirestoreService.searchApprovedKnowledgeWithMode("متاجر إلكترونية"); assert.equal(calls.length, count + 1);
    const revised = document("shop", "Revised Shopify policy", { sourceVersion: 2, version: "2" });
    await FirestoreService.upsertKnowledge(revised); assert.equal(SemanticKnowledgeIndex.read(revised, "gemini-embedding-2"), undefined);
    await FirestoreService.searchApprovedKnowledgeWithMode("متاجر إلكترونية"); assert.equal(calls.length, count + 3);
    await FirestoreService.deleteKnowledge("shop"); assert.equal(SemanticKnowledgeIndex.read(revised, "gemini-embedding-2"), undefined);
  });
});
test("knowledge search accepts readers, ignores audience escalation, and omits vectors and private documents", async () => {
  await tenantStorage.run(context(), async () => {
    await FirestoreService.upsertKnowledge(document("visible", "escrow policy"));
    await FirestoreService.upsertKnowledge(document("admin", "escrow secret", { audience: "admin" }));
    await FirestoreService.upsertKnowledge(document("other-owner", "escrow private", { ownerId: "another-user" }));
    await FirestoreService.upsertKnowledge(document("draft", "escrow draft", { status: "DRAFT" }));
  });
  const app = buildApp();
  try {
    const result = await app.inject({ method: "POST", url: "/v1/knowledge/search", headers: authHeaders("owner", "client"), payload: { query: "escrow", audience: "admin" } });
    assert.equal(result.statusCode, 200); const data = result.json().data; assert.equal(data.retrievalMode, "lexical"); assert.deepEqual(data.documents.map((doc: any) => doc.documentId), ["visible"]);
    assert.equal(data.documents[0].embedding, undefined); assert.equal(data.documents[0].embeddingChunks, undefined); assert.equal(data.documents[0].ownerId, undefined);
    const denied = await app.inject({ method: "POST", url: "/v1/knowledge/documents/delete", headers: authHeaders("owner", "client"), payload: { documentId: "visible" } }); assert.equal(denied.statusCode, 403);
  } finally { await app.close(); }
});
test("free-only policy prevents private query/profile transmission and returns explicit lexical fallback", async () => {
  freeFixture(); process.env.WASEET_AI_KNOWLEDGE_SEMANTIC = "true"; process.env.WASEET_AI_MATCHING_SEMANTIC = "true";
  let attempted = 0; globalThis.fetch = async () => { attempted++; throw new Error("PRIVATE_DATA_MUST_NOT_BE_SENT"); };
  await tenantStorage.run(context(), async () => {
    await FirestoreService.upsertKnowledge(document("policy", "escrow policy"));
    const knowledge = await FirestoreService.searchApprovedKnowledgeWithMode("escrow"); assert.equal(knowledge.retrievalMode, "lexical"); assert.equal(knowledge.documents.length, 1);
    const result = await MatchingService.matchProjectsForProvider({ provider: { skills: ["Shopify"], specialties: [] }, candidates: [{ id: "shop", title: "Shopify store", description: "", requirements: [] }], limit: 5 });
    assert.equal(result.summary.matchingMode, "lexical_fallback"); assert.equal(result.summary.fallbackReason, "SEMANTIC_UNAVAILABLE"); assert.equal(result.aiMatchingProjects[0]?.generationSource, "DETERMINISTIC"); assert.equal(result.aiMatchingProjects[0]?.aiMatchScore, null);
  }); assert.equal(attempted, 0);
});
test("semantic matching finds projects without keyword overlap, obeys hard constraints and keeps quality scores null", async () => {
  process.env.WASEET_AI_MATCHING_SEMANTIC = "true"; mockEmbeddings();
  await tenantStorage.run(context("provider"), async () => {
    const result = await MatchingService.matchProjectsForProvider({ provider: { skills: ["Shopify"], specialties: [] }, limit: 5, constraints: { budgetMax: 1000 }, candidates: [
      { id: "shop", title: "متجر إلكتروني", description: "Build ecommerce", requirements: [], budget: 500 },
      { id: "wrong", title: "unrelated", description: "unrelated recipes", requirements: [], budget: 500 },
      { id: "closed", title: "CLOSED_SENTINEL", description: "", requirements: [], budget: 500, isOpen: false },
      { id: "costly", title: "COSTLY_SENTINEL", description: "", requirements: [], budget: 2000 },
    ] });
    assert.deepEqual(result.aiMatchingProjects.map(item => item.projectId), ["shop"]); assert.equal(result.summary.matchingMode, "semantic"); assert.equal(result.aiMatchingProjects[0]?.generationSource, "SEMANTIC_EMBEDDING"); assert.equal(result.aiMatchingProjects[0]?.aiMatchScore, null); assert.equal(result.aiMatchingProjects[0]?.retrievalSimilarity, 1);
    const sent = JSON.stringify(calls); assert.ok(!sent.includes("CLOSED_SENTINEL") && !sent.includes("COSTLY_SENTINEL"));
  });
});
test("cancellation is propagated rather than converted to a lexical fallback", async () => {
  process.env.WASEET_AI_KNOWLEDGE_SEMANTIC = "true"; process.env.WASEET_AI_MATCHING_SEMANTIC = "true";
  const controller = new AbortController(), reason = Object.assign(new Error("cancelled"), { code: "CANCELLED" }); controller.abort(reason);
  await tenantStorage.run({ ...context(), signal: controller.signal }, async () => {
    await assert.rejects(() => FirestoreService.searchApprovedKnowledgeWithMode("escrow"), error => error === reason);
    await assert.rejects(() => MatchingService.matchProjectsForProvider({ provider: { skills: ["Shopify"], specialties: [] }, candidates: [{ id: "shop", title: "Store", description: "", requirements: [] }], limit: 5 }), error => error === reason);
  });
});
test("a real transport failure preserves approved lexical retrieval instead of hiding policies", async () => {
  process.env.WASEET_AI_KNOWLEDGE_SEMANTIC = "true";
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await tenantStorage.run(context(), async () => {
    await FirestoreService.upsertKnowledge(document("policy", "escrow policy"));
    const result = await FirestoreService.searchApprovedKnowledgeWithMode("escrow");
    assert.equal(result.retrievalMode, "lexical"); assert.deepEqual(result.documents.map(doc => doc.documentId), ["policy"]);
    assert.equal(SemanticKnowledgeIndex.read(document("policy", "escrow policy"), "gemini-embedding-2"), undefined);
  });
});
