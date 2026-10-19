import type { FastifyPluginAsync } from "fastify";
import { BusinessModelAuditInputSchema, BulkReAuditInputSchema } from "./business-model.types.js";
import { BusinessModelService } from "./business-model.service.js";
import { BulkAuditWorker } from "./bulk-audit.worker.js";
import { z } from "zod";

export const businessModelRoutes: FastifyPluginAsync = async (fastify) => {
  // AI2-02: Individual Business Model Audit
  fastify.post("/v1/ai/business-models/audit", async (request) => {
    const input = BusinessModelAuditInputSchema.parse(request.body);
    const data = await BusinessModelService.auditModel(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI2-01: Bulk Business Model Re-Audit (202 Accepted)
  fastify.post("/v1/ai/business-models/re-audit", async (request, reply) => {
    const input = BulkReAuditInputSchema.parse(request.body);
    const data = await BulkAuditWorker.enqueueJob(input);
    return reply.status(202).send({
      success: true,
      requestId: `req-${Date.now()}`,
      data,
    });
  });

  // Bulk Job Status Polling
  fastify.get("/v1/jobs/:jobId", async (request) => {
    const params = z.object({ jobId: z.string() }).parse(request.params);
    const data = await BulkAuditWorker.getJobStatus(params.jobId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
  fastify.post("/v1/jobs/:jobId/resume", async request => ({ success: true, data: await BulkAuditWorker.resume(z.object({ jobId: z.string() }).parse(request.params).jobId) }));
  fastify.post("/v1/jobs/:jobId/cancel", async request => ({ success: true, data: await BulkAuditWorker.cancel(z.object({ jobId: z.string() }).parse(request.params).jobId) }));
};
