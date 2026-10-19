import { paidFixture, forbidNetwork, buildApp, authHeaders, GeminiGateway } from "../helpers/ai-fixtures.js";
import test, { beforeEach, afterEach, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DataSanitizer } from "../../src/core/knowledge/sanitizer.js";
import { StatisticalPricingEngine } from "../../src/core/knowledge/pricing-engine.js";
import { ProjectVectorStore, type CompletedProjectRecord } from "../../src/core/knowledge/project-vector-store.js";
import { tenantStorage } from "../../src/core/auth/tenant-context.js";
import { domainModel } from "../helpers/domain-fixtures.js";

const context = (userId = "admin-tester") => ({
  clientId: "test-client-memory",
  environment: "dev" as const,
  actor: { userId, role: "admin" as const },
  requestId: "vector-fixture",
  scopes: ["ai:generate", "data:write", "knowledge:write"],
});

const makeVector = (dominantIndex = 0) => {
  const arr = new Array(768).fill(0);
  arr[dominantIndex] = 1.0;
  return arr;
};

beforeEach(() => {
  paidFixture();
  globalThis.fetch = forbidNetwork;
  ProjectVectorStore.clear();
});

afterEach(() => {
  globalThis.fetch = forbidNetwork;
  ProjectVectorStore.clear();
  ProjectVectorStore.close();
});

test("DataSanitizer: scrubs multi-stage PII including Saudi/Egyptian phones, emails, URLs, and IBANs", () => {
  const dirty = "يرجى التواصل مع العميل: م. أحمد السعيد على الهاتف 0551234567 أو عبر واتساب wa.me/966551234567 أو في مصر 01012345678 " +
    "والإيميل ahmed@example.com وموقعي https://my-portfolio.com ورقم الحساب SA0380000000608010167519";

  const clean = DataSanitizer.scrub(dirty);

  assert.ok(!clean.includes("0551234567"), "Saudi phone must be scrubbed");
  assert.ok(!clean.includes("01012345678"), "Egyptian phone must be scrubbed");
  assert.ok(!clean.includes("ahmed@example.com"), "Email must be scrubbed");
  assert.ok(!clean.includes("https://my-portfolio.com"), "URL must be scrubbed");
  assert.ok(!clean.includes("SA0380000000608010167519"), "IBAN must be scrubbed");
  assert.ok(clean.includes("[رقم هاتف]"), "Must replace phones with token");
  assert.ok(clean.includes("[بريد إلكتروني]"), "Must replace email with token");
  assert.ok(clean.includes("[رابط خارجي]"), "Must replace URL with token");
  assert.ok(clean.includes("[رقم حساب بنكي]"), "Must replace IBAN with token");
});

test("Quality Gates: isEligible filters out low ratings, disputes, and unreleased escrow", () => {
  const base: CompletedProjectRecord = {
    projectId: "p-valid",
    category: "برمجة وتطوير",
    scopeSummary: "تطوير متجر إلكتروني متكامل باستخدام ووكومرس",
    durationDays: 14,
    budgetAmount: 2500,
    currency: "SAR",
    milestonesCount: 3,
    rating: 4.8,
    escrowReleased: true,
    disputeCount: 0,
    completedAt: "2026-10-10",
  };

  assert.ok(ProjectVectorStore.isEligible(base), "Valid project must pass quality gate");

  assert.equal(ProjectVectorStore.isEligible({ ...base, rating: 3.2 }), false, "Rating < 3.5 must be rejected");
  assert.equal(ProjectVectorStore.isEligible({ ...base, disputeCount: 1 }), false, "Disputed project must be rejected");
  assert.equal(ProjectVectorStore.isEligible({ ...base, escrowReleased: false }), false, "Unreleased escrow must be rejected");
  assert.equal(ProjectVectorStore.isEligible({ ...base, scopeSummary: "short" }), false, "Scope < 15 chars must be rejected");
});

test("StatisticalPricingEngine: removes outliers and provides IQR percentiles only when sample >= minSampleSize", () => {
  const projects = [
    { projectId: "1", category: "برمجة", budgetAmount: 1000, durationDays: 10, currency: "SAR", rating: 5 },
    { projectId: "2", category: "برمجة", budgetAmount: 1200, durationDays: 12, currency: "SAR", rating: 4.5 },
  ];

  // With N=2 (< 3), market data must be insufficient
  const insufficient = StatisticalPricingEngine.calculate(projects, "SAR", 3);
  assert.equal(insufficient.hasMarketData, false);
  assert.equal(insufficient.recommendedMinBudget, null);
  assert.equal(insufficient.recommendedMaxBudget, null);
  assert.equal(insufficient.estimationBasis, "INSUFFICIENT_MARKET_DATA");

  // Add 3 more projects, including 1 massive outlier ($50,000)
  const fullSet = [
    ...projects,
    { projectId: "3", category: "برمجة", budgetAmount: 1500, durationDays: 14, currency: "SAR", rating: 4.8 },
    { projectId: "4", category: "برمجة", budgetAmount: 1800, durationDays: 18, currency: "SAR", rating: 5 },
    { projectId: "5", category: "برمجة", budgetAmount: 50000, durationDays: 30, currency: "SAR", rating: 4.9 }, // Outlier
  ];

  const result = StatisticalPricingEngine.calculate(fullSet, "SAR", 3);
  assert.equal(result.hasMarketData, true);
  assert.equal(result.estimationBasis, "STATISTICAL_MARKET_BENCHMARK");
  // Outlier ($50,000) must be discarded via IQR, so max budget stays realistic (< 2500)
  assert.ok(result.recommendedMaxBudget! < 3000, `Max budget should filter out 50k, got: ${result.recommendedMaxBudget}`);
  assert.ok(result.recommendedMinBudget! >= 1000, `Min budget should be >= 1000, got: ${result.recommendedMinBudget}`);
});

