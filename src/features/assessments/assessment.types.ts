import { z } from "zod";

export interface AssessmentOption {
  id: string;
  text: string;
}

export interface AssessmentPublicQuestion {
  id: string | number;
  textAr: string;
  options: AssessmentOption[];
}

export const AssessmentGenerationInputSchema = z.object({
  providerSpecialtyId: z.string().min(1),
  specialtyName: z.string().min(2).max(200),
  questionCount: z.number().int().min(1).max(50).default(20),
  timeLimitMinutes: z.number().int().min(1).max(120).default(15),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  subSpecialties: z.array(z.string().max(200)).max(10).optional(),
});

export type AssessmentGenerationInput = z.infer<typeof AssessmentGenerationInputSchema>;

export interface AssessmentGenerationOutput {
  attemptId: string;
  questions: AssessmentPublicQuestion[];
  timeLimitMinutes: number;
  generationSource: "GEMINI";
}

export const AssessmentSubmitInputSchema = z.object({
  submittedAnswers: z.record(z.string(), z.string()), // questionId -> optionId
});

export type AssessmentSubmitInput = z.infer<typeof AssessmentSubmitInputSchema>;

export interface AssessmentSubmitOutput {
  attemptId: string;
  score: number;
  isPassed: boolean;
  status: "COMPLETED";
  feedbackAr: string;
  strengths: string[];
  weaknesses: string[];
  completedAt: string;
}

export interface AssessmentStatusOutput {
  attemptId: string;
  status: "GENERATING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "FAILED";
  score: number | null;
  isPassed: boolean | null;
}
