import { z } from "zod";
import { generateValidated, scoreSchema, textSchema } from "../../core/security/model-output.js";
import type { ProposalEnrichmentInput, ProposalEnrichmentOutput } from "./proposal.types.js";

function normalizeQualityTag(rawTag: string | undefined, score: number): ProposalEnrichmentOutput["aiQualityTag"] {
  const tag = (rawTag ?? "").trim().toLowerCase();
  if (tag === "excellent" || score >= 85) return "Excellent";
  if (tag === "strong" || tag === "good" || score >= 65) return "Strong";
  return "Average";
}

export class ProposalEnrichmentService {
  public static async enrichProposal(input: ProposalEnrichmentInput): Promise<ProposalEnrichmentOutput> {
    const data = await generateValidated({
      featureId: "AI-12-PROPOSAL-ENRICHMENT",
      modelTier: "MEDIUM",
      preferredModel: "gemini-2.5-flash",
      effort: "low",
      attemptTimeoutMs: 20000,
      maxAttempts: 4,
      classification: "PERSONAL",
      prompt: JSON.stringify(input),
      systemInstruction: "راجع نص العرض ومراحل التنفيذ والسعر والمدة المرسلة فقط. اكتب ملخص التقييم (aiFeedback.summary) باللغة العربية الفصحى الواضحة حصراً، ويُمنع كتابة الملخص باللغة الإنجليزية. لا تخترع ملفاً شخصياً أو نسبة مطابقة أو إثبات تسعير. أرجع qualityScore (من 0 إلى 100)، وaiQualityTag (إحدى القيم: Excellent أو Strong أو Average أو Needs Improvement حسب جودة العرض الفعلية)، وaiFeedback:{summary} باللغة العربية.",
    }, z.object({
      qualityScore: scoreSchema,
      aiQualityTag: z.string().trim().min(1).max(40).catch("Average"),
      aiFeedback: z.object({ summary: textSchema }),
    }));
    const aiQualityTag = normalizeQualityTag(data.aiQualityTag, data.qualityScore);
    return {
      id: input.proposalId || "draft-proposal",
      qualityScore: data.qualityScore,
      aiQualityTag,
      aiFeedback: { summary: data.aiFeedback.summary },
      aiMatchScore: null,
      aiPriceTag: null,
      scoreBasis: "PROPOSAL_QUALITY",
    };
  }
}
