import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp, authHeaders, paidFixture, GeminiGateway } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";
import type { FastifyInstance } from "fastify";

describe("Client Meeting Brief Acceptance Tests (waseetai-ai-vendor-meeting.pdf)", () => {
  let app: FastifyInstance;
  let devToken: string;
  before(async () => {
    paidFixture(); GeminiGateway.setMockHandler(domainModel); devToken=authHeaders("client-1").authorization;
    app = buildApp();
    await app.ready();
  });

  after(async () => {
    GeminiGateway.setMockHandler(null); await app.close();
  });

  test("Security: signed current-environment token succeeds and static token fails on protected endpoint", async () => {
    const valid=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:devToken},payload:{title:"valid title"}});assert.equal(valid.statusCode,200);
    const invalid=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:"Bearer deprecated-static-token"},payload:{title:"valid title"}});assert.equal(invalid.statusCode,401);
  });

  test("4.1 Matching: Output IDs come ONLY from candidates, and two different input sets produce two different rankings", async () => {
    // Set 1: React / Frontend Specialist
    const res1 = await app.inject({
      method: "POST",
      url: "/v1/ai/matching/projects-for-provider",
      headers: { authorization: devToken },
      payload: {
        provider: {
          providerId: "provider-actual",
        specialties: ["تطوير واجهات"],
          skills: ["React", "TypeScript", "Tailwind CSS"],
          hourlyRate: 35,
        },
        candidates: [
          {
            id: "proj-python-backend",
            title: "تطوير نظام معالجة بيانات بالبايثون و Django",
            description: "بناء سيرفر خلفي لمعالجة البيانات الكبيرة وقواعد بيانات PostgreSQL",
            requirements: ["Python", "Django", "PostgreSQL"],
            budget: 1500,
          },
          {
            id: "proj-react-frontend",
            title: "بناء لوحة تحكم تفاعلية بـ React و Tailwind",
            description: "تصميم وتنفيذ واجهات المستخدم للوحة الإدارة وربطها بالـ APIs",
            requirements: ["React", "TypeScript", "Tailwind CSS"],
            budget: 800,
          },
        ],
        limit: 5,
      },
    });

    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.body);
    assert.equal(body1.success, true);
    assert.ok(body1.data.aiMatchingProjects.length > 0);
    // Highest ranked must be the React project
    assert.equal(body1.data.aiMatchingProjects[0].projectId, "proj-react-frontend");
    assert.equal(body1.data.aiMatchingProjects[0].aiMatchScore, null);
    // All returned IDs must be from the candidates
    const validIds1 = new Set(["proj-python-backend", "proj-react-frontend"]);
    for (const match of body1.data.aiMatchingProjects) {
      assert.ok(validIds1.has(match.projectId), `Unexpected ID ${match.projectId}`);
    }

    // Set 2: Python / Data Engineer
    const res2 = await app.inject({
      method: "POST",
      url: "/v1/ai/matching/projects-for-provider",
      headers: { authorization: devToken },
      payload: {
        provider: {
          providerId: "provider-actual",
        specialties: ["هندسة بيانات"],
          skills: ["Python", "Django", "PostgreSQL"],
          hourlyRate: 50,
        },
        candidates: [
          {
            id: "proj-react-frontend",
            title: "بناء لوحة تحكم تفاعلية بـ React و Tailwind",
            description: "تصميم وتنفيذ واجهات المستخدم للوحة الإدارة وربطها بالـ APIs",
            requirements: ["React", "TypeScript", "Tailwind CSS"],
            budget: 800,
          },
          {
            id: "proj-python-backend",
            title: "تطوير نظام معالجة بيانات بالبايثون و Django",
            description: "بناء سيرفر خلفي لمعالجة البيانات الكبيرة وقواعد بيانات PostgreSQL",
            requirements: ["Python", "Django", "PostgreSQL"],
            budget: 1500,
          },
        ],
        limit: 5,
      },
    });

    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.equal(body2.success, true);
    // For Python specialist, the python project must rank #1
    assert.equal(body2.data.aiMatchingProjects[0].projectId, "proj-python-backend");
    assert.equal(body2.data.aiMatchingProjects[0].aiMatchScore, null);
  });

  test("4.2 Bio suggestion: One plain-text bio within maxLength without markdown or competing platforms", async () => {
    const maxLength = 250;
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/profile/bio",
      headers: { authorization: devToken },
      payload: {
        providerId: "provider-actual",
        specialties: ["تطوير تطبيقات الموبايل", "Flutter"],
        yearsOfExperience: 5,
        keyAchievements: ["إطلاق 10 تطبيقات على متجر جوجل وبلاي ستور"],
        maxLength,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.suggestedBio);

    const bio = body.data.suggestedBio;
    // Length must be strictly <= maxLength
    assert.ok(bio.length <= maxLength, `Bio length ${bio.length} exceeded ${maxLength}`);
    // No Markdown headers
    assert.ok(!bio.includes("#"), "Bio must not contain markdown headers");
    // No competing platform names
    assert.ok(!/مستقل|خمسات|upwork|freelancer/i.test(bio), "Bio must not name competing platforms");
  });

  test("4.3 Portfolio review: Response must reference samples by their titles", async () => {
    const sampleTitle1 = "منصة التجارة الإلكترونية السريعة";
    const sampleTitle2 = "تطبيق حجز المواعيد الطبية";

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/portfolio/review",
      headers: { authorization: devToken },
      payload: {
        specialtyName: "تطوير تطبيقات الويب",
        samples: [
          {
            title: sampleTitle1,
            description: "متجر متكامل بـ Next.js و Stripe",
            technologies: ["Next.js", "Stripe", "PostgreSQL"],
          },
          {
            title: sampleTitle2,
            description: "تطبيق موبايل للأطباء والمرضى",
            technologies: ["Flutter", "Firebase"],
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.feedback);

    const feedbackText = JSON.stringify(body.data.feedback);
    // Must reference the sample titles
    assert.ok(
      feedbackText.includes(sampleTitle1) || feedbackText.includes(sampleTitle2),
      "Portfolio review must explicitly reference sample titles"
    );
  });

  test("4.4 Accreditation review: When no valid link provided, returns inspected: false, aiScore: null, aiQualityRating: null, and empty strengths", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/accreditation/review",
      headers: { authorization: devToken },
      payload: {
        title: "مشروع بدون رابط مستودع صالح",
        githubUrl: "", // Empty or invalid
        sampleId: "sample-actual",
        technologiesUsed: ["Node.js", "TypeScript"],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.inspected, false);
    assert.equal(body.data.basis, "CONTENT_NOT_INSPECTED");
    assert.equal(body.data.evaluation.aiScore, null);
    assert.equal(body.data.evaluation.aiQualityRating, null);
    assert.deepEqual(body.data.evaluation.strengths, []);
  });

  test("4.5 Proposal suggestion: priceAudit is derived dynamically from project budget", async () => {
    const budgetMin = 1200;
    const budgetMax = 2500;
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/proposals/suggest",
      headers: { authorization: devToken },
      payload: {
        projectId: "proj-erp-system",
        currentTitle: "تنفيذ نظام إدارة المخازن",
        currentMessage: "أستطيع إنجاز النظام وفق المعايير المطلوبة",
        currency: "USD",
        project: {
          title: "نظام ERP سحابي متكامل",
          budgetMin,
          budgetMax,
          requirements: ["إدارة المخازن", "فواتير ضريبية", "تقارير مالية"],
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.priceAudit);

    const audit = body.data.priceAudit;
    // Price audit must not be the hardcoded 200-500, it must be aligned with budgetMin & budgetMax
    assert.ok(
      audit.recommendedMin >= 1000,
      `Expected recommendedMin >= 1000 for budgetMin ${budgetMin}, got ${audit.recommendedMin}`
    );
    assert.ok(
      audit.recommendedMax <= 3000,
      `Expected recommendedMax <= 3000 for budgetMax ${budgetMax}, got ${audit.recommendedMax}`
    );
  });

  test("4.6 Item 2.11c: Request title check endpoint returns isMeaningful, isAligned, reasonAr", async () => {
    // Valid title
    const resValid = await app.inject({
      method: "POST",
      url: "/v1/ai/request-title-check",
      headers: { authorization: devToken },
      payload: {
        title: "تصميم واجهة متجر إلكتروني للهواتف الذكية",
        specialtyName: "تصميم واجهات المستخدم UI/UX",
      },
    });

    assert.equal(resValid.statusCode, 200);
    const bodyValid = JSON.parse(resValid.body);
    assert.equal(bodyValid.success, true);
    assert.equal(typeof bodyValid.data.isMeaningful, "boolean");
    assert.equal(typeof bodyValid.data.isAligned, "boolean");
    assert.equal(typeof bodyValid.data.reasonAr, "string");
    assert.equal(bodyValid.data.isMeaningful, true);

    // Gibberish / empty title
    const resInvalid = await app.inject({
      method: "POST",
      url: "/v1/ai/request-title-check",
      headers: { authorization: devToken },
      payload: {
        title: "asdf",
        specialtyName: "برمجة تطبيقات",
      },
    });

    assert.equal(resInvalid.statusCode, 200);
    const bodyInvalid = JSON.parse(resInvalid.body);
    assert.equal(bodyInvalid.data.isMeaningful, false);
  });
});
