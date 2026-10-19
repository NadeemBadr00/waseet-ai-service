import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { ContextValidator } from "../../src/core/security/context-validator.js";
import { buildApp, authHeaders, paidFixture, GeminiGateway } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";

describe("Context Snapshot Security & Validation Tests", () => {
  const app = buildApp();
  let authHeader: string;

  before(async () => { paidFixture(); authHeader = authHeaders("client-1", "client").authorization; GeminiGateway.setMockHandler(domainModel); await app.ready(); });

  after(async () => {
    GeminiGateway.setMockHandler(null);
    await app.close();
  });

  describe("Unit: ContextValidator schema assertions", () => {
    test("validates ProjectContextSnapshot with required and optional fields", () => {
      const valid = ContextValidator.validateProject({
        entityId: "proj-1",
        entityType: "project",
        title: "مشروع تطوير منصة",
        description: "وصف المشروع التفصيلي للتحليل",
        budget: 5000,
        deadlineDays: 30,
        milestones: [{ title: "مرحلة 1", description: "تصميم", amount: 2000, percentage: 40, days: 10 }],
      });
      assert.equal(valid.entityId, "proj-1");
      assert.equal(valid.currency, "USD");
      assert.equal(valid.locale, "ar");
    });

    test("rejects ProjectContextSnapshot when required fields are missing", () => {
      assert.throws(() => {
        ContextValidator.validateProject({
          entityId: "proj-1",
          // missing entityType, title, description
        });
      }, ZodError);
    });

    test("validates DeliveryContextSnapshot with defaults for submittedFiles", () => {
      const valid = ContextValidator.validateDelivery({
        entityId: "del-1",
        entityType: "delivery",
        projectId: "proj-1",
        stageId: "stage-1",
        providerId: "prov-1",
        clientId: "client-1",
        scopeAgreed: "بناء واجهة المستخدم",
        submissionDetails: "تم رفع الكود على GitHub",
      });
      assert.equal(valid.entityId, "del-1");
      assert.deepEqual(valid.submittedFiles, []);
    });

    test("rejects DeliveryContextSnapshot on empty scopeAgreed", () => {
      assert.throws(() => {
        ContextValidator.validateDelivery({
          entityId: "del-1",
          entityType: "delivery",
          projectId: "proj-1",
          stageId: "stage-1",
          providerId: "prov-1",
          clientId: "client-1",
          scopeAgreed: "",
          submissionDetails: "تفاصيل",
        });
      }, ZodError);
    });

    test("validates DisputeContextSnapshot with defaults for milestones and events", () => {
      const valid = ContextValidator.validateDispute({
        entityId: "disp-1",
        entityType: "dispute",
        disputeId: "disp-1",
        projectId: "proj-1",
        clientId: "client-1",
        providerId: "prov-1",
        clientClaim: "الطرف الثاني تأخر",
        providerClaim: "العميل لم يزودني بالبيانات",
      });
      assert.equal(valid.disputeId, "disp-1");
      assert.deepEqual(valid.agreedMilestones, []);
      assert.deepEqual(valid.timelineEvents, []);
    });

    test("rejects DisputeContextSnapshot when claims are missing", () => {
      assert.throws(() => {
        ContextValidator.validateDispute({
          entityId: "disp-1",
          entityType: "dispute",
          disputeId: "disp-1",
          projectId: "proj-1",
          clientId: "client-1",
          providerId: "prov-1",
          // missing clientClaim & providerClaim
        });
      }, ZodError);
    });
  });

  describe("Integration: Context Snapshot HTTP Endpoints", () => {
    test("POST /v1/ai/project-health accepts valid snapshot", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/ai/project-health",
        headers: { authorization: authHeader },
        payload: {
          view: "client",
          projectId: "proj-ctx-1",
          snapshot: {
            entityId: "proj-ctx-1",
            entityType: "project",
            title: "منصة وسيط للعمل الحر",
            description: "نظام متكامل لربط العملاء بالمستقلين",
            budget: 10000,
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.data.healthRating);
    });

    test("POST /v1/ai/delivery-review accepts valid snapshot", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/ai/delivery-review",
        headers: { authorization: authHeader },
        payload: {
          view: "client",
          projectId: "proj-ctx-1",
          stageId: "stage-1",
          snapshot: {
            entityId: "del-ctx-1",
            entityType: "delivery",
            projectId: "proj-ctx-1",
            stageId: "stage-1",
            providerId: "prov-1",
            clientId: "client-1",
            scopeAgreed: "تصميم واجهة الدخول ولوحة التحكم",
            submissionDetails: "تم الانتهاء بنسبة 100%",
            submittedFiles: ["https://example.com/unapproved-file"],
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.data.summary);
    });

    test("POST /v1/ai/disputes/summary accepts valid snapshot", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/ai/disputes/summary",
        headers: { authorization: authHeader },
        payload: {
          disputeId: "disp-ctx-1",
          projectId: "proj-ctx-1",
          snapshot: {
            entityId: "disp-ctx-1",
            entityType: "dispute",
            disputeId: "disp-ctx-1",
            projectId: "proj-ctx-1",
            clientId: "client-1",
            providerId: "prov-1",
            clientClaim: "العمل غير مطابق",
            providerClaim: "تم تسليم المتطلبات كاملة",
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.data.summary);
    });

    test("POST /v1/ai/project-health rejects invalid snapshot format with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/ai/project-health",
        headers: { authorization: authHeader },
        payload: {
          view: "client",
          projectId: "proj-ctx-1",
          snapshot: {
            entityId: "proj-ctx-1",
            // missing entityType, title, description
          },
        },
      });
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, "VALIDATION_ERROR");
    });
  });
});