test("ProjectVectorStore: stores, retrieves, and invalidates vector projects with low latency", async () => {
  await tenantStorage.run(context(), async () => {
    const vEcommerce = makeVector(10);
    const vLogoDesign = makeVector(50);

    const p1: CompletedProjectRecord = {
      projectId: "proj-ecommerce-1",
      category: "متاجر إلكترونية",
      subSpecialty: "شوبيفاي",
      scopeSummary: "بناء متجر شوبيفاي مع بوابات دفع ميسر وشحن أرامكس",
      durationDays: 12,
      budgetAmount: 3000,
      currency: "SAR",
      milestonesCount: 3,
      rating: 4.9,
      completedAt: "2026-10-11",
    };

    const p2: CompletedProjectRecord = {
      projectId: "proj-logo-1",
      category: "تصميم وجرافيك",
      subSpecialty: "هوية بصرية",
      scopeSummary: "تصميم شعار وهوية بصرية كاملة لشركة استشارات",
      durationDays: 5,
      budgetAmount: 1200,
      currency: "SAR",
      milestonesCount: 2,
      rating: 5.0,
      completedAt: "2026-10-12",
    };

    assert.ok(ProjectVectorStore.insertProject(p1, vEcommerce));
    assert.ok(ProjectVectorStore.insertProject(p2, vLogoDesign));

    const stats = ProjectVectorStore.getStats();
    assert.equal(stats.totalProjects, 2);
    assert.equal(stats.categories["متاجر إلكترونية"], 1);
    assert.equal(stats.categories["تصميم وجرافيك"], 1);

    // Search with vector aligned with Ecommerce
    const start = performance.now();
    const queryVector = makeVector(10);
    const matches = ProjectVectorStore.searchSimilar(queryVector, { limit: 1 });
    const elapsedMs = performance.now() - start;

    assert.ok(elapsedMs < 20, `Search must be fast (<20ms), took ${elapsedMs}ms`);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.project.projectId, "proj-ecommerce-1");
    assert.ok(matches[0]!.similarity > 0.99);

    // Test Invalidation
    assert.ok(ProjectVectorStore.invalidate("proj-ecommerce-1"));
    const afterInvalidation = ProjectVectorStore.searchSimilar(queryVector, { limit: 1 });
    assert.equal(afterInvalidation.length, 0);
    assert.equal(ProjectVectorStore.getStats().totalProjects, 1);
  });
});

