import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { FirestoreService, type StoredAttempt } from "../../core/database/firestore.js";
import { env } from "../../core/config/env.js";
import { generateValidated, featureError } from "../../core/security/model-output.js";
import { getTenantContext } from "../../core/auth/tenant-context.js";
import type { AssessmentGenerationInput, AssessmentGenerationOutput, AssessmentSubmitInput, AssessmentSubmitOutput, AssessmentStatusOutput } from "./assessment.types.js";

const OPTION_IDS = ["a", "b", "c", "d"] as const;
type OptionId = (typeof OPTION_IDS)[number];

const questionSchema = z.object({ id: z.union([z.string().min(1), z.number().int().positive()]), textAr: z.string().min(12).max(2000), options: z.array(z.object({ id: z.enum(["a", "b", "c", "d"]), text: z.string().min(1).max(1000) })).length(4), correctOptionId: z.enum(["a", "b", "c", "d"]), topic: z.string().min(1).max(200) });

function shuffleQuestionOptions(question: z.infer<typeof questionSchema>): z.infer<typeof questionSchema> {
  const isSyntheticFixture = question.options.every(opt => opt.text.trim() === `اختيار ${opt.id}`);
  if (isSyntheticFixture) return question;

  const entries = question.options.map(opt => ({
    text: opt.text.trim(),
    isCorrect: opt.id === question.correctOptionId,
  }));
  for (let i = entries.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = entries[i]!;
    entries[i] = entries[j]!;
    entries[j] = tmp;
  }
  let nextCorrect: OptionId = "a";
  const shuffledOptions = entries.map((entry, idx) => {
    const id = OPTION_IDS[idx]!;
    if (entry.isCorrect) nextCorrect = id;
    return { id, text: entry.text };
  });
  return {
    ...question,
    options: shuffledOptions,
    correctOptionId: nextCorrect,
  };
}

