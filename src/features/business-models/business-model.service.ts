import { z } from "zod";
import { generateValidated, scoreSchema, textSchema, textListSchema } from "../../core/security/model-output.js";
import type { BusinessModelAuditInput, BusinessModelAuditOutput } from "./business-model.types.js";
export class BusinessModelService {
  public static async auditModel(input: BusinessModelAuditInput): Promise<BusinessModelAuditOutput> {
    const data = await generateValidated({ featureId: "AI2-02-BUSINESS-MODEL-AUDIT", modelTier: "MEDIUM", classification: "PERSONAL", prompt: JSON.stringify(input), systemInstruction: "Review the supplied Arabic business offering, not its actual market success. Score is an advisory text completeness rubric, not profitability or verified quality. Do not approve/reject publication or invent market prices. Return score,summary,strengths,issues,recommendations." }, z.object({ score: scoreSchema, summary: textSchema, strengths: textListSchema, issues: textListSchema, recommendations: textListSchema }).strict());
    return { ...data, isApproved: null, status: "REQUIRES_HUMAN_REVIEW", scoreBasis: "OFFERING_COMPLETENESS_RUBRIC" };
  }
}
