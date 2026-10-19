import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { ProjectDraftService } from "../features/client-projects/project-draft.service.js";
import { AssessmentEngineService } from "../features/assessments/assessment-engine.service.js";
import { OnboardingQuizService } from "../features/assessments/onboarding-quiz.service.js";
import { ProposalAuditService } from "../features/proposals/proposal-audit.service.js";
import { HelpService } from "../features/help/help.service.js";
import { AvatarSpeechService } from "../features/avatar/avatar-speech.service.js";
import { TextEnhanceService } from "../features/client-projects/text-enhance.service.js";
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { TenantAuthService } from "../core/auth/tenant-auth.service.js";
import { tenantStorage, type TenantContext } from "../core/auth/tenant-context.js";
import { inferenceSignalStorage } from "../router/request-scope.js";

export interface MockSocket {
  emit: (event: string, payload: Record<string, unknown>) => void;
  userId: string;
  tenantContext?: TenantContext;
  signal?: AbortSignal;
}

export class SocketBridge {
  private static io: Server | null = null;
  private static async authenticateSocket(socket: Socket): Promise<TenantContext> {
    const token = socket.handshake.auth?.token as unknown;
    const authorization = typeof token === "string" && token.length <= 20000 ? `Bearer ${token.replace(/^Bearer /, "")}` : socket.handshake.headers.authorization;
    let rejection = "AUTH_REQUIRED";
    const request = { headers: { authorization }, body: undefined } as FastifyRequest;
    const reply = { status() { return this; }, send(value: { error?: { code?: string } }) { rejection = value.error?.code ?? "AUTH_INVALID"; } } as unknown as FastifyReply;
    const context = await TenantAuthService.authenticate(request, reply); if (!context) throw new Error(rejection); return context;
  }
  public static async shutdown(): Promise<void> { const io = this.io; this.io = null; if (io) await new Promise<void>(resolve => io.close(() => resolve())); }

  public static initSocketIOServer(server: HttpServer): Server {
    if (this.io) return this.io;
    this.io = new Server(server, {
      cors: { origin: (process.env.WASEET_AI_ALLOWED_ORIGINS ?? "http://localhost:4200").split(",").map(v => v.trim()), methods: ["GET", "POST"] },
    });
    this.io.use((socket, next) => {
      void this.authenticateSocket(socket).then(context => { socket.data.tenantContext = context; next(); }).catch(error => next(error as Error));
    });

    this.io.on("connection", (socket: Socket) => {
      const context = socket.data.tenantContext as TenantContext;
      const adapter: MockSocket = {
        userId: context.actor.userId,
        tenantContext: context,
        emit: (event: string, payload: Record<string, unknown>) => socket.emit(event, payload),
      };
      this.bindSocketEvents(socket, adapter);
    });

    return this.io;
  }

