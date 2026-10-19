import { z } from "zod";

export const CandidateProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(1000),
  description: z.string().optional().default(""),
  requirements: z.array(z.string()).optional().default([]),
  budget: z.number().optional(),
  duration: z.number().optional(),
  category: z.string().optional(),
  isOpen: z.boolean().optional(),
  status: z.string().optional(),
});

export type CandidateProject = z.infer<typeof CandidateProjectSchema>;

export const ProviderProfileSchema = z.object({
  specialties: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  experience: z.number().optional(),
  level: z.string().optional(),
  hourlyRate: z.number().optional(),
});

export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

export const ProviderMatchingInputSchema = z.object({
  providerId: z.string().min(1).optional(),
  provider: ProviderProfileSchema.optional(),
  candidates: z.array(CandidateProjectSchema).max(200).optional(),
  limit: z.number().int().min(1).max(50).default(5),
  specialtyFilter: z.string().optional(),
  constraints: z.object({ budgetMin: z.number().nonnegative().optional(), budgetMax: z.number().nonnegative().optional(), maxDurationDays: z.number().int().positive().optional(), category: z.string().optional(), requiredSkills: z.array(z.string()).max(50).optional(), excludedProjectIds: z.array(z.string()).max(200).optional() }).optional(),
});

export type ProviderMatchingInput = z.infer<typeof ProviderMatchingInputSchema>;

export interface MatchedProject {
  projectId: string;
  aiMatchScore: number | null;
  matchReasons: string[];
  generationSource: string;
  /** Cosine retrieval similarity, not an acceptance probability or quality grade. */
  retrievalSimilarity?: number;
}

export interface ProviderMatchingOutput {
  aiMatchingProjects: MatchedProject[];
  summary: {
    aiRating: number | null;
    matchingMode?: "semantic" | "lexical" | "lexical_fallback";
    fallbackReason?: "SEMANTIC_UNAVAILABLE";
  };
}

export const ProjectFitInputSchema = z.object({
  projectId: z.string().min(1),
  currency: z.string().length(3).default("USD"),
  providerSpecialty: z.string().optional(),
  providerRate: z.number().positive().optional(),
  project: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    requirements: z.array(z.string()).optional(),
    budget: z.number().optional(),
    durationDays: z.number().optional(),
  }).optional(),
});

export type ProjectFitInput = z.infer<typeof ProjectFitInputSchema>;

export interface ProjectFitOutput {
  matchPercent: number | null;
  matchSummary: string;
  winningStrategy: string[];
  suggestedBidPrice: number | null;
  priceRationale: string;
  riskAssessment: string;
}

export const MarketplaceRecommendationInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).default(5),
  category: z.string().optional(),
  candidates: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string().optional(), category: z.string().optional(), isPublished: z.boolean().optional() })).max(200).optional(),
});

export type MarketplaceRecommendationInput = z.infer<typeof MarketplaceRecommendationInputSchema>;

export interface MarketplaceItem {
  id: string;
  title: string;
  generationSource: string;
}

export interface MarketplaceRecommendationOutput {
  items: MarketplaceItem[];
}
