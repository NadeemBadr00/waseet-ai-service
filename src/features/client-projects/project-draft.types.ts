import { z } from "zod";

export const ProjectDescriptionStreamInputSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  language: z.string().default("ar"),
  modelTier: z.enum(["LIGHT", "MEDIUM", "HEAVY"]).optional(),
});

export interface ProjectDescriptionStreamInput {
  title: string;
  category?: string;
  language?: string;
  modelTier?: "LIGHT" | "MEDIUM" | "HEAVY";
  preferredModel?: string;
}

export const RequestDraftInputSchema = z.object({
  title: z.string().optional().default(""),
  description: z.string().optional().default(""),
  specialtyName: z.string().optional().default(""),
  subSpecialties: z.array(z.string()).optional(),
  availableSkills: z.array(z.string()).optional(),
  deliveryDays: z.number().int().positive().nullable().optional(),
  currency: z.string().length(3).default("USD"),
}).refine(
  (d) => Boolean(d.title.trim() || d.description.trim() || d.specialtyName.trim()),
  { message: "At least one of title, description, or specialtyName is required" }
);

export type RequestDraftInput = z.infer<typeof RequestDraftInputSchema>;

export interface RequestDraftOutput {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedSubSpecialties: string[];
  suggestedRequiredSkills?: string[];
  suggestedRequirements?: string[];
  suggestedOutputs?: string;
  suggestedMilestones?: Array<{ name: string; pct: number }>;
  recommendedMinBudget: number | null;
  recommendedMaxBudget: number | null;
  suggestedDurationDays: number | null;
  estimationBasis?: string;
  complexityRating: "Low" | "Medium" | "High";
  personalizedNote: string;
  aiMatchScoreEstimate: number | null;
}

export const BudgetMilestonesInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  specialtyName: z.string().optional().default(""),
  subSpecialties: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  expectedDurationDays: z.number().int().positive().nullable().optional(),
  /** the same value under the name the website's draft uses; both are honoured */
  deliveryDays: z.number().int().positive().nullable().optional(),
  currency: z.string().length(3).default("USD"),
});

export type BudgetMilestonesInput = z.infer<typeof BudgetMilestonesInputSchema>;

export interface BudgetMilestonesOutput {
  recommendedMinBudget: number;
  recommendedMaxBudget: number;
  suggestedDurationDays: number;
  suggestedMilestones: Array<{ name: string; pct: number }>;
  complexityRating: "Low" | "Medium" | "High";
  rationaleAr: string;
  estimationBasis?: string;
}
