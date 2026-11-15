import type { FastifyPluginAsync } from "fastify";
import {
  ProfileMetricsInputSchema,
  BioSuggestInputSchema,
  BioEnhanceInputSchema,
  SkillsSuggestInputSchema,
  IdentityInspectInputSchema,
  IdentityCompareFieldsInputSchema,
} from "./profile-metrics.types.js";
import { ProfileMetricsService } from "./profile-metrics.service.js";
import { AccreditationService } from "./accreditation.service.js";
import { z } from "zod";

export const providerRoutes: FastifyPluginAsync = async (fastify) => {
  // AI-16: Public Profile 8 Performance Metrics Summary
  fastify.post("/v1/ai/profile/performance-summary", async (request) => {
    const input = ProfileMetricsInputSchema.parse(request.body);
    const data = ProfileMetricsService.calculatePerformanceSummary(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-17: Suggest Bio (supports both /v1/ai/profile/bio and /v1/ai/profile/suggest-bio)
  const handleBio = async (request: any) => {
    const input = BioSuggestInputSchema.parse(request.body);
    const data = await ProfileMetricsService.suggestBio(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/profile/bio", handleBio);
  fastify.post("/v1/ai/profile/suggest-bio", handleBio);

  // AI-17b: Enhance existing user-written Bio (supports /v1/ai/profile/bio/enhance and /v1/ai/profile/bio-enhance)
  const handleBioEnhance = async (request: any) => {
    const input = BioEnhanceInputSchema.parse(request.body);
    const data = await ProfileMetricsService.enhanceBio(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/profile/bio/enhance", handleBioEnhance);
  fastify.post("/v1/ai/profile/bio-enhance", handleBioEnhance);

  // AI-17: Suggest Skills
  fastify.post("/v1/ai/profile/skills", async (request) => {
    const input = SkillsSuggestInputSchema.parse(request.body);
    const data = await ProfileMetricsService.suggestSkills(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // KYC Document Readability & Side Inspection (supports /v1/ai/identity/inspect-document and /v1/ai/identity-document-check)
  const handleIdentityInspect = async (request: any) => {
    const input = IdentityInspectInputSchema.parse(request.body);
    const data = await ProfileMetricsService.inspectIdentityDocument(input);
    const reqId = typeof request.headers?.["x-request-id"] === "string" ? request.headers["x-request-id"] : `req-${Date.now()}`;
    return { success: true, requestId: reqId, data };
  };
  fastify.post("/v1/ai/identity/inspect-document", { bodyLimit: 12000000 }, handleIdentityInspect);
  fastify.post("/v1/ai/identity-document-check", { bodyLimit: 12000000 }, handleIdentityInspect);

  // KYC Identity Field Comparison (/v1/ai/identity/compare-fields) — echoes x-request-id in envelope
  fastify.post("/v1/ai/identity/compare-fields", { bodyLimit: 12000000 }, async (request) => {
    const input = IdentityCompareFieldsInputSchema.parse(request.body);
    const data = await ProfileMetricsService.compareIdentityFields(input);
    const reqId = typeof request.headers?.["x-request-id"] === "string" ? request.headers["x-request-id"] : `req-${Date.now()}`;
    return { success: true, requestId: reqId, data };
  });

  // AI-06: Specialty Portfolio AI Review (supports /v1/ai/portfolio-review and /v1/ai/portfolio/review)
  const handlePortfolio = async (request: any) => {
    const body = z.object({
      providerSpecialtyId: z.string().min(1).optional(),
      specialtyName: z.string().optional(),
      samples: z.array(z.object({ title: z.string().min(1).max(500), description: z.string().max(12000).optional(), technologies: z.array(z.string().max(200)).max(50).optional(), githubUrl: z.string().max(2000).optional(), projectUrl: z.string().max(2000).optional(), attachments: z.array(z.union([z.string().max(2000), z.object({ url: z.string().max(2000), name: z.string().optional() })])).max(10).optional() })).max(20).optional(),
      sampleDescriptions: z.array(z.string().max(12000)).max(20).optional(),
    }).refine(body => !!body.specialtyName || !!body.providerSpecialtyId, "A real specialty is required.").parse(request.body);

    const specialty = body.specialtyName || body.providerSpecialtyId!;
    const samples = body.samples || body.sampleDescriptions || [];

    const data = await AccreditationService.evaluatePortfolio(specialty, samples);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/portfolio-review", handlePortfolio);
  fastify.post("/v1/ai/portfolio/review", handlePortfolio);

  // AI-07: Accreditation AI Evaluation (supports /v1/ai/accreditation-review and /v1/ai/accreditation/review)
  const handleAccreditation = async (request: any) => {
    const raw = (request.body ?? {}) as Record<string, any>;
    const nestedSample = raw.sample && typeof raw.sample === "object" ? (raw.sample as Record<string, any>) : {};
    const body = z.object({
      sampleId: z.string().min(1),
      providerSpecialtyId: z.string().optional(),
      providerId: z.string().optional(),
      specialtyId: z.string().optional(),
      specialtyName: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      githubUrl: z.string().optional(),
      projectUrl: z.string().optional(),
      technologiesUsed: z.array(z.string()).default([]),
    }).parse({
      ...nestedSample,
      ...raw,
      sampleId: raw.sampleId ?? nestedSample.id ?? raw.providerSpecialtyId ?? raw.specialtyId,
      title: raw.title ?? nestedSample.title,
      description: raw.description ?? nestedSample.description ?? undefined,
      githubUrl: raw.githubUrl ?? nestedSample.githubUrl ?? undefined,
      projectUrl: raw.projectUrl ?? nestedSample.projectUrl ?? undefined,
      technologiesUsed: Array.isArray(raw.technologiesUsed)
        ? raw.technologiesUsed
        : Array.isArray(nestedSample.technologiesUsed)
          ? nestedSample.technologiesUsed
          : [],
    });

    const data = await AccreditationService.evaluateAccreditation(
      body.sampleId,
      body.title,
      body.githubUrl,
      body.technologiesUsed,
      body.description,
      body.projectUrl
    );
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/accreditation-review", handleAccreditation);
  fastify.post("/v1/ai/accreditation/review", handleAccreditation);
};
