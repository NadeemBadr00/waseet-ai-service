import type { FastifyPluginAsync } from "fastify";
import {
  ProviderMatchingInputSchema,
  ProjectFitInputSchema,
  MarketplaceRecommendationInputSchema,
} from "./matching.types.js";
import { MatchingService } from "./matching.service.js";
import { MarketplaceService } from "./marketplace.service.js";

export const marketplaceRoutes: FastifyPluginAsync = async (fastify) => {
  // AI-13: Provider Matching
  const handleMatching = async (request: any) => {
    const input = ProviderMatchingInputSchema.parse(request.body);
    const data = await MatchingService.matchProjectsForProvider(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  };
  fastify.post("/v1/ai/matching/projects-for-provider", handleMatching);
  fastify.post("/v1/ai/marketplace/matching", handleMatching);

  // AI-14: Project Fit Analysis
  fastify.post("/v1/ai/project-fit", async (request) => {
    const input = ProjectFitInputSchema.parse(request.body);
    const data = await MatchingService.analyzeProjectFit(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-15: Marketplace Recommendations
  fastify.post("/v1/ai/marketplace/recommendations", async (request) => {
    const input = MarketplaceRecommendationInputSchema.parse(request.body);
    const data = await MarketplaceService.getRecommendations(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
};
