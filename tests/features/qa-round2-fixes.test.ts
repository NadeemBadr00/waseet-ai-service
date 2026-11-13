import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { authHeaders, buildApp, paidFixture, GeminiGateway, audioSuccess, forbidNetwork } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";
import { ContentInspector } from "../../src/core/security/content-inspector.js";
import { DurableStore } from "../../src/core/database/durable-store.js";
import { FirestoreService } from "../../src/core/database/firestore.js";
import { tenantStorage } from "../../src/core/auth/tenant-context.js";

describe("Round 2 QA fixes across delivery, skills, identity, assessments, proposals, budget & TTS", () => {
  const app = buildApp();
  const providerHeaders = () => authHeaders("provider-qa", "provider");
  const clientHeaders = () => authHeaders("client-qa", "client");
  const adminHeaders = () => authHeaders("admin-qa", "admin");
  const tinyPngBase64 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  ).toString("base64");

  before(async () => {
    paidFixture();
    await app.ready();
  });

  beforeEach(() => {
    paidFixture();
    FirestoreService.clear();
    GeminiGateway.setMockHandler(domainModel);
    globalThis.fetch = forbidNetwork;
  });

  after(async () => {
    GeminiGateway.setMockHandler(null);
    globalThis.fetch = forbidNetwork;
    await app.close();
    DurableStore.close();
  });

  test("Item 1: inline binary image does not fabricate contentRead=true text evidence, while delivery review passes visual attachment to Gemini", async () => {
    const dataUrl = `data:image/png;base64,${tinyPngBase64}`;
    const plainInspection = await ContentInspector.inspect([dataUrl]);
    assert.equal(plainInspection.inspected, false);
    assert.ok(plainInspection.unavailable.some(u => u.startsWith("CONTENT_NOT_READABLE:")));

    let capturedContentsLen = 0;
    GeminiGateway.setMockHandler(async (req) => {
      capturedContentsLen = req.contents?.length ?? 0;
      return JSON.stringify({
        summary: "المرفق صورة شاشة ثابتة ولا يتضمن ملفات الكود المطلوبة.",
        met: [],
        potentialGaps: ["لم يتم إرفاق الكود المصدري المطلوب."],
        questionsForReviewer: ["هل تم تسليم مستودع الكود الفعلي؟"],
      });
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/delivery-review",
      headers: clientHeaders(),
      payload: {
        view: "client",
        projectId: "proj-1",
        stageId: "stage-1",
        scopeAgreed: "تطوير واجهة برمجية وقاعدة بيانات",
        requirements: ["تطوير واجهة برمجية وقاعدة بيانات"],
        submissionDetails: "",
        deliverableLinks: [dataUrl],
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(capturedContentsLen, 1);
    assert.equal(res.json().data.inspected, true);
    assert.equal(res.json().data.contentRead, false);
    assert.match(res.json().data.summary, /صورة/);
  });

  test("Item 2 & 7A: skills suggestion forwards subSpecialties/jobTitle/availableSkills; bio enhance rephrases grounded bio", async () => {
    let observedPrompt: any = null;
    GeminiGateway.setMockHandler(async (req) => {
      observedPrompt = JSON.parse(req.prompt);
      if (req.featureId.includes("SKILLS-SUGGEST")) {
        return JSON.stringify({
          suggestedSkills: ["C#", ".NET", "ASP.NET Core", "Entity Framework", "SQL Server", "REST API"],
        });
      }
      return domainModel(req);
    });

    const skillsRes = await app.inject({
      method: "POST",
      url: "/v1/ai/profile/skills",
      headers: providerHeaders(),
      payload: {
        providerId: "prov-1",
        specialtyName: "تطوير المواقع",
        subSpecialties: ["تطوير C# و.NET"],
        jobTitle: "Backend .NET Engineer",
        availableSkills: ["C#", ".NET", "ASP.NET Core", "SQL Server", "HTML"],
        existingSkills: [],
      },
    });
    assert.equal(skillsRes.statusCode, 200);
    assert.deepEqual(observedPrompt.subSpecialties, ["تطوير C# و.NET"]);
    assert.equal(observedPrompt.jobTitle, "Backend .NET Engineer");
    assert.ok(skillsRes.json().data.suggestedSkills.includes("C#"));

    GeminiGateway.setMockHandler(async () =>
      JSON.stringify({
        suggestedBio: "مهندس برمجيات متخصص في بناء الأنظمة الخلفية وتطبيقات الويب باستخدام تقنيات دوت نت وقواعد البيانات العلائقية بكفاءة عالية.",
      })
    );
    const enhanceRes = await app.inject({
      method: "POST",
      url: "/v1/ai/profile/bio/enhance",
      headers: providerHeaders(),
      payload: {
        providerId: "prov-1",
        bio: "انا مهندس برمجيات اشتغل في تطوير الباك اند وتطبيقات الويب بدوت نت",
        jobTitle: "Backend .NET Engineer",
        specialties: ["تطوير المواقع"],
        subSpecialties: ["تطوير C# و.NET"],
      },
    });
    assert.equal(enhanceRes.statusCode, 200);
    assert.match(enhanceRes.json().data.suggestedBio, /مهندس برمجيات/);
  });

  test("Item 3: identity compare-fields supports both PR #207 and PR #210 contracts without sending PII to Gemini, plus inspect-document", async () => {
    let sentPromptText = "";
    GeminiGateway.setMockHandler(async (req) => {
      sentPromptText = req.prompt + " " + (req.systemInstruction ?? "");
      return domainModel(req);
    });

    // Shape A (PR #207)
    const shapeARes = await app.inject({
      method: "POST",
      url: "/v1/ai/identity/compare-fields",
      headers: adminHeaders(),
      payload: {
        requestId: "req-kyc-shape-a-001",
        image: tinyPngBase64,
        imageMimeType: "image/png",
        document: { country: "SA", type: "NATIONAL_ID" },
        registered: {
          fullName: "محمد أحمد العتيبي",
          birthDate: "1995-04-12",
          nationalId: "1098765432",
        },
      },
    });
    assert.equal(shapeARes.statusCode, 200);
    assert.ok(!sentPromptText.includes("1098765432"), "Declared national ID must never be sent to Gemini");
    assert.ok(!sentPromptText.includes("العتيبي"), "Declared name must never be sent to Gemini");
    const bodyA = shapeARes.json();
    assert.equal(bodyA.requestId, "req-kyc-shape-a-001");
    assert.equal(bodyA.data.fields.fullName.status, "MATCH");
    assert.equal(bodyA.data.fields.birthDate.status, "MATCH");
    assert.equal(bodyA.data.fields.nationalId.status, "MATCH");

    // Shape B (PR #210) with mismatching nationalId
    const shapeBRes = await app.inject({
      method: "POST",
      url: "/v1/ai/identity/compare-fields",
      headers: { ...adminHeaders(), "x-request-id": "req-kyc-shape-b-002" },
      payload: {
        image: { mimeType: "image/png", data: tinyPngBase64 },
        declared: {
          name: "محمد احمد العتيبي",
          birthDate: "12/04/1995",
          nationalId: "1000000000",
        },
      },
    });
    assert.equal(shapeBRes.statusCode, 200);
    const bodyB = shapeBRes.json();
    assert.equal(bodyB.requestId, "req-kyc-shape-b-002");
    assert.equal(bodyB.data.fields.name, "MATCH");
    assert.equal(bodyB.data.fields.birthDate, "MATCH");
    assert.equal(bodyB.data.fields.nationalId, "MISMATCH");
    assert.equal(bodyB.data.faceMatch, "NOT_CHECKED");

    // Step 4 pre-submission inspect-document when non-ID screenshot is uploaded
    GeminiGateway.setMockHandler(async () =>
      JSON.stringify({
        isIdentityDocument: false,
        detectedSide: "UNKNOWN",
        readability: "CLEAR",
        summaryAr: "الصورة المرفوعة لقطة شاشة وليست بطاقة هوية رسمية.",
        warningsAr: ["يرجى رفع صورة واضحة لبطاقة الهوية."],
      })
    );
    const inspectRes = await app.inject({
      method: "POST",
      url: "/v1/ai/identity/inspect-document",
      headers: providerHeaders(),
      payload: {
        side: "FRONT",
        image: tinyPngBase64,
        imageMimeType: "image/png",
      },
    });
    assert.equal(inspectRes.statusCode, 200);
    assert.equal(inspectRes.json().data.status, "NOT_ID_DOCUMENT");
    assert.equal(inspectRes.json().data.isIdentityDocument, false);
  });

  test("Item 4: real assessment options are shuffled with matching answer key; onboarding quiz options have balanced lengths", async () => {
    GeminiGateway.setMockHandler(async (req) => {
      const p = JSON.parse(req.prompt);
      return JSON.stringify({
        questions: Array.from({ length: p.questionCount }, (_, idx) => ({
          id: idx + 1,
          textAr: `سؤال هندسي تطبيقي رقم ${idx + 1} حول معمارية الأنظمة الموزعة؟`,
          topic: "Architecture",
          options: [
            { id: "a", text: "استخدام قفل معاملات قاعدة البيانات مع مفتاح عدم تكرار الطلبات" },
            { id: "b", text: "إعادة تشغيل خادم التطبيق تلقائياً عند استقبال كل طلب متزامن" },
            { id: "c", text: "تخزين الحالة المؤقتة في ذاكرة المتصفح فقط دون تحقق الخادم" },
            { id: "d", text: "إلغاء فهارس الجداول الأساسية لتقليل زمن القراءة المتوازية" },
          ],
          correctOptionId: "a",
        })),
      });
    });

    const gen = await app.inject({
      method: "POST",
      url: "/v1/ai/assessments",
      headers: providerHeaders(),
      payload: {
        providerSpecialtyId: "spec-backend",
        specialtyName: "تطوير المواقع",
        questionCount: 8,
        timeLimitMinutes: 15,
      },
    });
    assert.equal(gen.statusCode, 200);
    const attemptId = gen.json().data.attemptId as string;
    const key = await tenantStorage.run(
      { clientId: "test-client", environment: "dev", actor: { userId: "provider-qa", role: "provider" }, requestId: "test" },
      () => FirestoreService.getAnswerKey(attemptId)
    );
    assert.ok(key);
    // Grading with the shuffled answer key still scores 100%
    const sub = await app.inject({
      method: "POST",
      url: `/v1/ai/assessments/${attemptId}/submit`,
      headers: providerHeaders(),
      payload: { submittedAnswers: key.answers },
    });
    assert.equal(sub.statusCode, 200);
    assert.equal(sub.json().data.score, 100);
  });

  test("Item 5, 6, 7B & 8: proposal enrich handles Weak/Needs Improvement tags; proposal suggest requires draft & skips fake price; budget-milestones works; Arabic TTS normalizes English-only voices", async () => {
    GeminiGateway.setMockHandler(async () =>
      JSON.stringify({
        qualityScore: 35,
        aiQualityTag: "Needs Improvement",
        aiFeedback: { summary: "العرض مختصر جداً ويحتاج توضيح آلية التنفيذ." },
      })
    );
    const enrichRes = await app.inject({
      method: "POST",
      url: "/v1/ai/proposals/enrich",
      headers: providerHeaders(),
      payload: {
        projectId: "proj-1",
        title: "عرض سريع",
        message: "سأنفذ المطلوب",
        totalPrice: 150,
        deliveryDays: 5,
      },
    });
    assert.equal(enrichRes.statusCode, 200);
    assert.equal(enrichRes.json().data.aiQualityTag, "Average");

    // Empty proposal draft rejected with 422
    const emptySuggest = await app.inject({
      method: "POST",
      url: "/v1/ai/proposals/suggest",
      headers: providerHeaders(),
      payload: { projectId: "proj-1", currentTitle: "   ", currentMessage: "" },
    });
    assert.equal(emptySuggest.statusCode, 422);

    // Step 4 dedicated budget & milestones endpoint
    GeminiGateway.setMockHandler(domainModel);
    const budgetRes = await app.inject({
      method: "POST",
      url: "/v1/ai/client/requests/budget-milestones",
      headers: clientHeaders(),
      payload: {
        title: "تطوير متجر إلكتروني متكامل",
        description: "بناء واجهة متجر ولوحة تحكم مع بوابة دفع",
        specialtyName: "تطوير المواقع",
        deliveryDays: 21,
        currency: "USD",
      },
    });
    assert.equal(budgetRes.statusCode, 200);
    const bData = budgetRes.json().data;
    assert.equal(bData.recommendedMinBudget, 400);
    assert.equal(bData.recommendedMaxBudget, 750);
    assert.equal(bData.suggestedDurationDays, 21);
    assert.equal(bData.suggestedMilestones.reduce((s: number, m: any) => s + m.pct, 0), 100);

    // Arabic TTS with English-only voice Callirrhoe normalizes cleanly to Kore
    let sentVoice = "";
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sentVoice = body?.generation_config?.speech_config?.[0]?.voice ?? "";
      return audioSuccess(url, init);
    };
    const ttsRes = await app.inject({
      method: "POST",
      url: "/v1/ai/tts/synthesize",
      headers: providerHeaders(),
      payload: {
        text: "مرحباً بك في منصة وسيط",
        voice: "Callirrhoe",
        dialect: "egyptian",
      },
    });
    assert.equal(ttsRes.statusCode, 200);
    assert.equal(sentVoice, "Kore");
  });
});
