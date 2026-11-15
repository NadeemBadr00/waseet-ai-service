import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { authHeaders, buildApp, paidFixture, GeminiGateway, forbidNetwork } from "../helpers/ai-fixtures.js";
import type { InferenceRequest } from "../../src/router/types.js";
import { numbersStatedIn, ProfileMetricsService } from "../../src/features/providers/profile-metrics.service.js";
import { AccreditationService, ACCREDITATION_RUBRIC } from "../../src/features/providers/accreditation.service.js";
import { MarketplaceService } from "../../src/features/marketplace/marketplace.service.js";
import { transcribeSchema, liveTokenSchema } from "../../src/runtime/voice.js";
import { TtsSynthesizeInputSchema } from "../../src/features/tts/tts.types.js";
import { normalizeSpeechStructure } from "../../src/features/tts/tts.service.js";

describe("AI integration review fixes", () => {
  const app = buildApp();
  before(async () => { paidFixture(); await app.ready(); });
  beforeEach(() => { paidFixture(); globalThis.fetch = forbidNetwork; });
  after(() => { GeminiGateway.setMockHandler(null); });

  test("the app starts: every identity route is registered once, by the original identity service (no second, model-written comparison)", async () => {
    const routes = app.printRoutes({ commonPrefix: false });
    for (const path of ["identity/compare-fields", "identity/inspect-document", "identity-document-check"]) {
      assert.equal(routes.split(path).length - 1, 1, `${path} must be registered exactly once`);
    }
    const alias = await app.inject({ method: "POST", url: "/v1/ai/identity-document-check", headers: authHeaders("p1", "provider"), payload: {} });
    const original = await app.inject({ method: "POST", url: "/v1/ai/identity/inspect-document", headers: authHeaders("p1", "provider"), payload: {} });
    assert.equal(alias.statusCode, original.statusCode, "the alias answers exactly like the original route");
    assert.ok(alias.statusCode >= 400 && alias.statusCode < 500);
  });

  test("bio facts: 'سنتين' and 2 are the same fact, a 99-year claim is refused, number WORDS cannot smuggle a number either", async () => {
    assert.deepEqual([...numbersStatedIn("خبرة سنتين في التصميم")], [2]);
    assert.deepEqual([...numbersStatedIn("٢٠ مشروعًا")], [20]);
    assert.deepEqual([...numbersStatedIn("تسعة وتسعين")].sort((a, b) => a - b), [9, 90]);
    const call = async (modelBio: string, source: string) => {
      GeminiGateway.setMockHandler(async () => JSON.stringify({ suggestedBio: modelBio }));
      return ProfileMetricsService.enhanceBio({ providerId: "p", bio: source, specialties: [], subSpecialties: [], maxLength: 500 } as never);
    };
    await assert.rejects(call("مصمم محترف بخبرة 99 سنة في الهوية البصرية", "مصمم جرافيك لدي خبرة سنتين في الهوية البصرية"), /AI_UNGROUNDED|رقم غير موثق/);
    await assert.rejects(call("مصمم محترف بخبرة تسعة وتسعين سنة في الهوية البصرية", "مصمم جرافيك لدي خبرة سنتين في الهوية البصرية"), /AI_UNGROUNDED|رقم غير موثق/);
    const ok = await call("مصمم جرافيك بخبرة سنتين في الهوية البصرية.", "مصمم جرافيك لدي خبرة سنتين في الهوية البصرية");
    assert.match(ok.suggestedBio, /سنتين/);
    const ok2 = await call("مصمم جرافيك بخبرة 2 سنة في الهوية البصرية.", "مصمم جرافيك لدي خبرة سنتين في الهوية البصرية");
    assert.match(ok2.suggestedBio, /2/);
  });

  test("bio suggest: the stated years are the only years the output may claim", async () => {
    GeminiGateway.setMockHandler(async () => JSON.stringify({ suggestedBio: "مطور ويب بخبرة 15 سنة في بناء المتاجر." }));
    await assert.rejects(ProfileMetricsService.suggestBio({ providerId: "p", specialties: ["تطوير مواقع"], yearsOfExperience: 2, keyAchievements: [], maxLength: 400 } as never), /AI_UNGROUNDED|رقم غير موثق/);
  });

  test("voice: MIME types with parameters and mp4 are accepted; the Saudi dialect is the default for speech and the live session", () => {
    const base = { audioBase64: Buffer.from("fake-audio-bytes").toString("base64") };
    assert.equal(transcribeSchema.parse({ ...base, mimeType: "audio/webm;codecs=opus" }).mimeType, "audio/webm");
    assert.equal(transcribeSchema.parse({ ...base, mimeType: "Audio/MP4; codecs=mp4a.40.2" }).mimeType, "audio/mp4");
    assert.throws(() => transcribeSchema.parse({ ...base, mimeType: "video/mp4" }));
    assert.equal(TtsSynthesizeInputSchema.parse({ text: "مرحبا" }).dialect, "saudi");
    assert.equal(liveTokenSchema.parse({}).language, "ar-SA");
    assert.equal(normalizeSpeechStructure("## عنوان\n- **نقطة** [رابط](https://x.y) و1/2"), "عنوان نقطة رابط و1/2");
  });

  test("voice recovery: when the dedicated transcription model fails, the earlier fallback model path still transcribes", async () => {
    const { VoiceGateway } = await import("../../src/runtime/voice.js");
    const seen: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = String(url); seen.push(target);
      if (target.includes("interactions")) return new Response("boom", { status: 500 });
      return Response.json({ candidates: [{ content: { parts: [{ text: "نص مفرغ" }] }, finishReason: "STOP" }] });
    }) as typeof fetch;
    const out = await VoiceGateway.transcribe({ audioBase64: Buffer.from("fake-audio-bytes").toString("base64"), mimeType: "audio/webm;codecs=opus" });
    assert.equal(out.text, "نص مفرغ");
    assert.ok(seen.some(target => target.includes("generateContent")), "the fallback generateContent path was used");
  });

  test("accreditation without readable evidence: no score, no rating, a plain 'could not read' message, human review final — a description's clarity is never a quality score", async () => {
    GeminiGateway.setMockHandler(async () => JSON.stringify({ feedbackAr: "وصف مرتب وتقنيات واضحة", strengths: ["وصف واضح"], recommendations: ["أرفق ملفات"] }));
    const out = await AccreditationService.evaluateAccreditation("s1", "متجر", undefined, ["React"], "متجر إلكتروني كامل بواجهة ولوحة تحكم وبوابة دفع", undefined, { specialtyName: "تطوير مواقع", unreadAttachments: ["proof.zip"] });
    assert.equal(out.aiScore, null);
    assert.equal(out.aiQualityRating, null);
    assert.equal(out.evaluation.aiScore, null);
    assert.equal(out.humanReviewRequired, true);
    assert.equal(out.inspected, false);
    assert.match(out.feedback!.summary, /تعذّر قراءة الأدلة/);
    assert.match(out.feedback!.summary, /للمراجعة البشرية/);
    assert.ok(out.evidenceMissing!.some(item => item.includes("proof.zip")));
    assert.notEqual(out.sample.status, "AI_VERIFIED");
  });

  test("accreditation with the user's own attachment: its content is read and sent, the weighted total is computed by the server (the model's own total is ignored), ungrounded quotes are refused", async () => {
    const text = "function checkout(cart) { return cart.items.reduce((s, i) => s + i.price * i.qty, 0); }\n// unit tests for discounts and tax";
    const dataUri = `data:text/plain;base64,${Buffer.from(text).toString("base64")}`;
    let prompt: Record<string, unknown> = {};
    const scores: Record<string, number> = { specialtyRelevance: 90, technicalSubstance: 80, deliverableCompleteness: 70, claimConsistency: 60, presentationClarity: 50 };
    const answer = (quote: string) => JSON.stringify({
      aiScore: 100, clarityScore: 100,
      criteria: ACCREDITATION_RUBRIC.criteria.map(c => ({ id: c.id, score: scores[c.id], observation: "ملاحظة مبنية على الملف" })),
      feedbackAr: "عمل منظم", findings: [{ source: "", quote, observation: "حساب مجموع السلة" }], recommendations: ["أضف توثيقًا"],
    });
    let sourceName = "";
    GeminiGateway.setMockHandler(async (req: InferenceRequest) => { prompt = JSON.parse(req.prompt); sourceName = (prompt.evidence as Array<{ source: string }>)[0]!.source; return answer("cart.items.reduce").replace('"source":""', `"source":${JSON.stringify(sourceName)}`); });
    const out = await AccreditationService.evaluateAccreditation("s2", "نظام سلة", undefined, ["TypeScript"], "سلة شراء", undefined, { attachments: [dataUri], specialtyName: "تطوير مواقع" });
    assert.ok(Array.isArray(prompt.evidence) && (prompt.evidence as unknown[]).length === 1, "the attachment content reached the model");
    assert.equal(prompt.specialtyName, "تطوير مواقع");
    assert.equal(out.inspected, true);
    // 0.30*90 + 0.25*80 + 0.20*70 + 0.15*60 + 0.10*50 = 27 + 20 + 14 + 9 + 5 = 75
    assert.equal(out.aiScore, 75);
    assert.equal(out.aiQualityRating, "Good");
    assert.equal(out.rubric!.criteria.reduce((sum, c) => sum + c.weight, 0), 100);
    assert.equal(out.humanReviewRequired, true);
    GeminiGateway.setMockHandler(async () => answer("هذا اقتباس غير موجود في الملف").replace('"source":""', `"source":${JSON.stringify(sourceName)}`));
    await assert.rejects(AccreditationService.evaluateAccreditation("s3", "نظام سلة", undefined, [], "سلة شراء", undefined, { attachments: [dataUri] }), /AI_UNGROUNDED|دليل غير موجود/);
  });

  test("marketplace: a measured term overlap only — no query means no percentage, nothing is floored/capped, the category is compared by id (never by an Arabic name)", async () => {
    const candidates = [
      { id: "a", title: "تصميم شعار احترافي", description: "هوية بصرية", category: "design", categoryLabel: "التصميم", subSpecialty: "logo" },
      { id: "b", title: "برمجة متجر", description: "متجر إلكتروني", category: "web", categoryLabel: "تطوير المواقع" },
    ];
    const withQuery = await MarketplaceService.getRecommendations({ query: "تصميم شعار", limit: 5, candidates } as never);
    assert.equal(withQuery.items[0]!.id, "a");
    assert.equal(withQuery.items[0]!.matchScore, 100);
    assert.equal(withQuery.items[0]!.scoreBasis, "QUERY_TERM_OVERLAP");
    const noQuery = await MarketplaceService.getRecommendations({ query: "", limit: 5, candidates } as never);
    assert.ok(noQuery.items.every(item => item.matchScore === null && item.scoreBasis === "NONE"), "no query: nothing was measured, so no percentage is invented");
    const byId = await MarketplaceService.getRecommendations({ query: "", category: "web", limit: 5, candidates } as never);
    assert.deepEqual(byId.items.map(item => item.id), ["b"]);
    const byArabicName = await MarketplaceService.getRecommendations({ query: "", category: "تطوير المواقع", limit: 5, candidates } as never);
    assert.deepEqual(byArabicName.items, [], "an Arabic display name is not a category id");
  });

  const reviewAnswer = (excerptFrom: (prompt: any) => string) => async (req: InferenceRequest) => {
    const prompt = JSON.parse(req.prompt);
    const first = prompt.evidence?.[0];
    return JSON.stringify({
      criteria: ACCREDITATION_RUBRIC.criteria.map(c => ({ id: c.id, score: 60, observation: "ملاحظة مبنية على الملف" })),
      feedbackAr: "قراءة جزئية", findings: first ? [{ source: first.source, quote: excerptFrom(first.excerpt), observation: "ملاحظة" }] : [], recommendations: ["أضف توثيقًا"],
    });
  };
  const PDF_BASE64 = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMjAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA5MyA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDEwMCBUZCAoY2hlY2tvdXQgZnVuY3Rpb24gc3VtcyBjYXJ0IGl0ZW0gcHJpY2VzIHdpdGggZGlzY291bnRzIGFuZCB0YXgpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzg0IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDU0CiUlRU9G";

  test("accreditation attachments (synthetic): a readable PDF is read; a corrupt PDF, a corrupt image and an empty file are reported unreadable and never produce a score", async () => {
    GeminiGateway.setMockHandler(reviewAnswer(excerpt => excerpt.slice(0, 18)));
    const readable = await AccreditationService.evaluateAccreditation("a1", "سلة", undefined, [], "سلة شراء", undefined, { attachments: [`data:application/pdf;base64,${PDF_BASE64}`], specialtyName: "تطوير مواقع" });
    assert.equal(readable.inspected, true);
    assert.equal(typeof readable.aiScore, "number");
    assert.ok(readable.evidence!.some(item => item.contentRead && /checkout/.test(item.excerpt)), "the PDF text was really extracted");

    GeminiGateway.setMockHandler(async () => JSON.stringify({ feedbackAr: "وصف", strengths: [], recommendations: [] }));
    for (const bad of [
      `data:application/pdf;base64,${Buffer.from("this is not a pdf at all").toString("base64")}`,
      `data:image/png;base64,${Buffer.from("not-a-png").toString("base64")}`,
      `data:application/pdf;base64,${Buffer.alloc(0).toString("base64")}`,
    ]) {
      const out = await AccreditationService.evaluateAccreditation("a2", "سلة", undefined, [], "متجر إلكتروني كامل بواجهة ولوحة تحكم وبوابة دفع", undefined, { attachments: [bad], specialtyName: "تطوير مواقع" });
      assert.equal(out.aiScore, null, bad.slice(0, 30));
      assert.equal(out.aiQualityRating, null);
      assert.equal(out.humanReviewRequired, true);
      assert.ok(out.evidenceMissing!.length >= 1, "the unreadable file is reported");
      assert.match(out.feedback!.summary, /تعذّر قراءة الأدلة/);
    }
  });

  test("accreditation: a mix of one readable and one corrupt attachment scores only the readable one and says the other could not be read", async () => {
    GeminiGateway.setMockHandler(reviewAnswer(excerpt => excerpt.slice(0, 18)));
    const out = await AccreditationService.evaluateAccreditation("a3", "سلة", undefined, [], "سلة", undefined, { attachments: [`data:application/pdf;base64,${PDF_BASE64}`, `data:application/pdf;base64,${Buffer.from("garbage").toString("base64")}`], unreadAttachments: ["source.zip"] });
    assert.equal(typeof out.aiScore, "number");
    assert.equal(out.evidenceReviewed, 1);
    assert.ok(out.evidenceMissing!.length >= 2, "the corrupt file and the file the website could not pass are both reported");
    assert.match(out.feedback!.summary, /تعذّرت قراءة بعض المصادر/);
  });
});
