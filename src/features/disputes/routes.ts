import type { FastifyPluginAsync } from "fastify";
import { DisputeSummaryInputSchema } from "./dispute.types.js";
import { DisputeSummaryService } from "./dispute-summary.service.js";

export const disputeRoutes: FastifyPluginAsync = async (fastify) => {
  // AI-20: Dispute AI Summary
  fastify.post("/v1/ai/disputes/summary", async (request) => {
    const input = DisputeSummaryInputSchema.parse(request.body);
    const data = await DisputeSummaryService.generateSummary(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
};
