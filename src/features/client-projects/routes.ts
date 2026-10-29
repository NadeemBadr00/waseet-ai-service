import type { FastifyPluginAsync } from "fastify";
import { MilestoneSuggestionInputSchema } from "./milestones.types.js";
import { ProjectHealthInputSchema, DeliveryReviewInputSchema } from "./health-review.types.js";
import { ProjectDraftService } from "./project-draft.service.js";
import { MilestonesService } from "./milestones.service.js";
import { HealthReviewService } from "./health-review.service.js";
import { TextEnhanceService } from "./text-enhance.service.js";
import { z } from "zod";
import { ProjectDescriptionStreamInputSchema, RequestDraftInputSchema } from "./project-draft.types.js";
import { ProjectAnalysisInputSchema } from "./milestones.types.js";
import { ProjectVectorStore } from "../../core/knowledge/project-vector-store.js";
import { ClientMemoryStore } from "../../core/knowledge/client-memory-store.js";
import { embedTexts } from "../../runtime/voice.js";
import { assertPrivileged, getTenantContext } from "../../core/auth/tenant-context.js";

export const clientProjectRoutes: FastifyPluginAsync = async (fastify) => {
  const handleStreamDescription = async (request: any, reply: any) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const input = { ...ProjectDescriptionStreamInputSchema.parse({ ...body, category: body["category"] ?? body["inputPrompt"] }), preferredModel: typeof body["preferredModel"] === "string" ? body["preferredModel"] : undefined };
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    try {
      reply.raw.write(`event: generation.started\ndata: ${JSON.stringify({ status: "started" })}\n\n`);

      for await (const item of ProjectDraftService.generateDescriptionStream(input)) {
        reply.raw.write(`event: text.delta\ndata: ${JSON.stringify({ chunk: item.chunk, model: item.modelUsed, project: item.projectAliasUsed })}\n\n`);
      }

      reply.raw.write(`event: generation.completed\ndata: ${JSON.stringify({ status: "completed" })}\n\n`);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || "Streaming failed";
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
    } finally {
      reply.raw.end();
    }
  };

  fastify.post("/v1/ai/project-description/stream", handleStreamDescription);
  fastify.post("/v1/ai/client/projects/description/stream", handleStreamDescription);

  const handleDraft = async (request: any) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const input = RequestDraftInputSchema.parse({ ...body, description: body["description"] ?? body["inputPrompt"] });
    const data = await ProjectDraftService.suggestDraft(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/request-draft", handleDraft);
  fastify.post("/v1/ai/client/requests/draft-suggest", handleDraft);

  const handleTitleCheck = async (request: any) => {
    const body = z.object({
      title: z.string().min(1),
      specialtyName: z.string().optional(),
      category: z.string().optional(),
    }).parse(request.body);
    const data = await ProjectDraftService.checkTitle(body);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/request-title-check", handleTitleCheck);
  fastify.post("/v1/ai/client/requests/title-check", handleTitleCheck);

  fastify.post("/v1/ai/milestones", async (request) => {
    const input = MilestoneSuggestionInputSchema.parse(request.body);
    const data = await MilestonesService.suggestMilestones(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  const handleAnalysis = async (request: any) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const input = ProjectAnalysisInputSchema.parse(body);
    const data = await MilestonesService.analyzeProject(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/project-analysis", handleAnalysis);
  fastify.post("/v1/ai/client/projects/analysis", handleAnalysis);

  fastify.post("/v1/ai/text/suggest/stream", async (request, reply) => {
    const body = z.object({ title: z.string().min(1) }).parse(request.body);
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    try {
      reply.raw.write(`event: generation.started\ndata: ${JSON.stringify({ status: "started" })}\n\n`);
      for await (const item of TextEnhanceService.suggestTextStream(body.title, getTenantContext()?.signal)) {
        reply.raw.write(`event: text.delta\ndata: ${JSON.stringify({ chunk: item.chunk })}\n\n`);
      }
      reply.raw.write(`event: generation.completed\ndata: ${JSON.stringify({ status: "completed" })}\n\n`);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || "Streaming failed";
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });

  fastify.post("/v1/ai/text/enhance/stream", async (request, reply) => {
    const body = z.object({ description: z.string().min(1), title: z.string().optional() }).parse(request.body);
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    try {
      reply.raw.write(`event: generation.started\ndata: ${JSON.stringify({ status: "started" })}\n\n`);
      for await (const item of TextEnhanceService.enhanceDescriptionStream(body.description, getTenantContext()?.signal, body.title)) {
        reply.raw.write(`event: text.delta\ndata: ${JSON.stringify({ chunk: item.chunk })}\n\n`);
      }
      reply.raw.write(`event: generation.completed\ndata: ${JSON.stringify({ status: "completed" })}\n\n`);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || "Streaming failed";
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });

  fastify.post("/v1/ai/project-health", async (request) => {
    const input = ProjectHealthInputSchema.parse(request.body);
    const data = await HealthReviewService.analyzeProjectHealth(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/ai/delivery-review", async (request) => {
    const input = DeliveryReviewInputSchema.parse(request.body);
    const data = await HealthReviewService.reviewDelivery(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/ai/knowledge/projects/sync", async (request) => {
    assertPrivileged();
    const body = z.object({
      projects: z.array(z.object({
        projectId: z.string().min(1),
        clientId: z.string().min(1).optional(),
        category: z.string().min(1),
        subSpecialty: z.string().optional(),
        scopeSummary: z.string().min(15),
        durationDays: z.number().int().min(1),
        budgetAmount: z.number().min(0),
        currency: z.string().default("SAR"),
        milestonesCount: z.number().int().min(1).default(1),
        milestonesSummary: z.string().optional(),
        rating: z.number().min(0).max(5),
        escrowReleased: z.boolean().default(true),
        disputeCount: z.number().int().min(0).default(0),
        completedAt: z.string(),
      })).min(1).max(500),
    }).parse(request.body);

    let syncedCount = 0;
    let invalidatedCount = 0;
    const eligibleProjects: typeof body.projects = [];

    for (const proj of body.projects) {
      if (!ProjectVectorStore.isEligible(proj)) {
        if (ProjectVectorStore.invalidate(proj.projectId)) {
          invalidatedCount++;
        }
      } else {
        eligibleProjects.push(proj);
      }
    }

    const signal = getTenantContext()?.signal;
    for (let offset = 0; offset < eligibleProjects.length; offset += 64) {
      const batch = eligibleProjects.slice(offset, offset + 64);
      const texts = batch.map(p => ProjectVectorStore.formatDocumentText(p));
      const embedResult = await embedTexts({
        texts,
        purpose: "RETRIEVAL_DOCUMENT",
        model: "gemini-embedding-2",
        classification: "INTERNAL",
      }, { signal });

      for (let i = 0; i < batch.length; i++) {
        const proj = batch[i]!;
        const vector = embedResult.vectors[i]!;
        if (ProjectVectorStore.insertProject(proj, vector)) {
          syncedCount++;
          if (proj.clientId) {
            const existing = ClientMemoryStore.get(proj.clientId);
            const categories = Array.from(new Set([...(existing?.preferredCategories ?? []), proj.category.trim()])).slice(0, 20);
            const prevCount = existing?.completedProjectsCount ?? 0;
            const prevAvg = existing?.avgBudget ?? proj.budgetAmount;
            const nextCount = prevCount + 1;
            const nextAvg = Math.round(((prevAvg * prevCount) + proj.budgetAmount) / nextCount);
            ClientMemoryStore.upsert({
              clientId: proj.clientId,
              preferredCategories: categories,
              styleNotes: existing?.styleNotes,
              avgBudget: nextAvg,
              completedProjectsCount: nextCount,
            });
          }
        }
      }
    }

    return {
      success: true,
      syncedCount,
      invalidatedCount,
      stats: ProjectVectorStore.getStats(),
    };
  });

  fastify.post("/v1/ai/knowledge/projects/search", async (request) => {
    const body = z.object({
      query: z.string().min(1),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }).parse(request.body);

    const matches = await ProjectVectorStore.searchSimilarByText(body.query, {
      category: body.category,
      limit: body.limit,
      signal: getTenantContext()?.signal,
    });

    return { success: true, count: matches.length, matches };
  });

  fastify.get("/v1/ai/knowledge/projects/stats", async () => {
    return { success: true, stats: ProjectVectorStore.getStats() };
  });

  fastify.post("/v1/ai/knowledge/client-memory", async (request) => {
    assertPrivileged();
    const body = z.object({
      clientId: z.string().min(1).max(120),
      preferredCategories: z.array(z.string().min(1).max(120)).max(20).default([]),
      styleNotes: z.string().max(1000).optional(),
      avgBudget: z.number().min(0).optional(),
      completedProjectsCount: z.number().int().min(0).default(0),
    }).parse(request.body);

    ClientMemoryStore.upsert(body);
    return { success: true, data: ClientMemoryStore.get(body.clientId) };
  });
};