describe("Project Vector Endpoints Integration", () => {
  const app = buildApp();
  const headers = () => authHeaders("fixture-admin", "admin");

  before(async () => {
    paidFixture();
    GeminiGateway.setMockHandler(domainModel);
    await app.ready();
  });

  after(async () => {
    GeminiGateway.setMockHandler(null);
    globalThis.fetch = forbidNetwork;
    await app.close();
    ProjectVectorStore.clear();
    ProjectVectorStore.close();
  });

  test("POST /v1/ai/knowledge/projects/sync ingests eligible projects, preserves single asymmetric prefix, and invalidates ineligible ones", async () => {
    const capturedTexts: string[] = [];
    // Mock embedding provider fetch
    globalThis.fetch = async (url: any, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith(":batchEmbedContents")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const reqs = (body.requests ?? []) as Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        for (const r of reqs) {
          capturedTexts.push(r.content?.parts?.[0]?.text ?? "");
        }
        return Response.json({
          embeddings: reqs.map(() => ({ values: makeVector(15) })),
        });
      }
      if (path.endsWith(":embedContent")) {
        return Response.json({
          embedding: { values: makeVector(15) },
        });
      }
      throw new Error(`UNEXPECTED_FETCH: ${path}`);
    };

    const payload = {
      projects: [
        {
          projectId: "sync-p1",
          clientId: "client-alpha",
          category: "متاجر إلكترونية",
          subSpecialty: "سلة",
          scopeSummary: "ربط متجر سلة مع زد وشات بوت ودفع إلكتروني متكامل",
          durationDays: 10,
          budgetAmount: 2000,
          currency: "SAR",
          rating: 4.8,
          escrowReleased: true,
          disputeCount: 0,
          completedAt: "2026-10-12T00:00:00Z",
        },
        {
          projectId: "sync-p2-rejected",
          category: "متاجر إلكترونية",
          scopeSummary: "مشروع ملغي به نزاع",
          durationDays: 5,
          budgetAmount: 500,
          currency: "SAR",
          rating: 2.0,
          escrowReleased: false,
          disputeCount: 1,
          completedAt: "2026-10-12T00:00:00Z",
        },
      ],
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/knowledge/projects/sync",
      headers: headers(),
      payload,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.syncedCount, 1);
    assert.equal(body.invalidatedCount, 0);

    // Ensure asymmetric prefix was applied once (no "title: none | text: title: ...")
    assert.equal(capturedTexts.length, 1);
    assert.ok(capturedTexts[0]!.startsWith("title: متاجر إلكترونية - سلة | text: "), `Unexpected prefix: ${capturedTexts[0]}`);
    assert.ok(!capturedTexts[0]!.includes("title: none"), `Must not double-prefix with title: none: ${capturedTexts[0]}`);

    // Check stats endpoint
    const statsRes = await app.inject({
      method: "GET",
      url: "/v1/ai/knowledge/projects/stats",
      headers: headers(),
    });
    assert.equal(statsRes.statusCode, 200);
    assert.equal(statsRes.json().stats.totalProjects, 1);

    // Check search endpoint
    const searchRes = await app.inject({
      method: "POST",
      url: "/v1/ai/knowledge/projects/search",
      headers: headers(),
      payload: { query: "متجر سلة ودفع إلكتروني", limit: 2 },
    });
    assert.equal(searchRes.statusCode, 200);
    assert.equal(searchRes.json().success, true);
    assert.equal(searchRes.json().count, 1);

    // Check ClientMemoryStore endpoint & sync integration
    const memRes = await app.inject({
      method: "POST",
      url: "/v1/ai/knowledge/client-memory",
      headers: headers(),
      payload: {
        clientId: "client-alpha",
        preferredCategories: ["متاجر إلكترونية"],
        styleNotes: "يفضل الجداول التفصيلية ومراحل التسليم الواضحة",
        avgBudget: 2500,
        completedProjectsCount: 2,
      },
    });
    assert.equal(memRes.statusCode, 200);
    assert.equal(memRes.json().data.clientId, "client-alpha");
    assert.equal(memRes.json().data.completedProjectsCount, 2);
  });

  test("POST /v1/ai/knowledge/projects/sync chunks batches > 64 projects without validation error", async () => {
    globalThis.fetch = async (url: any, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith(":batchEmbedContents")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const reqs = (body.requests ?? []) as unknown[];
        return Response.json({
          embeddings: reqs.map(() => ({ values: makeVector(12) })),
        });
      }
      throw new Error(`UNEXPECTED_FETCH: ${path}`);
    };

    const projects = Array.from({ length: 70 }, (_, idx) => ({
      projectId: `bulk-p-${idx + 1}`,
      category: "برمجة وتطوير",
      subSpecialty: "تطوير ويب",
      scopeSummary: `تطوير نظام إدارة موارد المؤسسات والربط مع الفاتورة الإلكترونية رقم ${idx + 1}`,
      durationDays: 15,
      budgetAmount: 4000,
      currency: "SAR",
      rating: 4.9,
      escrowReleased: true,
      disputeCount: 0,
      completedAt: "2026-10-12T00:00:00Z",
    }));

    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/knowledge/projects/sync",
      headers: headers(),
      payload: { projects },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().syncedCount, 70);
  });

  test("ProjectVectorStore isolates identical projectId across different tenants via composite PK", async () => {
    const sharedProject: CompletedProjectRecord = {
      projectId: "shared-id-100",
      category: "برمجة وتطوير",
      scopeSummary: "تطوير تطبيق جوال للتوصيل السريع مع تتبع الخرائط",
      durationDays: 20,
      budgetAmount: 5000,
      currency: "SAR",
      rating: 4.9,
      escrowReleased: true,
      disputeCount: 0,
      completedAt: "2026-10-12",
    };

    await tenantStorage.run({ ...context(), clientId: "tenant-A" }, async () => {
      assert.ok(ProjectVectorStore.insertProject(sharedProject, makeVector(5)));
      assert.equal(ProjectVectorStore.getStats().totalProjects, 1);
    });

    await tenantStorage.run({ ...context(), clientId: "tenant-B" }, async () => {
      assert.ok(ProjectVectorStore.insertProject({ ...sharedProject, budgetAmount: 7500 }, makeVector(5)));
      assert.equal(ProjectVectorStore.getStats().totalProjects, 1);
      const matches = ProjectVectorStore.searchSimilar(makeVector(5), { limit: 1 });
      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.project.budgetAmount, 7500);
    });

    await tenantStorage.run({ ...context(), clientId: "tenant-A" }, async () => {
      const matches = ProjectVectorStore.searchSimilar(makeVector(5), { limit: 1 });
      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.project.budgetAmount, 5000);
      ProjectVectorStore.clear();
    });

    await tenantStorage.run({ ...context(), clientId: "tenant-B" }, async () => {
      ProjectVectorStore.clear();
    });
  });
});
