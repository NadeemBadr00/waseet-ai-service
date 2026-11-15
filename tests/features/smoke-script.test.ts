import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// The smoke script is exercised against a REAL listening instance of this branch (model + provider mocked): the script must pass here, and it must FAIL when the service misbehaves.
const nodeFetch = globalThis.fetch; // captured before the fixtures replace fetch with a network guard
const { buildApp, paidFixture, GeminiGateway } = await import("../helpers/ai-fixtures.js");
const { domainModel } = await import("../helpers/domain-fixtures.js");
const { runSmoke } = await import("../../scripts/smoke-ai-contract.mjs");

describe("scripts/smoke-ai-contract.mjs", () => {
  const app = buildApp();
  let baseUrl = "";
  const creds = { clientId: "test-client", clientSecret: "test-client-secret-32-characters-long", environment: "dev" };
  before(async () => {
    paidFixture();
    await app.ready();
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    GeminiGateway.setMockHandler(async (req) => {
      const input = (() => { try { return JSON.parse(req.prompt); } catch { return {}; } })();
      if (req.featureId === "AI-07-ACCREDITATION-DECLARED-REVIEW") return JSON.stringify({ feedbackAr: "وصف واضح ومكتمل", strengths: ["وصف مرتب"], recommendations: ["أرفق ملفات"] });
      if (req.featureId === "AI-07-ACCREDITATION-REVIEW") {
        const excerpt: string = input.evidence?.[0]?.excerpt ?? "";
        return JSON.stringify({
          criteria: ["specialtyRelevance", "technicalSubstance", "deliverableCompleteness", "claimConsistency", "presentationClarity"].map((id) => ({ id, score: 80, observation: "ملاحظة مبنية على الملف" })),
          feedbackAr: "عمل منظم", findings: excerpt ? [{ source: input.evidence[0].source, quote: excerpt.slice(0, 20), observation: "حساب المجموع" }] : [], recommendations: ["أضف توثيقًا"],
        });
      }
      return domainModel(req);
    });
    // provider calls (TTS / STT) are answered locally; calls to the service under test go out through the captured real fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://127.0.0.1")) return nodeFetch(input as never, init);
      const body = typeof init?.body === "string" ? init.body : "";
      if (url.includes("interactions") && body.includes('"audio"') && body.includes("response_format")) {
        const wav = Buffer.alloc(4000); wav.write("RIFF"); wav.write("WAVE", 8);
        return Response.json({ status: "completed", steps: [{ content: [{ type: "audio", data: wav.toString("base64"), mime_type: "audio/wav" }] }] });
      }
      if (url.includes("interactions")) return Response.json({ status: "completed", output_text: "مرحبا بك في وسيط", steps: [] });
      throw new Error("UNMOCKED_NETWORK_FORBIDDEN " + url);
    }) as typeof fetch;
  });
  after(async () => { GeminiGateway.setMockHandler(null); await app.close(); });

  const run = (extra: Record<string, unknown> = {}) => runSmoke({ baseUrl, ...creds, fetchImpl: nodeFetch, expect: "new", ...extra });

  test("a healthy revision passes every functional check, each result classified (model / computed / fallback)", async () => {
    const summary = await run();
    const failed = summary.results.filter((r: { ok: boolean }) => !r.ok);
    assert.deepEqual(failed, [], JSON.stringify(failed));
    const kinds = new Set(summary.results.map((r: { kind: string }) => r.kind));
    assert.ok(kinds.has("MODEL") && kinds.has("COMPUTED"));
    for (const name of ["bio.enhance", "bio.enhance-alias", "bio.bio-enhance-alias", "budget.alias", "voice.stt-mime-params", "accreditation.with-evidence", "accreditation.no-evidence", "market.recommendations"]) {
      assert.ok(summary.results.some((r: { name: string }) => r.name === name), `${name} ran`);
    }
  });

  test("it never prints the secret or the token", async () => {
    const summary = await run();
    const dump = JSON.stringify(summary);
    assert.equal(dump.includes(creds.clientSecret), false);
    assert.equal(/Bearer\s+\S{20,}/.test(dump), false);
  });

  test("a 400 is a failure, not a success: a service that rejects the valid bodies fails the run", async () => {
    const broken = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/ai/profile/bio/enhance")) return Response.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
      return nodeFetch(input as never, init);
    }) as typeof fetch;
    const summary = await runSmoke({ baseUrl, ...creds, fetchImpl: broken, only: ["bio"] });
    assert.ok(summary.failed >= 1);
    assert.equal(summary.results.find((r: { name: string }) => r.name === "bio.enhance").ok, false);
  });

  test("a bad secret stops the run at the token exchange", async () => {
    const summary = await runSmoke({ baseUrl, ...creds, clientSecret: "wrong-secret-wrong-secret-wrong-secret", fetchImpl: nodeFetch });
    assert.equal(summary.results.find((r: { name: string }) => r.name === "auth.token").ok, false);
    assert.equal(summary.results.some((r: { name: string }) => r.name.startsWith("bio")), false);
  });
});
