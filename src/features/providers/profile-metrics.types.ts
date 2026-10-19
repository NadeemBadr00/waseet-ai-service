import { z } from "zod";
import type { ContentEvidence } from "../../core/security/content-inspector.js";

export const ProfileMetricsInputSchema = z.object({
  providerId: z.string().min(1),
  totalProjectsCompleted: z.number().int().nonnegative().default(0),
  onTimeProjectsCount: z.number().int().nonnegative().default(0),
  repeatClientsCount: z.number().int().nonnegative().default(0),
  totalClientsCount: z.number().int().nonnegative().default(0),
  fiveStarReviewsCount: z.number().int().nonnegative().default(0),
  totalReviewsCount: z.number().int().nonnegative().default(0),
  disputedProjectsCount: z.number().int().nonnegative().default(0),
});

export type ProfileMetricsInput = z.infer<typeof ProfileMetricsInputSchema>;

export interface ProfileMetricsOutput {
  executionQuality: number | null;
  onTimeDelivery: number | null;
  communication: number | null;
  clientSatisfaction: number | null;
  onTimeCompletionRate: number | null;
  repeatClientRate: number | null;
  highRatingServicesRate: number | null;
  conflictFreeDeliveryRate: number | null;
}

export const BioSuggestInputSchema = z.object({
  providerId: z.string().min(1),
  currentBio: z.string().optional(),
  jobTitle: z.string().max(200).optional(),
  experienceRange: z.string().max(200).optional(),
  existingSkills: z.array(z.string()).max(50).optional(),
  specialties: z.array(z.string()).default([]),
  yearsOfExperience: z.number().nonnegative().default(0),
  keyAchievements: z.array(z.string()).default([]),
  maxLength: z.number().int().min(80).max(2000).default(500),
});

export type BioSuggestInput = z.infer<typeof BioSuggestInputSchema>;

export const SkillsSuggestInputSchema = z.object({
  providerId: z.string().min(1),
  specialtyName: z.string().min(1),
  existingSkills: z.array(z.string()).default([]),
});

export type SkillsSuggestInput = z.infer<typeof SkillsSuggestInputSchema>;

export interface PortfolioSampleItem {
  title: string;
  description?: string;
  technologies?: string[];
  projectUrl?: string;
  githubUrl?: string;
  attachments?: unknown[];
}

export interface PortfolioReviewOutput {
  status: "TEST_REQUIRED" | "PENDING_REVIEW" | "APPROVED";
  scores: {
    aiScore: number | null;
    feasibilityScore: number | null;
    clarityScore: number | null;
    ownershipCredibility: number | null;
  };
  feedback: {
    summary: string;
    strengths: string[];
    warnings: string[];
    corrections: string[];
  };
  sampleEvaluations?: Array<{
    title: string;
    status: string;
    feedback: string;
  }>;
  inspected?: boolean;
  basis?: string;
  evidence?: ContentEvidence[];
  unavailable?: string[];
}

export interface AccreditationReviewOutput {
  sample: {
    id: string;
    status: string;
  };
  inspected: boolean;
  basis: string;
  evidence?: ContentEvidence[];
  unavailable?: string[];
  evaluation: {
    aiScore: number | null;
    status: "AI_VERIFIED" | "NEEDS_REVISION" | "REJECTED" | "UNVERIFIED";
    aiQualityRating: "Excellent" | "Good" | "Acceptable" | null;
    feedbackAr: string;
    strengths: string[];
    recommendations: string[];
  };
}
