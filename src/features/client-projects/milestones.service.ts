import { z } from "zod";
import { generateValidated, featureError, scoreSchema, textSchema, textListSchema } from "../../core/security/model-output.js";
import { ProjectVectorStore } from "../../core/knowledge/project-vector-store.js";
import type { MilestoneSuggestionInput, MilestoneSuggestionOutput, ProjectAnalysisInput, ProjectAnalysisOutput } from "./milestones.types.js";

export class MilestonesService {
  public static async suggestMilestones(input: MilestoneSuggestionInput): Promise<MilestoneSuggestionOutput> {
    const category = (input as { category?: string }).category;
    const benchmarks = await ProjectVectorStore.searchSimilarByText(
      `${input.title} ${input.description ?? ""}`,
      { category, limit: 2 }
    );

    const payload: Record<string, unknown> = { ...input };
    if (benchmarks.length > 0) {
      const patterns = benchmarks
        .filter(b => b.project.milestonesSummary)
        .map(b => b.project.milestonesSummary);
      if (patterns.length > 0) {
        payload["benchmarkMilestonePatterns"] = patterns;
      }
    }

    const data = await generateValidated({
      featureId: "AI-03-MILESTONE-SUGGEST",
      modelTier: "MEDIUM",
      preferredModel: "gemini-2.5-flash",
      effort: "low",
      attemptTimeoutMs: 20000,
      maxAttempts: 4,
      classification: "PERSONAL",
      prompt: JSON.stringify(payload),
      systemInstruction: `Suggest Arabic milestones appropriate to the actual project discipline with concrete deliverables and acceptance criteria. Return milestones[{title,description,days,percentage}], 1..12 items, positive percentages summing exactly 100.${input.deliveryDays ? ` CRITICAL: The sum of all milestone "days" MUST NOT exceed ${input.deliveryDays} days total.` : " Total days must not exceed supplied deliveryDays."} These are suggestions requiring confirmation.`,
    }, z.object({
      milestones: z.array(z.object({
        title: textSchema,
        description: textSchema,
        days: z.number().int().min(1).max(365),
        percentage: z.number().min(1).max(100),
      }).strict()).min(1).max(12),
    }).strict());

    if (input.deliveryDays && input.deliveryDays >= data.milestones.length) {
      const totalDays = data.milestones.reduce((sum, item) => sum + item.days, 0);
      if (totalDays > input.deliveryDays) {
        const scale = input.deliveryDays / totalDays;
        for (const item of data.milestones) {
          item.days = Math.max(1, Math.floor(item.days * scale));
        }
      }
    }

    const totalPercent = data.milestones.reduce((sum, item) => sum + item.percentage, 0);
    if (Math.abs(totalPercent - 100) > 0.001 || input.deliveryDays && data.milestones.reduce((sum, item) => sum + item.days, 0) > input.deliveryDays) {
      throw featureError("AI_INVALID_MILESTONES", "Milestones violate percentage or delivery constraints.");
    }

    const cents = Math.round(input.totalAmount * 100);
    const shares = data.milestones.map(item => cents * item.percentage / 100);
    const amounts = shares.map(Math.floor);
    const remainder = cents - amounts.reduce((sum, value) => sum + value, 0);
    const order = shares.map((value, index) => ({ index, fraction: value - amounts[index]! })).sort((a, b) => b.fraction - a.fraction);
    for (let index = 0; index < remainder; index++) amounts[order[index % order.length]!.index]! += 1;

    return { milestones: data.milestones.map((item, index) => ({ ...item, amount: amounts[index]! / 100 })) };
  }

  public static async analyzeProject(input: ProjectAnalysisInput): Promise<ProjectAnalysisOutput> {
    const data = await generateValidated({
      featureId: "AI-04-PROJECT-ANALYSIS",
      modelTier: "MEDIUM",
      preferredModel: "gemini-2.5-flash",
      effort: "low",
      attemptTimeoutMs: 20000,
      maxAttempts: 4,
      classification: "PERSONAL",
      prompt: JSON.stringify(input),
      systemInstruction: "Analyze only the submitted text in Arabic. clarityScore is an advisory editorial rubric, not a statistical measurement. Never claim financial feasibility or market fit without independent sources. Return clarityScore,executiveSummary,strengths,gapsAndRisks,recommendedImprovements,suggestedPricingStrategy (authoring guidance without market prices).",
    }, z.object({
      clarityScore: scoreSchema,
      executiveSummary: textSchema,
      strengths: textListSchema,
      gapsAndRisks: textListSchema,
      recommendedImprovements: textListSchema,
      suggestedPricingStrategy: textSchema,
    }).strict());

    return { ...data, feasibilityScore: null, marketFitRating: "Unknown", scoreBasis: "TEXT_CLARITY_RUBRIC" };
  }
}
