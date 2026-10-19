import type { FastifyPluginAsync } from "fastify";
import { AssessmentGenerationInputSchema, AssessmentSubmitInputSchema } from "./assessment.types.js";
import { AssessmentEngineService } from "./assessment-engine.service.js";
import { OnboardingQuizService } from "./onboarding-quiz.service.js";
import { z } from "zod";

export const assessmentRoutes: FastifyPluginAsync = async (fastify) => {
  // AI-08: Skill Assessment Generation
  fastify.post("/v1/ai/assessments", async (request) => {
    const input = AssessmentGenerationInputSchema.parse(request.body);
    const userId = (request as unknown as { tenantContext?: { actor: { userId: string } } }).tenantContext?.actor.userId ?? "system-user";
    const data = await AssessmentEngineService.generateAssessment(input, userId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI2-06: Assessment Real-Time Question Streaming
  fastify.post("/v1/ai/assessments/stream", async (request, reply) => {
    const input = AssessmentGenerationInputSchema.parse(request.body);
    const userId = (request as unknown as { tenantContext?: { actor: { userId: string } } }).tenantContext?.actor.userId ?? "system-user";
    const assessment = await AssessmentEngineService.generateAssessment(input, userId);

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    // Stream each validated question
    for (const q of assessment.questions) {
      reply.raw.write(
        `event: question.streamed\ndata: ${JSON.stringify({ attemptId: assessment.attemptId, question: q })}\n\n`
      );
    }

    // Ready event
    reply.raw.write(
      `event: assessment.ready\ndata: ${JSON.stringify({
        attemptId: assessment.attemptId,
        totalQuestions: assessment.questions.length,
        timeLimitMinutes: assessment.timeLimitMinutes,
        generationSource: assessment.generationSource,
      })}\n\n`
    );
    reply.raw.end();
  });

  // AI-08 & AI2-07: Submit Assessment Answers
  fastify.post("/v1/ai/assessments/:attemptId/submit", async (request, reply) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const input = AssessmentSubmitInputSchema.parse(request.body);
    const userId = (request as unknown as { tenantContext?: { actor: { userId: string } } }).tenantContext?.actor.userId ?? "system-user";

    try {
      const data = await AssessmentEngineService.submitAssessment(params.attemptId, input, userId);
      return { success: true, requestId: `req-${Date.now()}`, data };
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith("ALREADY_FINALIZED")) {
        return reply.status(409).send({
          success: false,
          error: { code: "ALREADY_FINALIZED", message: error.message },
        });
      }
      if (error.message.startsWith("ASSESSMENT_EXPIRED")) {
        return reply.status(410).send({
          success: false,
          error: { code: "ASSESSMENT_EXPIRED", message: error.message },
        });
      }
      throw err;
    }
  });

  // AI2-05: Assessment Status
  fastify.get("/v1/ai/assessments/:attemptId/status", async (request) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const data = await AssessmentEngineService.getAttemptStatus(params.attemptId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-09: Onboarding Calibration Quiz - Init
  fastify.post("/v1/ai/onboarding-quizzes", async (request) => {
    const userId = (request as unknown as { tenantContext?: { actor: { userId: string } } }).tenantContext?.actor.userId ?? "system-user";
    const data = await OnboardingQuizService.initQuiz(userId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-09: Onboarding Calibration Quiz - Record Answer
  fastify.post("/v1/ai/onboarding-quizzes/:attemptId/answers", async (request) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const body = z.object({ questionId: z.string(), answerIndex: z.number().int().nonnegative() }).parse(request.body);
    const data = await OnboardingQuizService.recordAnswer(params.attemptId, body);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // AI-09: Onboarding Calibration Quiz - Result / Status
  fastify.get("/v1/ai/onboarding-quizzes/:attemptId/status", async (request) => {
    const params = z.object({ attemptId: z.string() }).parse(request.params);
    const data = await OnboardingQuizService.getResult(params.attemptId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
};
