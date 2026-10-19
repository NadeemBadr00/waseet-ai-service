import { DurableStore } from "./durable-store.js";
import { getTenantContext } from "../auth/tenant-context.js";
import { featureError } from "../security/model-output.js";
import { rankKnowledge, type RetrievalOptions } from "../knowledge/retrieval.js";
import { SemanticKnowledgeIndex } from "../knowledge/semantic-index.js";
import { deadlineSignal } from "../../router/transport.js";

export interface StoredAttempt {
  attemptId: string; providerSpecialtyId: string; userId: string;
  status: "GENERATING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "FAILED";
  timeLimitMinutes: number; generationSource: string; startedAt?: string; expiresAt?: string; completedAt?: string;
  score?: number | null; isPassed?: boolean | null; feedbackAr?: string; strengths?: string[]; weaknesses?: string[];
  publicQuestions: Array<{ id: string | number; textAr: string; options: Array<{ id: string; text: string }> }>;
}
export interface PrivateAnswerKey { attemptId: string; answers: Record<string, string> }
export interface StoredJob { jobId: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED"; total: number; processed: number; results: Array<{ id: string; status: string; isApproved?: boolean | null; score?: number }>; createdAt: string; updatedAt: string }
export interface StoredKnowledgeDoc {
  documentId: string; version: string; title: string; locale: string; content: string;
  status: "DRAFT" | "APPROVED" | "DEPRECATED"; audience: "all" | "client" | "provider" | "admin";
  createdAt: string; sourceUrl?: string; sourceVersion?: number; approvedBy?: string; approvedAt?: string;
  ownerId?: string; embedding?: number[]; embeddingModel?: string;
  /** Server-owned, hash/version-bound chunk vectors. Never accepted from search clients. */
  embeddingChunks?: Array<{ start: number; end: number; content: string; embedding: number[]; model: string }>;
}

/** Compatibility name. The adapter is durable SQLite, never a pretend Firestore cloud connection. */
export class FirestoreService {
  public static async saveAttempt(attempt: StoredAttempt, answerKey?: PrivateAnswerKey): Promise<void> {
    DurableStore.transaction(() => { DurableStore.put("assessment", attempt.attemptId, attempt); if (answerKey) DurableStore.put("assessment-private", attempt.attemptId, answerKey); });
  }
  public static async getAttempt(id: string): Promise<StoredAttempt | null> { return DurableStore.get("assessment", id); }
  public static async getAnswerKey(id: string): Promise<PrivateAnswerKey | null> { return DurableStore.get("assessment-private", id); }
  public static async completeAttempt(id: string, userId: string, completed: StoredAttempt): Promise<StoredAttempt> {
    return DurableStore.transaction(() => {
      const existing = DurableStore.get<StoredAttempt>("assessment", id);
      if (!existing || existing.userId !== userId) throw featureError("NOT_FOUND", "Assessment not found.", 404);
      if (existing.status === "COMPLETED") return existing;
      if (!existing.expiresAt || Date.parse(existing.expiresAt) <= Date.now()) throw featureError("ASSESSMENT_EXPIRED", "Assessment has expired.", 409);
      DurableStore.put("assessment", id, completed); return completed;
    });
  }
  public static async saveJob(job: StoredJob): Promise<void> { DurableStore.put("job", job.jobId, job); }
  public static async getJob(id: string): Promise<StoredJob | null> { return DurableStore.get("job", id); }
  public static async upsertKnowledge(doc: StoredKnowledgeDoc): Promise<void> {
    DurableStore.transaction(() => {
      const previous = DurableStore.get<StoredKnowledgeDoc>("knowledge", doc.documentId);
      if (previous && (doc.sourceVersion ?? 1) < (previous.sourceVersion ?? 1)) throw featureError("STALE_SOURCE_VERSION", "A newer knowledge document already exists.", 409);
      if (previous && (doc.sourceVersion ?? 1) === (previous.sourceVersion ?? 1) && ["content", "title", "ownerId", "audience", "locale", "sourceUrl"].some(field => previous[field as keyof StoredKnowledgeDoc] !== doc[field as keyof StoredKnowledgeDoc])) throw featureError("SOURCE_VERSION_CONFLICT", "Knowledge facts changed without increasing sourceVersion.", 409);
      DurableStore.put("knowledge", doc.documentId, doc);
      SemanticKnowledgeIndex.invalidate(doc.documentId);
    });
  }
  public static async deleteKnowledge(id: string): Promise<boolean> { SemanticKnowledgeIndex.invalidate(id); return DurableStore.remove("knowledge", id); }
  public static async getKnowledge(id: string): Promise<StoredKnowledgeDoc | null> { return DurableStore.get("knowledge", id); }
  public static async searchApprovedKnowledge(query: string, audience?: string, options: RetrievalOptions = {}): Promise<StoredKnowledgeDoc[]> {
    return (await this.searchApprovedKnowledgeWithMode(query, audience, options)).documents;
  }
  public static async searchApprovedKnowledgeWithMode(query: string, audience?: string, options: RetrievalOptions = {}): Promise<{ documents: StoredKnowledgeDoc[]; retrievalMode: "hybrid" | "lexical" }> {
    const context = getTenantContext();
    context?.signal?.throwIfAborted();
    const role = context?.actor.role ?? audience ?? "all";
    const visible = DurableStore.list<StoredKnowledgeDoc>("knowledge").filter(doc =>
      doc.status === "APPROVED" && !!doc.approvedBy && !!doc.approvedAt &&
      (doc.audience === "all" || role === "system" || role === "admin" || doc.audience === role) &&
      (!doc.ownerId || doc.ownerId === context?.actor.userId) &&
      (!options.locale || doc.locale === options.locale) &&
      (!options.sourceVersion || (doc.sourceVersion ?? 1) >= options.sourceVersion));
    let retrievalMode: "hybrid" | "lexical" = options.queryEmbedding && options.embeddingModel ? "hybrid" : "lexical";
    if (visible.length && !options.queryEmbedding && process.env.WASEET_AI_KNOWLEDGE_SEMANTIC === "true") {
      const model = process.env.WASEET_AI_KNOWLEDGE_EMBEDDING_MODEL ?? "gemini-embedding-2";
      const deadline = deadlineSignal({ signal: context?.signal, deadlineMs: 20000 });
      try {
        // Existing documents migrate lazily; each request has a bounded indexing window.
        for (const [index, doc] of visible.entries()) {
          const cached = SemanticKnowledgeIndex.read(doc, model);
          const chunks = cached ?? (index < 16 ? await SemanticKnowledgeIndex.index(doc, model, deadline.signal) : undefined);
          if (chunks?.length) doc.embeddingChunks = chunks.map(chunk => ({ ...chunk, model }));
        }
        if (visible.some(doc => doc.embeddingChunks?.length || doc.embeddingModel === model && doc.embedding?.length === 768)) {
        const { embedText } = await import("../../runtime/voice.js");
        const embedded = await embedText({ text: query, model, dimensions: 768, purpose: "RETRIEVAL_QUERY", classification: "PERSONAL" }, { signal: deadline.signal, maxAttempts: 1 });
        options = { ...options, queryEmbedding: embedded.vector, embeddingModel: embedded.model };
        retrievalMode = "hybrid";
        }
      } catch (error) {
        context?.signal?.throwIfAborted();
        if (!deadline.signal.aborted && !(error as { code?: string }).code?.startsWith("AI_")) throw error;
        // A quota/auth/privacy failure never fabricates vectors or removes lexical access.
        retrievalMode = "lexical";
      } finally { deadline.dispose(); }
    }
    context?.signal?.throwIfAborted();
    return { documents: rankKnowledge(query, visible, options), retrievalMode };
  }
  public static async upsertCatalog(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
    DurableStore.transaction(() => {
      const previous = DurableStore.get<Record<string, unknown>>(`catalog:${collection}`, id);
      const version = Number(data["sourceVersion"] ?? 1);
      if (previous && version < Number(previous["sourceVersion"] ?? 1)) throw featureError("STALE_SOURCE_VERSION", "A newer catalog record already exists.", 409);
      if (!Number.isInteger(version) || version < 1) throw featureError("INVALID_SOURCE_VERSION", "Catalog sourceVersion must be a positive integer.", 400);
      DurableStore.put(`catalog:${collection}`, id, { ...data, id, updatedAt: new Date().toISOString() });
    });
  }
  public static async deleteCatalog(collection: string, id: string): Promise<boolean> { return DurableStore.remove(`catalog:${collection}`, id); }
  public static async getCatalog(collection: string, id: string): Promise<Record<string, unknown> | null> { return DurableStore.get(`catalog:${collection}`, id); }
  public static async searchCatalog(collection: string, filterFn: (item: Record<string, unknown>) => boolean): Promise<Array<Record<string, unknown>>> {
    return DurableStore.list<Record<string, unknown>>(`catalog:${collection}`).filter(filterFn);
  }
  public static clear(): void { DurableStore.clear(); }
}