  public static bindSocketEvents(socket: Socket, adapter: MockSocket): void {
    const active = new Map<string, AbortController>(), connection = new AbortController(); let counter = 0; let bucket = { count: 0, reset: Date.now() + 60000 };
    socket.on("disconnect", () => { connection.abort(); for (const controller of active.values()) controller.abort(); });
    socket.on("ai:cancel", (data: unknown) => { const parsed = z.object({ requestId: z.string().max(120) }).strict().safeParse(data); if (parsed.success) active.get(parsed.data.requestId)?.abort(); });
    const bind = <T>(event: string, schema: z.ZodType<T>, handler: (adapter: MockSocket, data: T) => Promise<void>) => socket.on(event, (data: unknown) => {
      const parsed = schema.safeParse(data); if (!parsed.success) { adapter.emit("ai:error", { code: "VALIDATION_ERROR", event }); return; }
      if (bucket.reset <= Date.now()) bucket = { count: 0, reset: Date.now() + 60000 };
      if (++bucket.count > 30 || active.size >= 2) { adapter.emit("ai:error", { code: "RATE_LIMIT", event }); return; }
      const requestId = `${socket.id}-${++counter}`, controller = new AbortController(), signal = AbortSignal.any([connection.signal, controller.signal]); active.set(requestId, controller);
      const scopedAdapter: MockSocket = { ...adapter, signal, emit: (name, value) => { if (!signal.aborted) adapter.emit(name, { ...value, requestId }); } }; adapter.emit("ai:started", { requestId, event });
      const run = () => inferenceSignalStorage.run(signal, () => handler(scopedAdapter, parsed.data));
      // Revalidate expiration and revocation on each operation, including long-lived socket connections.
      const work = this.authenticateSocket(socket).then(context => { if (context.actor.userId !== adapter.userId || context.clientId !== adapter.tenantContext?.clientId) throw new Error("ACTOR_MISMATCH"); signal.throwIfAborted(); return tenantStorage.run(context, run); });
      void work.catch(error => { scopedAdapter.emit("ai:error", { code: (error as Error).message.startsWith("AUTH_") ? (error as Error).message : "OPERATION_FAILED", event }); if ((error as Error).message.startsWith("AUTH_")) socket.disconnect(true); }).finally(() => active.delete(requestId));
    });
    const short = z.string().min(1).max(200);
    bind("ai:generate_description", z.object({ title: z.string().min(1).max(1000), category: short.optional() }).strict(), this.handleGenerateDescription.bind(this));
    bind("start_assessment", z.object({ providerSpecialtyId: short }).strict(), this.handleStartAssessment.bind(this));
    bind("submit_answer", z.object({ attemptId: short, submittedAnswers: z.record(z.string().max(200), z.string().max(2000)).refine(v => Object.keys(v).length <= 100) }).strict(), this.handleSubmitAnswer.bind(this));
    bind("setup_test:init", z.unknown(), adapter => this.handleSetupTestInit(adapter));
    bind("setup_test:answer", z.object({ attemptId: short, questionId: short, answerIndex: z.number().int().min(0).max(20) }).strict(), this.handleSetupTestAnswer.bind(this));
    bind("trigger_ai_audit", z.object({ providerId: short, projectId: short }).strict(), this.handleTriggerAiAudit.bind(this));
    bind("help:ask", z.object({ question: z.string().min(1).max(6000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }).strict()).max(20).optional() }).strict(), this.handleHelpAsk.bind(this));
    bind("ai_chat", z.object({ message: z.string().min(1).max(8000) }).strict(), this.handleAiChat.bind(this));
    bind("stream_ai_suggest_text", z.object({ title: z.string().min(1).max(1000) }).strict(), this.handleStreamSuggestText.bind(this));
    bind("stream_ai_enhance_description", z.object({ description: z.string().min(1).max(24000) }).strict(), this.handleStreamEnhanceDescription.bind(this));
  }

  public static async handleGenerateDescription(socket: MockSocket, data: { title: string; category?: string }): Promise<void> {
    try {
      for await (const chunk of ProjectDraftService.generateDescriptionStream({ title: data.title, category: data.category, language: "ar" })) {
        socket.emit("ai:description_chunk", { event: "ai:description_chunk", chunk: chunk.chunk });
      }
      socket.emit("ai:description_complete", { event: "ai:description_complete" });
    } catch (err: unknown) {
      socket.emit("ai:description_error", { event: "ai:description_error", message: (err as Error).message });
    }
  }

  public static async handleStartAssessment(socket: MockSocket, data: { providerSpecialtyId: string }): Promise<void> {
    try {
      const assessment = await AssessmentEngineService.generateAssessment({
        providerSpecialtyId: data.providerSpecialtyId,
        specialtyName: "تطوير برمجيات",
        questionCount: 20,
        timeLimitMinutes: 15,
      }, socket.userId);
      for (const q of assessment.questions) {
        socket.emit("question_streamed", { attemptId: assessment.attemptId, question: q });
      }
      socket.emit("assessment_ready", {
        attemptId: assessment.attemptId,
        totalQuestions: assessment.questions.length,
        timeLimitMinutes: assessment.timeLimitMinutes,
        generationSource: assessment.generationSource,
      });
    } catch (err: unknown) {
      socket.emit("assessment_error", { code: "GENERATION_FAILED", message: (err as Error).message });
    }
  }

  public static async handleSubmitAnswer(socket: MockSocket, data: { attemptId: string; submittedAnswers: Record<string, string> }): Promise<void> {
    try {
      const result = await AssessmentEngineService.submitAssessment(data.attemptId, { submittedAnswers: data.submittedAnswers }, socket.userId);
      socket.emit("evaluation_complete", result as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      const code = msg.includes("ALREADY_FINALIZED")
        ? "ALREADY_FINALIZED"
        : msg.includes("EXPIRED")
        ? "ASSESSMENT_EXPIRED"
        : msg.includes("NOT_FOUND")
        ? "NOT_FOUND"
        : "SUBMISSION_FAILED";
      socket.emit("assessment_error", { code, message: msg });
    }
  }

  public static async handleSetupTestInit(socket: MockSocket): Promise<void> {
    try {
      const quiz = await OnboardingQuizService.initQuiz(socket.userId);
      socket.emit("setup_test:ready", {
        event: "setup_test:ready",
        attemptId: quiz.attemptId,
        totalQuestions: quiz.totalQuestions,
        questions: quiz.questions,
      });
    } catch (err: unknown) {
      socket.emit("setup_test:error", { message: (err as Error).message });
    }
  }

  public static async handleSetupTestAnswer(socket: MockSocket, data: { attemptId: string; questionId: string; answerIndex: number }): Promise<void> {
    try {
      const res = await OnboardingQuizService.recordAnswer(data.attemptId, { questionId: data.questionId, answerIndex: data.answerIndex });
      if (res.isCompleted) {
        const finalResult = await OnboardingQuizService.getResult(data.attemptId);
        socket.emit("setup_test:result", { event: "setup_test:result", ...finalResult });
      }
    } catch (err: unknown) {
      socket.emit("setup_test:error", { message: (err as Error).message });
    }
  }

  public static async handleTriggerAiAudit(socket: MockSocket, data: { providerId: string; projectId: string }): Promise<void> {
    try {
      for await (const msg of ProposalAuditService.auditProposalStream({ providerId: data.providerId, projectId: data.projectId })) {
        socket.emit(msg.event, { event: msg.event, ...msg.data });
      }
    } catch (err: unknown) {
      socket.emit("ai_audit_error", { message: (err as Error).message });
    }
  }

  public static async handleHelpAsk(socket: MockSocket, data: { question: string; history?: Array<{ role: "user" | "assistant" | "system"; content: string }> }): Promise<void> {
    try {
      for await (const msg of HelpService.askStream({ question: data.question, history: (data.history ?? []).filter((item): item is { role: "user" | "assistant"; content: string } => item.role !== "system") })) {
        socket.emit(msg.event, { event: msg.event, ...msg.data });
      }
    } catch (err: unknown) {
      socket.emit("help:error", { event: "help:error", message: (err as Error).message, human_support_fallback: true });
    }
  }

  public static async handleAiChat(socket: MockSocket, data: { message: string }): Promise<void> {
    try {
      const chat = await AvatarSpeechService.chatWithAvatar({ message: data.message, locale: "ar", includeBase64: true }, socket.signal);
      socket.emit("ai_chat_response", { text: chat.text, audio: chat.audio.base64Audio, audioStatus: chat.audio.status });
    } catch (err: unknown) {
      socket.emit("ai_chat_response", { error: (err as Error).message });
    }
  }

  public static async handleStreamSuggestText(socket: MockSocket, data: { title: string }): Promise<void> {
    try {
      for await (const chunk of TextEnhanceService.suggestTextStream(data.title)) {
        socket.emit("ai_text:chunk", { chunk: chunk.chunk });
      }
      socket.emit("ai_text:complete", { status: "complete" });
    } catch (err: unknown) {
      socket.emit("ai_text:error", { message: (err as Error).message });
    }
  }

  public static async handleStreamEnhanceDescription(socket: MockSocket, data: { description: string }): Promise<void> {
    try {
      for await (const chunk of TextEnhanceService.enhanceDescriptionStream(data.description)) {
        socket.emit("ai_text:chunk", { chunk: chunk.chunk });
      }
      socket.emit("ai_text:complete", { status: "complete" });
    } catch (err: unknown) {
      socket.emit("ai_text:error", { message: (err as Error).message });
    }
  }
}
