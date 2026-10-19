import { z } from "zod";

export const BusinessModelAuditInputSchema = z.object({
  modelId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().default("خدمات برمجية"),
  pricing: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3).default("USD"),
  }),
});

export type BusinessModelAuditInput = z.infer<typeof BusinessModelAuditInputSchema>;

export interface BusinessModelAuditOutput {
  isApproved: boolean | null;
  status: "REQUIRES_HUMAN_REVIEW";
  scoreBasis: "OFFERING_COMPLETENESS_RUBRIC";
  score: number;
  summary: string;
  strengths: string[];
  issues: string[];
  recommendations: string[];
}

export const BulkReAuditInputSchema = z.object({
  items: z.array(BusinessModelAuditInputSchema).min(1).max(100),
});

export type BulkReAuditInput = z.infer<typeof BulkReAuditInputSchema>;

export interface JobStatusOutput {
  jobId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  total: number;
  processed: number;
  results: Array<{ id: string; status: string; isApproved?: boolean | null; score?: number }>;
  createdAt: string;
  updatedAt: string;
}
