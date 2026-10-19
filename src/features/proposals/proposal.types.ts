import { z } from "zod";

export const ProposalSuggestInputSchema = z.object({
  projectId: z.string().min(1),
  currentTitle: z.string().optional().default(""),
  currentMessage: z.string().optional().default(""),
  currency: z.string().length(3).default("USD"),
  project: z.object({
    budgetMin: z.number().optional(),
    budgetMax: z.number().optional(),
    deliveryDays: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    requirements: z.array(z.string()).optional(),
  }).optional(),
});

export type ProposalSuggestInput = z.infer<typeof ProposalSuggestInputSchema>;

export interface ProposalPriceAudit {
  recommendedMin: number | null;
  recommendedMax: number | null;
  priceTag: "Suitable" | "Underpriced" | "Overpriced" | null;
  justification: string;
}

export interface SuggestedMilestoneItem {
  name: string;
  desc: string;
  days: number;
  pct: number;
}

export interface ProposalSuggestOutput {
  scoreBasis?: string;
  suggestedTitle: string;
  suggestedMessage: string;
  suggestedOutputs?: string;
  suggestedTotalPrice?: number | null;
  suggestedMilestones?: SuggestedMilestoneItem[];
  qualityScore: number;
  qualityTag: "Good" | "Excellent" | "Needs Improvement";
  priceAudit: ProposalPriceAudit;
  suggestedAdvantages: string[];
}

export const ProposalAuditInputSchema = z.object({
  providerId: z.string().min(1),
  projectId: z.string().min(1),
  proposalMessage: z.string().optional(),
});

export type ProposalAuditInput = z.infer<typeof ProposalAuditInputSchema>;

export interface ProposalAuditOutput {
  profileAudit: string[];
  triPartyComparison: {
    clientRequirementsFit: string;
    providerCapabilityFit: string;
    marketPriceAlignment: string;
  };
  finalMetrics: {
    compatibilityScore: number | null;
  };
  acceptanceOdds: number | null;
}

export const ProposalEnrichmentInputSchema = z.object({
  proposalId: z.string().optional().default("draft-proposal"),
  projectId: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  totalPrice: z.number().positive(),
  deliveryDays: z.number().positive(),
  milestones: z.array(z.object({
    stepOrder: z.number().int().positive(),
    title: z.string(),
    description: z.string(),
    days: z.number().positive(),
    percentage: z.number().min(0).max(100),
    amount: z.number().nonnegative(),
  })).optional(),
  agreedToTerms: z.boolean().default(true),
  agreedToEscrow: z.boolean().default(true),
});

export type ProposalEnrichmentInput = z.infer<typeof ProposalEnrichmentInputSchema>;

export interface ProposalEnrichmentOutput {
  id: string;
  aiMatchScore: number | null;
  qualityScore: number;
  scoreBasis: "PROPOSAL_QUALITY";
  aiQualityTag: "Excellent" | "Strong" | "Average";
  aiPriceTag: "Optimal" | "Competitive" | "High" | "Suitable" | null;
  aiFeedback: {
    summary: string;
  };
}
