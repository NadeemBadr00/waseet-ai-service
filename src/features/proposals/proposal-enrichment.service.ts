import { z } from "zod";
import { generateValidated, scoreSchema, textSchema } from "../../core/security/model-output.js";
import type { ProposalEnrichmentInput, ProposalEnrichmentOutput } from "./proposal.types.js";
export class ProposalEnrichmentService {
  public static async enrichProposal(input: ProposalEnrichmentInput): Promise<ProposalEnrichmentOutput> {
    const data = await generateValidated({
      featureId: "AI-12-PROPOSAL-ENRICHMENT",
      modelTier: "MEDIUM",
      classification: "PERSONAL",
      prompt: JSON.stringify(input),
      systemInstruction: "راجع نص العرض ومراحل التنفيذ المرسلة فقط. اكتب ملخص التقييم (aiFeedback.summary) باللغة العربية الفصحى الواضحة حصراً، ويُمنع كتابة الملخص باللغة الإنجليزية. لا تخترع ملفاً شخصياً أو نسبة مطابقة أو إثبات تسعير. أرجع qualityScore (من 0 إلى 100)، وaiQualityTag (Excellent أو Strong أو Average)، وaiFeedback:{summary} باللغة العربية.",
    }, z.object({ qualityScore: scoreSchema, aiQualityTag: z.enum(["Excellent", "Strong", "Average"]), aiFeedback: z.object({ summary: textSchema }).strict() }).strict());
    return { ...data, id: input.proposalId || "draft-proposal", aiMatchScore: null, aiPriceTag: null, scoreBasis: "PROPOSAL_QUALITY" };
  }
}
