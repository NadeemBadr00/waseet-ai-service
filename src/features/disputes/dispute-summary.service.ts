import { z } from "zod";
import { ContextValidator } from "../../core/security/context-validator.js";
import { generateValidated, featureError, textSchema } from "../../core/security/model-output.js";
import type { DisputeSummaryInput, DisputeSummaryOutput } from "./dispute.types.js";
import { getTenantContext } from "../../core/auth/tenant-context.js";
export class DisputeSummaryService {
  public static async generateSummary(input: DisputeSummaryInput): Promise<DisputeSummaryOutput> {
    const dispute = input.snapshot ? ContextValidator.validateDispute(input.snapshot) : null;
    if (dispute && (dispute.disputeId !== input.disputeId || dispute.projectId !== input.projectId)) throw featureError("CONTEXT_IDENTITY_MISMATCH", "Dispute snapshot identity mismatch.", 422);
    const actor = getTenantContext()?.actor;
    if (dispute && actor && actor.role !== "system" && actor.role !== "admin" && actor.userId !== dispute.clientId && actor.userId !== dispute.providerId) throw featureError("FORBIDDEN", "Dispute does not belong to the actor.", 403);
    const clientClaim = dispute?.clientClaim ?? input.clientClaim, providerClaim = dispute?.providerClaim ?? input.providerClaim;
    if (!clientClaim.trim() && !providerClaim.trim()) throw featureError("INSUFFICIENT_DISPUTE_EVIDENCE", "No dispute claims supplied.", 422);
    return generateValidated({ featureId: "AI-20-DISPUTE-SUMMARY", modelTier: "HEAVY", classification: "SENSITIVE", temperature: 0.1, prompt: JSON.stringify({ clientClaim, providerClaim, contractTerms: input.contractTerms, evidence: input.evidenceList, timeline: dispute?.timelineEvents }), systemInstruction: "Write a neutral Arabic summary for a human mediator. Claims remain claims, not verified facts. Only supplied evidence/terms may support conclusions. No legal advice, binding decision, new deadlines, refund/release percentage or invented settlement. Recommendation describes missing evidence and questions for the human mediator. Return summary,clientPerspective,providerPerspective,recommendation." }, z.object({ summary: textSchema, clientPerspective: textSchema, providerPerspective: textSchema, recommendation: textSchema }).strict());
  }
}
