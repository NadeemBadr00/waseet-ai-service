import { z } from "zod";
import { DisputeContextSnapshotSchema } from "../../core/security/context-validator.js";

export const DisputeSummaryInputSchema = z.object({
  disputeId: z.string().min(1),
  projectId: z.string().min(1),
  clientClaim: z.string().max(20000).default(""),
  providerClaim: z.string().max(20000).default(""),
  contractTerms: z.string().optional(),
  evidenceList: z.array(z.string()).default([]),
  snapshot: DisputeContextSnapshotSchema.optional(),
});

export type DisputeSummaryInput = z.infer<typeof DisputeSummaryInputSchema>;

export interface DisputeSummaryOutput {
  summary: string;
  clientPerspective: string;
  providerPerspective: string;
  recommendation: string;
}
