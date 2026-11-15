import { z } from "zod";

export const MilestoneSuggestionInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  totalAmount: z.number().positive(),
  currency: z.string().length(3).default("SAR"),
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
  budget: z.number().positive().optional(),
  deadlineDays: z.number().positive().optional(),
  currency: z.string().length(3).default("SAR"),
});

export type ProjectAnalysisInput = z.infer<typeof ProjectAnalysisInputSchema>;

export interface ProjectAnalysisOutput {
  clarityScore: number;
  feasibilityScore: number | null;
  marketFitRating: "High" | "Medium" | "Low" | "Good" | "Moderate" | "Challenging" | "Unknown";
  scoreBasis?: string;
  executiveSummary: string;
  strengths: string[];
  gapsAndRisks: string[];
  recommendedImprovements: string[];
  suggestedPricingStrategy: string;
}
