import type { FastifyPluginAsync } from "fastify";
import { ProjectDraftService } from "../features/client-projects/project-draft.service.js";
import { MilestonesService } from "../features/client-projects/milestones.service.js";
import { HealthReviewService } from "../features/client-projects/health-review.service.js";
import { ProjectHealthInputSchema } from "../features/client-projects/health-review.types.js";
import { DisputeSummaryService } from "../features/disputes/dispute-summary.service.js";
import { MarketplaceService } from "../features/marketplace/marketplace.service.js";
import { z } from "zod";

export const legacyClientAdapterRoutes: FastifyPluginAsync = async (fastify) => {
  // Legacy AI.pdf §2: POST /api/client/requests/ai-suggest
  fastify.post("/api/client/requests/ai-suggest", async (request) => {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      specialtyName: z.string().default("تطوير برمجيات"),
      currency: z.string().default("USD"),
    }).parse(request.body);
    const data = await ProjectDraftService.suggestDraft(body);
    return { success: true, data };
  });

  // Section 2.11c: POST /api/client/requests/title-check
  fastify.post("/api/client/requests/title-check", async (request) => {
    const body = z.object({
      title: z.string().min(1),
      specialtyName: z.string().optional(),
      category: z.string().optional(),
    }).parse(request.body);
    const data = await ProjectDraftService.checkTitle(body);
    return { success: true, data };
  });

  // Legacy AI.pdf §3: POST /api/ai-review/suggest-milestones
  fastify.post("/api/ai-review/suggest-milestones", async (request) => {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      totalAmount: z.number().positive(),
      currency: z.string().default("USD"),
    }).parse(request.body);
    const data = await MilestonesService.suggestMilestones(body);
    return { success: true, data };
  });

  // Legacy AI.pdf §4: POST /api/ai-review/analyze
  fastify.post("/api/ai-review/analyze", async (request) => {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      currency: z.string().default("USD"),
    }).parse(request.body);
    const data = await MilestonesService.analyzeProject(body);
    return { success: true, data };
  });

  // Legacy AI.pdf §15: POST /api/marketplace/ai-recommendations
  fastify.post("/api/marketplace/ai-recommendations", async (request) => {
    const body = z.object({ query: z.string().min(1), limit: z.number().int().positive().default(6) }).parse(request.body);
    const data = await MarketplaceService.getRecommendations(body);
    return { success: true, data };
  });

  // Legacy AI.pdf §18: POST /api/client/requests/:id/health
  fastify.post("/api/client/requests/:id/health", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = ProjectHealthInputSchema.parse({ ...(request.body as Record<string, unknown> ?? {}), view: "client", projectId: params.id });
    const data = await HealthReviewService.analyzeProjectHealth(input);
    return { success: true, data };
  });

  // Legacy AI.pdf §19: POST /api/client/requests/:id/stages/:stageId/ai-review
  fastify.post("/api/client/requests/:id/stages/:stageId/ai-review", async (request) => {
    const params = z.object({ id: z.string(), stageId: z.string() }).parse(request.params);
    const body = (request.body as { scopeAgreed?: string; submissionDetails?: string } | undefined) ?? {};
    const data = await HealthReviewService.reviewDelivery({
      view: "client",
      projectId: params.id,
      stageId: params.stageId,
      scopeAgreed: body.scopeAgreed ?? "تسليم المرحلة المعتمد",
      submissionDetails: body.submissionDetails ?? "مخرجات العمل المرفوعة للمراجعة",
      deliverableLinks: [],
    });
    return { success: true, data };
  });

  // Legacy AI.pdf §20: POST /api/admin/disputes/:id/ai-summary
  fastify.post("/api/admin/disputes/:id/ai-summary", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      projectId: z.string().default("proj-disputed-1"),
      clientClaim: z.string().default("التسليم غير مكتمل"),
      providerClaim: z.string().default("تم تسليم كافة المتطلبات المتفق عليها"),
    }).parse(request.body ?? {});

    const data = await DisputeSummaryService.generateSummary({
      disputeId: params.id,
      projectId: body.projectId,
      clientClaim: body.clientClaim,
      providerClaim: body.providerClaim,
      evidenceList: [],
    });
    return { success: true, data };
  });
};
