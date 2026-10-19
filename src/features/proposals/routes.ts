import type { FastifyPluginAsync } from "fastify";
import { ProposalSuggestInputSchema, ProposalAuditInputSchema, ProposalEnrichmentInputSchema } from "./proposal.types.js";
import { ProposalAuditService } from "./proposal-audit.service.js";
import { ProposalEnrichmentService } from "./proposal-enrichment.service.js";

export const proposalRoutes: FastifyPluginAsync = async (fastify) => {
  // AI-10: Proposal suggestions
  fastify.post("/v1/ai/proposals/suggest", async (request) => {
    const input = ProposalSuggestInputSchema.parse(request.body);
    const data = await ProposalAuditService.suggestProposal(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-11 / AI2-08: Proposal AI Audit Stream
  fastify.post("/v1/ai/proposals/audit/stream", async (request, reply) => {
    const input = ProposalAuditInputSchema.parse(request.body);
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    for await (const msg of ProposalAuditService.auditProposalStream(input)) {
      reply.raw.write(`event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`);
    }

    reply.raw.end();
  });

  // AI-12: Proposal Submission Enrichment (Restored §12)
  fastify.post("/v1/ai/proposals/enrich", async (request) => {
    const input = ProposalEnrichmentInputSchema.parse(request.body);
    const data = await ProposalEnrichmentService.enrichProposal(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
};