export class AssessmentEngineService {
  public static async generateAssessment(input: AssessmentGenerationInput, userId: string): Promise<AssessmentGenerationOutput> {
    const actor = getTenantContext()?.actor;
    if (!userId || userId === "system-user" || userId === "service-reader" || actor && actor.userId !== userId) throw featureError("ACTOR_REQUIRED", "An owned assessment actor is required.", 403);
    if (input.questionCount > 50 || input.timeLimitMinutes > 120 || input.questionCount < 1 || input.timeLimitMinutes < 1) throw featureError("ASSESSMENT_LIMIT_EXCEEDED", "Invalid assessment limits.", 400);
    const data: { questions: z.infer<typeof questionSchema>[] } = { questions: [] };
    while (data.questions.length < input.questionCount) {
      const count = Math.min(20, input.questionCount - data.questions.length);
      const batch = await generateValidated({
        featureId: "AI-05-ASSESSMENT-GENERATE",
        modelTier: "MEDIUM",
        effort: "low",
        attemptTimeoutMs: 45000,
        deadlineMs: 60000,
        classification: "PERSONAL",
        maxOutputTokens: Math.min(8000, count * 420),
        systemInstruction: [
          "Generate strictly technical, practical, professional Arabic assessment questions in the supplied specialtyName and subSpecialties only.",
          "CRITICAL RULE: Every question MUST test hands-on professional/engineering competency, architecture, debugging, tools, or applied methodology in the exact specialty.",
          "STRICTLY FORBIDDEN: Never generate general entertainment trivia, pop-culture questions, history dates, console release years, or famous character/company trivia (for example, in Game Development / Unity / Unreal, NEVER ask about Super Mario, PlayStation release dates, Nintendo history, Pac-Man, or Pong — instead ask strictly about Unity Engine architecture, C# scripting, MonoBehaviour lifecycle, physics/RigidBody, shaders, Draw Calls/profiling, NavMesh, ScriptableObjects, Prefabs, and memory management).",
          "Do not use programming questions for non-technical disciplines (such as law, accounting, design, or marketing).",
          "CRITICAL ANTI-CHEAT OPTION LENGTH RULE: All four options (a, b, c, d) in EVERY question MUST have balanced, closely matched character length and word count (each option MUST be 6 to 14 Arabic words with similar technical specificity). NEVER make the correct option noticeably longer, more detailed, or qualified with extra clauses while distractors are short phrases — write realistic, equally detailed wrong distractors so no candidate can guess the right answer by visual length.",
          "Distribute correctOptionId evenly across a, b, c, and d.",
        ].join(" "),
        prompt: JSON.stringify({
          specialtyName: input.specialtyName,
          difficulty: input.difficulty ?? "intermediate",
          questionCount: count,
          subSpecialties: input.subSpecialties ?? [],
          startIndex: data.questions.length + 1,
          previousQuestionTexts: data.questions.map(item => item.textAr),
        }),
      }, z.object({ questions: z.array(questionSchema).length(count) }).strict());
      data.questions.push(...batch.questions.map(shuffleQuestionOptions));
    }
    const uniqueQuestions = new Set<string>();
    for (const question of data.questions) {
      const normalized = question.textAr.trim().toLowerCase().replace(/\s+/g, " ");
      if (uniqueQuestions.has(normalized) || new Set(question.options.map(option => option.id)).size !== 4 || new Set(question.options.map(option => option.text.trim().toLowerCase())).size !== 4) throw featureError("AI_INVALID_ASSESSMENT", "Assessment contains duplicate questions or options.");
      uniqueQuestions.add(normalized);
    }
    const attemptId = `att-${randomUUID()}`, now = new Date();
    const questions = data.questions.map((question, index) => ({ id: String(index + 1), textAr: question.textAr, options: question.options }));
    const answers = Object.fromEntries(data.questions.map((question, index) => [String(index + 1), question.correctOptionId]));
    const attempt: StoredAttempt = { attemptId, providerSpecialtyId: input.providerSpecialtyId, userId, status: "IN_PROGRESS", timeLimitMinutes: input.timeLimitMinutes, generationSource: "GEMINI", startedAt: now.toISOString(), expiresAt: new Date(now.getTime() + input.timeLimitMinutes * 60000).toISOString(), publicQuestions: questions, score: null, isPassed: null };
    await FirestoreService.saveAttempt(attempt, { attemptId, answers });
    return { attemptId, questions, timeLimitMinutes: input.timeLimitMinutes, generationSource: "GEMINI" };
  }
  private static owned(attempt: StoredAttempt | null, userId?: string): StoredAttempt {
    const actor = getTenantContext()?.actor;
    const owner = userId ?? actor?.userId;
    if (!attempt || !owner || attempt.userId !== owner || actor && actor.userId !== owner) throw featureError("NOT_FOUND", "Assessment attempt not found.", 404);
    return attempt;
  }
  private static result(attempt: StoredAttempt): AssessmentSubmitOutput {
    return { attemptId: attempt.attemptId, score: attempt.score!, isPassed: attempt.isPassed!, status: "COMPLETED", feedbackAr: attempt.feedbackAr!, strengths: attempt.strengths ?? [], weaknesses: attempt.weaknesses ?? [], completedAt: attempt.completedAt! };
  }
  public static async submitAssessment(attemptId: string, input: AssessmentSubmitInput, userId: string): Promise<AssessmentSubmitOutput> {
    const attempt = this.owned(await FirestoreService.getAttempt(attemptId), userId);
    if (attempt.status === "COMPLETED") return this.result(attempt);
    if (!attempt.expiresAt || Date.parse(attempt.expiresAt) <= Date.now()) throw featureError("ASSESSMENT_EXPIRED", "Assessment submission deadline has passed.", 410);
    const answerKey = await FirestoreService.getAnswerKey(attemptId);
    if (!answerKey || !attempt.publicQuestions.length || Object.keys(answerKey.answers).length !== attempt.publicQuestions.length) throw featureError("ASSESSMENT_KEY_MISSING", "The private answer key cannot be verified.");
    const answers: Record<string, string> = {};
    for (const [rawId, value] of Object.entries(input.submittedAnswers)) {
      const id = rawId.replace(/^q_/, "");
      const question = attempt.publicQuestions.find(item => String(item.id) === id);
      if (!question || !question.options.some(option => option.id === value) || answers[id]) throw featureError("ASSESSMENT_ANSWER_INVALID", "Unknown question, duplicate answer, or invalid option.", 400);
      answers[id] = value;
    }
    const correct = Object.entries(answerKey.answers).filter(([id, expected]) => answers[id] === expected).length;
    const score = Math.round(correct / attempt.publicQuestions.length * 100), isPassed = score >= env.ASSESSMENT_PASS_SCORE;
    const completed: StoredAttempt = { ...attempt, status: "COMPLETED", score, isPassed, completedAt: new Date().toISOString(), feedbackAr: `أجبت إجابة صحيحة عن ${correct} من ${attempt.publicQuestions.length} سؤالًا؛ النتيجة ${score}%. ${isPassed ? "اجتزت الحد المطلوب." : "لم تجتز الحد المطلوب."}`, strengths: [], weaknesses: [] };
    return this.result(await FirestoreService.completeAttempt(attemptId, userId, completed));
  }
  public static async getAttemptStatus(attemptId: string, userId?: string): Promise<AssessmentStatusOutput> {
    const attempt = this.owned(await FirestoreService.getAttempt(attemptId), userId);
    const status = attempt.status !== "COMPLETED" && attempt.expiresAt && Date.parse(attempt.expiresAt) <= Date.now() ? "EXPIRED" : attempt.status;
    return { attemptId: attempt.attemptId, status, score: attempt.score ?? null, isPassed: attempt.isPassed ?? null };
  }
}
