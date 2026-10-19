import { z } from "zod";
import type { ContentEvidence } from "../../core/security/content-inspector.js";
import {
  ProjectContextSnapshotSchema,
  DeliveryContextSnapshotSchema,
} from "../../core/security/context-validator.js";

export const ProjectHealthInputSchema = z.object({
  view: z.enum(["provider", "client"]),
  projectId: z.string().min(1),
  title: z.string().optional(),
  milestonesCompleted: z.number().int().nonnegative().optional(),
  totalMilestones: z.number().int().positive().optional(),
  daysRemaining: z.number().int().optional(),
  lastUpdateDate: z.string().optional(),
  snapshot: ProjectContextSnapshotSchema.optional(),
});

export type ProjectHealthInput = z.infer<typeof ProjectHealthInputSchema>;

export interface ProjectHealthOutput {
  confidence: number | null;
  riskLevel: "Low" | "Medium" | "High" | "Unknown";
  riskLevelKey: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  healthRating: "Good" | "Attention Needed" | "Critical" | "Unknown";
  bullets: string[];
  earlyDays: number | null;
  matchPercentage: number | null;
}

export const DeliveryReviewInputSchema = z.object({
  view: z.enum(["client", "provider"]),
  projectId: z.string().min(1),
  stageId: z.string().min(1),
  scopeAgreed: z.string().default(""),
  submissionDetails: z.string().default(""),
  deliverableLinks: z.array(z.string()).default([]),
  snapshot: DeliveryContextSnapshotSchema.optional(),
  requirements: z.array(z.string().min(1).max(2000)).max(50).default([]),
  requirementsScope: z.enum(["STAGE", "PROJECT"]).default("PROJECT"),
  files: z.array(z.object({ name: z.string().min(1).max(300), url: z.string().url(), mimeType: z.string().optional() })).max(6).default([]),
});

export type DeliveryReviewInput = Omit<z.infer<typeof DeliveryReviewInputSchema>, "requirements" | "requirementsScope" | "files"> & {
  requirements?: string[]; requirementsScope?: "STAGE" | "PROJECT"; files?: Array<{ name: string; url: string; mimeType?: string }>;
};

export interface DeliveryReviewOutput {
  summary: string;
  alignedPoints: string[];
  potentialGaps: string[];
  questionsForReviewer: string[];
  inspected?: boolean;
  contentRead?: boolean;
  basis?: string;
  evidence?: ContentEvidence[];
  unavailable?: string[];
  met?: Array<{ requirement: string; evidence: string; source: string }>;
  requirementsScope?: "STAGE" | "PROJECT";
  execution?: { status: "UNAVAILABLE"; executed: false; reason: string };
}
