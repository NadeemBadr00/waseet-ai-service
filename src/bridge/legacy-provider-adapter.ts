import type { FastifyPluginAsync } from "fastify";
import { AccreditationService } from "../features/providers/accreditation.service.js";
import { AssessmentEngineService } from "../features/assessments/assessment-engine.service.js";
import { AssessmentGenerationInputSchema } from "../features/assessments/assessment.types.js";
import { ProposalAuditService } from "../features/proposals/proposal-audit.service.js";
import { ProposalEnrichmentService } from "../features/proposals/proposal-enrichment.service.js";
import { HealthReviewService } from "../features/client-projects/health-review.service.js";
import { ProjectHealthInputSchema } from "../features/client-projects/health-review.types.js";
import { MatchingService } from "../features/marketplace/matching.service.js";
import { ProfileMetricsService } from "../features/providers/profile-metrics.service.js";
import { BusinessModelService } from "../features/business-models/business-model.service.js";
import { BulkAuditWorker } from "../features/business-models/bulk-audit.worker.js";
import { BulkReAuditInputSchema } from "../features/business-models/business-model.types.js";
import { BioSuggestInputSchema, ProfileMetricsInputSchema } from "../features/providers/profile-metrics.types.js";
import { FirestoreService } from "../core/database/firestore.js";
import { getTenantContext } from "../core/auth/tenant-context.js";
import { featureError } from "../core/security/model-output.js";
import { z } from "zod";

