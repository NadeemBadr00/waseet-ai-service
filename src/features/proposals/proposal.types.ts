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
  proposalDraft: z.object({
    title: z.string().optional(),
    message: z.string().optional(),
    price: z.number().optional(),
    durationDays: z.number().optional(),
    milestonesCount: z.number().optional(),
    selectedPortfolioIds: z.array(z.string()).optional(),
  }).optional(),
  projectContext: z.object({
    title: z.string().optional(),
    budget: z.string().optional(),
    duration: z.string().optional(),
    milestones: z.string().optional(),
  }).optional(),
});

export type ProposalAuditInput = z.infer<typeof ProposalAuditInputSchema>;

export interface ProposalAuditProfileItem {
  title: string;
  subtitle: string;
  status: "EXCELLENT" | "GOOD" | "WARNING";
  badge: string;
}

export interface ProposalAuditOutput {
  profileAudit: ProposalAuditProfileItem[];
  triPartyComparison: {
    clientRequirementsFit: string;
    providerCapabilityFit: string;
    marketPriceAlignment: string;
    client: { budget: string; duration: string; milestones: string };
    provider: { budget: string; duration: string; milestones: string };
    aiRecommendation: { budget: string; duration: string; milestones: string };
  };
  triPartyNote: string;
  finalMetrics: {
    overallScore: number | null;
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
