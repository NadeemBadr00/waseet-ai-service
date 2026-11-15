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
  providerId: z.string().optional().default("provider"),
  currentBio: z.string().optional(),
  bio: z.string().optional(),
  jobTitle: z.string().max(200).optional(),
  specialtyName: z.string().max(200).optional(),
  subSpecialties: z.array(z.string()).max(30).optional(),
  experienceRange: z.string().max(200).optional(),
  existingSkills: z.array(z.string()).max(50).optional(),
  specialties: z.array(z.string()).default([]),
  yearsOfExperience: z.number().nonnegative().default(0),
  keyAchievements: z.array(z.string()).default([]),
  maxLength: z.number().int().min(80).max(2000).default(500),
});

export type BioSuggestInput = z.infer<typeof BioSuggestInputSchema>;

export const BioEnhanceInputSchema = z.object({
  providerId: z.string().optional().default("provider"),
  bio: z.string().optional(),
  currentBio: z.string().optional(),
  jobTitle: z.string().max(200).optional(),
  specialtyName: z.string().max(200).optional(),
  specialties: z.array(z.string()).default([]),
  subSpecialties: z.array(z.string()).default([]),
  existingSkills: z.array(z.string()).max(50).optional(),
  maxLength: z.number().int().min(80).max(2000).default(500),
});

export type BioEnhanceInput = z.infer<typeof BioEnhanceInputSchema>;

export const SkillsSuggestInputSchema = z.object({
  providerId: z.string().min(1),
  specialtyName: z.string().min(1),
  subSpecialties: z.array(z.string()).optional(),
  jobTitle: z.string().optional(),
  availableSkills: z.array(z.string()).optional(),
  existingSkills: z.array(z.string()).default([]),
});

export type SkillsSuggestInput = z.infer<typeof SkillsSuggestInputSchema>;

export const IdentityInspectInputSchema = z.object({
  side: z.enum(["FRONT", "BACK"]),
  image: z.string().min(10),
  imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]).default("image/jpeg"),
  document: z.object({
    country: z.string().optional(),
    type: z.string().optional(),
  }).optional(),
  declared: z.object({
    fullName: z.string().optional(),
    birthDate: z.string().optional(),
    nationalId: z.string().optional(),
  }).optional(),
});

export type IdentityInspectInput = z.infer<typeof IdentityInspectInputSchema>;

export interface IdentityInspectOutput {
  status: "CLEAR_VALID" | "NEEDS_ATTENTION" | "NOT_ID_DOCUMENT" | "UNREADABLE";
  isIdentityDocument: boolean;
  detectedSide: "FRONT" | "BACK" | "UNKNOWN";
  sideMatchesExpected: boolean;
  readability: "CLEAR" | "BLURRY" | "PARTIAL" | "UNREADABLE";
  summaryAr: string;
  warningsAr: string[];
  fields?: {
    fullName?: "MATCH" | "MISMATCH" | "COULD_NOT_VERIFY";
    birthDate?: "MATCH" | "MISMATCH" | "COULD_NOT_VERIFY";
    nationalId?: "MATCH" | "MISMATCH" | "COULD_NOT_VERIFY";
  };
  advisoryOnly: true;
}

export const IdentityCompareFieldsInputSchema = z.object({
  image: z.object({
    mimeType: z.string().min(3),
    data: z.string().min(10),
  }),
  declared: z.object({
    name: z.string().default(""),
    birthDate: z.string().default(""),
    nationalId: z.string().default(""),
  }),
  document: z.record(z.string(), z.unknown()).optional(),
});

export type IdentityCompareFieldsInput = z.infer<typeof IdentityCompareFieldsInputSchema>;

export interface IdentityCompareFieldsOutput {
  fields: {
    name: "MATCH" | "MISMATCH" | "UNREADABLE";
    birthDate: "MATCH" | "MISMATCH" | "UNREADABLE";
    nationalId: "MATCH" | "MISMATCH" | "UNREADABLE";
  };
  faceMatch: "NOT_CHECKED";
  liveness: "NOT_CHECKED";
  documentAuthenticity: "NOT_CHECKED";
}

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
  status?: string;
  aiScore?: number | null;
  aiQualityRating?: "Excellent" | "Good" | "Acceptable" | null;
  feedback?: {
    summary: string;
    strengths: string[];
    recommendations: string[];
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
