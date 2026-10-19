import { ProjectPoolManager } from "./project-pool.manager.js";
import { modelRoute } from "./model-registry.js";
import type { DataClassification, ModelEffort, ModelTier, ProjectManifest, RouterSelectionResult } from "./types.js";

export class AiProviderError extends Error {
  constructor(public code: string, public status = 503, public retryAfterMs?: number) { super(code); }
  get statusCode(): number { return this.status; }
}
export class SmartRouter {
  private static rrIndex = 0;
  public static getCandidateModels(tier: ModelTier, preferred?: string, effort?: ModelEffort, pin?: string): string[] { return modelRoute(tier, effort, preferred, pin); }
  public static isFreeEligible(c: DataClassification): boolean { return c === "PUBLIC_APPROVED" || c === "SYNTHETIC" || (process.env.NODE_ENV !== "test" && process.env.WASEET_AI_FREE_CONFIRMED === "true"); }
  public static selectForModels(models: readonly string[], classification: DataClassification, excluded = new Set<string>()): RouterSelectionResult | null {
    const baseProjects = ProjectPoolManager.getProjects().filter(p => p.enabled && p.apiKey && (p.tier === "FREE" ? this.isFreeEligible(classification) && p.freeConfirmed === true : ProjectPoolManager.paidAllowed()));
    const offset = process.env.NODE_ENV === "test" || baseProjects.length <= 1 ? 0 : (this.rrIndex++ % baseProjects.length);
    const projects = offset === 0 ? baseProjects : [...baseProjects.slice(offset), ...baseProjects.slice(0, offset)];
    const ranked = [...models].sort((a, b) => Number(excluded.has(`404:${a}`)) - Number(excluded.has(`404:${b}`)));
    for (const model of ranked) for (const p of projects) {
      if (excluded.has(`${p.alias}:${model}`) || excluded.has(`${ProjectPoolManager.scope(p)}:${model}`) || !p.supportedModels.includes(model) || !ProjectPoolManager.isProjectAvailable(p.alias, model)) continue;
      return { project: p, model, tier: "LIGHT", classification };
    }
    return null;
  }
  public static selectNextProject(tier: ModelTier, c: DataClassification, excluded = new Set<string>(), preferred?: string, effort?: ModelEffort, pin?: string): RouterSelectionResult | null { const s = this.selectForModels(modelRoute(tier, effort, preferred, pin), c, excluded); return s ? { ...s, tier } : null; }
  public static handleFailure(project: ProjectManifest, model: string, err: unknown, excluded: Set<string>): boolean {
    const e = err as { status?: number; statusCode?: number; retryAfterMs?: number; code?: string }, status = e.status ?? e.statusCode;
    if (e.code && !e.code.startsWith("AI_PROVIDER_HTTP_") && e.code !== "AI_AUTH_FAILED") return false;
    if (status === 401 || status === 403 || e.code === "AI_AUTH_FAILED") { ProjectPoolManager.blockAuthentication(project.alias); throw new AiProviderError("AI_AUTH_FAILED"); }
    if (status === 404) { excluded.add(`404:${model}`); excluded.add(`${ProjectPoolManager.scope(project)}:${model}`); return true; }
    if (status === 429 || status === 503) { ProjectPoolManager.recordRateLimit(project.alias, model, e.retryAfterMs ?? (status === 429 ? 60000 : 5000)); excluded.add(`${project.alias}:${model}`); return true; }
    return false;
  }
  public static async executeWithFailover<T>(tier: ModelTier, c: DataClassification, operation: (project: ProjectManifest, model: string) => Promise<T>, maxAttempts = 3, preferred?: string, effort?: ModelEffort, pin?: string, signal?: AbortSignal, estimatedTokens = 0): Promise<{ result: T; projectUsed: ProjectManifest; modelUsed: string }> {
    const excluded = new Set<string>();
    for (let attempt = 0; attempt < Math.min(maxAttempts, 8); attempt++) {
      signal?.throwIfAborted(); const choice = this.selectNextProject(tier, c, excluded, preferred, effort, pin);
      if (!choice) throw new AiProviderError(this.isFreeEligible(c) ? "AI_ROUTE_UNAVAILABLE" : "AI_DATA_POLICY_BLOCKED");
      const lease = ProjectPoolManager.reserve(choice.project, choice.model, estimatedTokens); if (!lease) { excluded.add(`${choice.project.alias}:${choice.model}`); continue; }
      try { const result = await operation(choice.project, choice.model); signal?.throwIfAborted(); return { result, projectUsed: choice.project, modelUsed: choice.model }; }
      catch (err) { signal?.throwIfAborted(); if (!this.handleFailure(choice.project, choice.model, err, excluded)) throw err; }
      finally { ProjectPoolManager.release(lease); }
    }
    throw new AiProviderError("AI_ATTEMPTS_EXHAUSTED");
  }
}