export const legacyProviderAdapterRoutes: FastifyPluginAsync = async (fastify) => {
  // Legacy AI.pdf §6: POST /api/provider/specialties/:id/ai-evaluate
  fastify.post("/api/provider/specialties/:id/ai-evaluate", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = (request.body as { sampleDescriptions?: string[]; samples?: any[] } | undefined) ?? {};
    const samples = body.samples || body.sampleDescriptions || [];
    const data = await AccreditationService.evaluatePortfolio(params.id, samples);
    return { success: true, data };
  });

  // Legacy AI.pdf §7: POST /api/provider/accreditation/submit
  fastify.post("/api/provider/accreditation/submit", async (request) => {
    const body = z.object({
      providerSpecialtyId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      technologiesUsed: z.array(z.string()).default([]),
      projectUrl: z.string().optional(),
      githubUrl: z.string().optional(),
    }).parse(request.body);
    const data = await AccreditationService.evaluateAccreditation(
      body.providerSpecialtyId ?? `sample-${Date.now()}`,
      body.title,
      body.githubUrl,
      body.technologiesUsed,
      body.description,
      body.projectUrl
    );
    return { success: true, data };
  });

  // Legacy AI.pdf §8: POST /api/assessments/generate & submit
  fastify.post("/api/assessments/generate", async (request) => {
    const body = AssessmentGenerationInputSchema.parse(request.body);
    const data = await AssessmentEngineService.generateAssessment(body, getTenantContext()!.actor.userId);
    return { success: true, data };
  });

  fastify.post("/api/assessments/:attemptId/submit", async (request) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const body = z.object({ submittedAnswers: z.record(z.string(), z.string()) }).parse(request.body);
    const data = await AssessmentEngineService.submitAssessment(params.attemptId, body, getTenantContext()!.actor.userId);
    return { success: true, data };
  });

  // Legacy AI2.pdf §5: GET /api/assessments/:attemptId/status
  fastify.get("/api/assessments/:attemptId/status", async (request) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const data = await AssessmentEngineService.getAttemptStatus(params.attemptId);
    return { success: true, data };
  });

  // Legacy AI.pdf §10: POST /api/proposals/ai-suggest
  fastify.post("/api/proposals/ai-suggest", async (request) => {
    const body = z.object({
      projectId: z.string().min(1),
      currentTitle: z.string().min(1),
      currentMessage: z.string().min(1),
      currency: z.string().default("USD"),
      project: z.object({
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        title: z.string().optional(),
        requirements: z.array(z.string()).optional(),
      }).optional(),
    }).parse(request.body);
    const data = await ProposalAuditService.suggestProposal(body);
    return { success: true, data };
  });

  // Legacy AI.pdf §12: POST /api/projects/:id/proposals
  fastify.post("/api/projects/:id/proposals", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      proposalId: z.string().optional().default(() => `prop-${Date.now()}`),
      title: z.string().min(1),
      message: z.string().min(1),
      totalPrice: z.number().positive(),
      deliveryDays: z.number().positive(),
      milestones: z.array(z.any()).optional(),
    }).parse(request.body);

    const data = await ProposalEnrichmentService.enrichProposal({
      proposalId: body.proposalId,
      projectId: params.id,
      title: body.title,
      message: body.message,
      totalPrice: body.totalPrice,
      deliveryDays: body.deliveryDays,
      milestones: body.milestones,
      agreedToTerms: true,
      agreedToEscrow: true,
    });
    return { success: true, data };
  });

  // Legacy AI.pdf §13: GET /api/provider/statistics & POST /api/matching/projects-for-provider
  fastify.get("/api/provider/statistics", async () => {
    const data = await MatchingService.matchProjectsForProvider({ providerId: getTenantContext()!.actor.userId, limit: 3 });
    return { success: true, data };
  });

  fastify.post("/api/matching/projects-for-provider", async (request) => {
    const body = (request.body as Record<string, any>) ?? {};
    const data = await MatchingService.matchProjectsForProvider({
      providerId: body.providerId ?? "prov-default",
      provider: body.provider,
      candidates: body.candidates,
      limit: typeof body.limit === "number" ? body.limit : 5,
      specialtyFilter: body.specialtyFilter,
    });
    return { success: true, data };
  });

  // Legacy AI.pdf §14: GET /api/assistant/analyze-project/:projectId
  fastify.get("/api/assistant/analyze-project/:projectId", async (request) => {
    const params = z.object({ projectId: z.string() }).parse(request.params);
    const data = await MatchingService.analyzeProjectFit({ projectId: params.projectId, currency: "USD" });
    return { success: true, data };
  });

  // Legacy AI.pdf §16: GET /api/provider/profile/public/:providerId
  fastify.get("/api/provider/profile/public/:providerId", async (request) => {
    const params = z.object({ providerId: z.string() }).parse(request.params);
    const provider = await FirestoreService.getCatalog("providers", params.providerId);
    const counts = provider?.["performanceMetrics"];
    const fields = ["totalProjectsCompleted", "onTimeProjectsCount", "repeatClientsCount", "totalClientsCount", "fiveStarReviewsCount", "totalReviewsCount", "disputedProjectsCount"];
    if (!counts || typeof counts !== "object" || !fields.every(field => typeof (counts as Record<string, unknown>)[field] === "number")) throw featureError("METRICS_UNAVAILABLE", "No complete recorded provider metrics are available.", 422);
    const data = ProfileMetricsService.calculatePerformanceSummary(ProfileMetricsInputSchema.parse({ ...counts, providerId: params.providerId }));
    return { success: true, data };
  });

  // Legacy AI.pdf §17: POST /api/provider/profile/suggest-bio & suggest-skills
  fastify.post("/api/provider/profile/suggest-bio", async (request) => {
    const body = BioSuggestInputSchema.parse({ providerId: getTenantContext()!.actor.userId, ...(request.body as Record<string, unknown> ?? {}) });
    const data = await ProfileMetricsService.suggestBio(body);
    return { success: true, data };
  });

  fastify.post("/api/provider/profile/suggest-skills", async (request) => {
    const body = (request.body as { providerId?: string; specialtyName?: string } | undefined) ?? {};
    const data = await ProfileMetricsService.suggestSkills({
      providerId: body.providerId ?? "prov-default",
      specialtyName: body.specialtyName ?? "تطوير ويب",
      existingSkills: [],
    });
    return { success: true, data };
  });

  // Legacy AI.pdf §18: POST /api/provider/projects/:id/health
  fastify.post("/api/provider/projects/:id/health", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = ProjectHealthInputSchema.parse({ ...(request.body as Record<string, unknown> ?? {}), view: "provider", projectId: params.id });
    const data = await HealthReviewService.analyzeProjectHealth(input);
    return { success: true, data };
  });

  // Legacy AI2.pdf §3: POST /api/provider/projects/:id/stages/:stageId/ai-review
  fastify.post("/api/provider/projects/:id/stages/:stageId/ai-review", async (request) => {
    const params = z.object({ id: z.string(), stageId: z.string() }).parse(request.params);
    const body = (request.body as { scopeAgreed?: string; submissionDetails?: string } | undefined) ?? {};
    const data = await HealthReviewService.reviewDelivery({
      view: "provider",
      projectId: params.id,
      stageId: params.stageId,
      scopeAgreed: body.scopeAgreed ?? "تسليم المرحلة المعتمد",
      submissionDetails: body.submissionDetails ?? "مخرجات العمل المرفوعة للمراجعة",
      deliverableLinks: [],
    });
    return { success: true, data };
  });

  // Legacy AI2.pdf §1: POST /api/business-models/re-audit-all
  fastify.post("/api/business-models/re-audit-all", async (request, reply) => {
    const input = BulkReAuditInputSchema.parse(request.body);
    const data = await BulkAuditWorker.enqueueJob(input);
    return reply.status(202).send({ success: true, data });
  });

  // Legacy AI2.pdf §2: POST /api/business-models/audit
  fastify.post("/api/business-models/audit", async (request) => {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      category: z.string().default("خدمات برمجية"),
      pricing: z.object({ amount: z.number().positive(), currency: z.string().default("USD") }),
    }).parse(request.body);
    const data = await BusinessModelService.auditModel(body);
    return { success: true, data };
  });
};
