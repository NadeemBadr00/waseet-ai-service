import { z } from "zod";
import { generateValidated, scoreSchema, textSchema } from "../../core/security/model-output.js";
import type { ProposalEnrichmentInput, ProposalEnrichmentOutput } from "./proposal.types.js";
export class ProposalEnrichmentService {
  public static async enrichProposal(input: ProposalEnrichmentInput): Promise<ProposalEnrichmentOutput> {
    const data = await generateValidated({ featureId: "AI-12-PROPOSAL-ENRICHMENT", modelTier: "MEDIUM", classification: "PERSONAL", prompt: JSON.stringify(input), systemInstruction: "Review only the supplied Arabic proposal text and stage structure. No invented provider profile, matching percentage, market competitiveness or pricing proof. Return qualityScore (advisory clarity rubric 0..100),aiQualityTag (Excellent/Strong/Average),aiFeedback:{summary}." }, z.object({ qualityScore: scoreSchema, aiQualityTag: z.enum(["Excellent", "Strong", "Average"]), aiFeedback: z.object({ summary: textSchema }).strict() }).strict());
    return { ...data, id: input.proposalId || "draft-proposal", aiMatchScore: null, aiPriceTag: null, scoreBasis: "PROPOSAL_QUALITY" };
  }
}
