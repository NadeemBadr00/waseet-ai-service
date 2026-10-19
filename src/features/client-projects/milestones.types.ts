import { z } from "zod";

export const MilestoneSuggestionInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  totalAmount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  deliveryDays: z.number().positive().optional(),
});

export type MilestoneSuggestionInput = z.infer<typeof MilestoneSuggestionInputSchema>;

export interface MilestoneItem {
  title: string;
  description: string;
  days: number;
  percentage: number;
  amount: number;
}

export interface MilestoneSuggestionOutput {
  milestones: MilestoneItem[];
}

export const ProjectAnalysisInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  currency: z.string().length(3).default("USD"),
});

export type ProjectAnalysisInput = z.infer<typeof ProjectAnalysisInputSchema>;

export interface ProjectAnalysisOutput {
  clarityScore: number;
  feasibilityScore: number | null;
  marketFitRating: "Good" | "Moderate" | "Challenging" | "Unknown";
  scoreBasis?: string;
  executiveSummary: string;
  strengths: string[];
  gapsAndRisks: string[];
  recommendedImprovements: string[];
  suggestedPricingStrategy: string;
}
