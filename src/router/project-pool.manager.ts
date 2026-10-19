import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { env } from "../core/config/env.js";
import { MODEL_CAPABILITIES } from "./model-registry.js";
import type { ProjectManifest } from "./types.js";
import { assertDurableStorage } from "./storage-policy.js";

/** Durable application budgets, not a claim about Google's actual quota. A shared volume is required across processes. */
export class ProjectPoolManager {
  private static projects: ProjectManifest[] | undefined;
  private static database: DatabaseSync | undefined;
  public static paidAllowed(): boolean { const budget = Number(process.env.WASEET_AI_PAID_DAILY_REQUEST_BUDGET); return process.env.WASEET_AI_ALLOW_PAID === "true" && Number.isSafeInteger(budget) && budget > 0 && budget <= 100000; }
  private static db(): DatabaseSync {
    assertDurableStorage();
    if (!this.database) {
      const dir = resolve(process.env.WASEET_AI_STATE_DIR ?? "work/state"); mkdirSync(dir, { recursive: true });
      this.database = new DatabaseSync(resolve(dir, "model-pool.sqlite"));
      this.database.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS gates (scope TEXT,model TEXT,until INTEGER NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(scope,model));
        CREATE TABLE IF NOT EXISTS blocked (alias TEXT PRIMARY KEY,reason TEXT NOT NULL,credential_hash TEXT);
        CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY,scope TEXT,model TEXT,at INTEGER,tokens INTEGER,active INTEGER,lease_until INTEGER,tier TEXT);
        CREATE INDEX IF NOT EXISTS usage_window ON usage(scope,model,at);`);
      const columns = this.database.prepare("PRAGMA table_info(blocked)").all() as Array<{ name: string }>;
      if (!columns.some(c => c.name === "credential_hash")) this.database.exec("ALTER TABLE blocked ADD COLUMN credential_hash TEXT;");
    }
    return this.database;
  }
  public static getProjects(): ProjectManifest[] {
    if (this.projects) return this.projects;
    const supportedModels = Object.keys(MODEL_CAPABILITIES), configured = process.env.WASEET_AI_PROJECTS_JSON ?? process.env.GEMINI_PROJECTS_JSON;
    if (configured) {
      const raw: unknown = JSON.parse(configured);
      if (!Array.isArray(raw) || raw.length > 64) throw new Error("Invalid AI project manifest");
      this.projects = raw.map((p: ProjectManifest) => {
        if (!p || typeof p.alias !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.alias) || typeof p.apiKey !== "string" || (p.projectId !== undefined && typeof p.projectId !== "string") || !["FREE", "PAID"].includes(p.tier)) throw new Error("Invalid AI project manifest");
        if (!Array.isArray(p.supportedModels) || p.supportedModels.some(m => typeof m !== "string") || [p.maxRpm, p.maxTpm, p.maxRpd].some(v => v !== undefined && (!Number.isInteger(v) || v < 1))) throw new Error("Invalid AI project budgets or model allowlist");
        return { ...p, projectId: p.projectId || "unverified", enabled: p.enabled === true && !!p.apiKey, supportedModels: p.supportedModels.filter(m => !!MODEL_CAPABILITIES[m]), maxRpm: p.maxRpm || 15, maxTpm: p.maxTpm || 100000, freeConfirmed: p.freeConfirmed === true || process.env.WASEET_AI_FREE_CONFIRMED === "true" };
      });
      if (new Set(this.projects.map(p => p.alias)).size !== this.projects.length) throw new Error("AI project aliases must be unique");
    } else {
      const source = env as unknown as Record<string, string>, keys = new Map<string, string>();
      for (const [name, value] of Object.entries({ ...source, ...process.env })) if (/^GEMINI_FREE_PROJECT_\d+_KEY$/.test(name) && value) keys.set(name, value);
      this.projects = [...keys].map(([name, apiKey], index) => ({ alias: `gemini-free-${index + 1}`, projectId: process.env[name.replace(/_KEY$/, "_ID")] || "unverified", apiKey,
        tier: "FREE", enabled: !!apiKey, supportedModels, maxRpm: 15, maxTpm: 100000, freeConfirmed: process.env.WASEET_AI_FREE_CONFIRMED === "true" }));
      const legacyKeys = [...new Set([...(process.env.LLM_API_KEYS ?? "").split(/[\s,;]+/), process.env.LLM_API_KEY ?? ""].map(k => k.trim()).filter(Boolean))];
      for (const apiKey of legacyKeys) if (!this.projects.some(p => p.apiKey === apiKey)) this.projects.push({ alias: `legacy-gemini-${this.projects.length + 1}`, projectId: `waseet-gcp-pool-${this.projects.length + 1}`, apiKey, tier: "FREE", enabled: true, supportedModels, maxRpm: 15, maxTpm: 100000, freeConfirmed: process.env.WASEET_AI_FREE_CONFIRMED === "true" });
      if (env.GEMINI_PAID_API_KEY) this.projects.push({ alias: "gemini-paid-primary", projectId: env.GEMINI_PAID_PROJECT_ID || "unverified", apiKey: env.GEMINI_PAID_API_KEY, tier: "PAID", enabled: this.paidAllowed(), supportedModels, maxRpm: 30, maxTpm: 100000 });
    }
    return this.projects;
  }
  public static setProjectsForTesting(projects: ProjectManifest[]): void { if (process.env.NODE_ENV !== "test") throw new Error("AI_TEST_ONLY"); this.projects = projects; }
  public static scope(project: ProjectManifest): string { return project.projectId && !project.projectId.includes("free-proj-") ? project.projectId : "unverified"; }
  public static isProjectAvailable(alias: string, model: string): boolean {
    const p = this.getProjects().find(p => p.alias === alias); if (!p) return false;
    const blocked = this.db().prepare("SELECT credential_hash FROM blocked WHERE alias=?").get(alias) as { credential_hash: string | null } | undefined, hash = createHash("sha256").update(p.apiKey).digest("hex");
    if (blocked) { if (!blocked.credential_hash) { this.db().prepare("UPDATE blocked SET credential_hash=? WHERE alias=?").run(hash, alias); return false; } if (blocked.credential_hash === hash) return false; this.db().prepare("DELETE FROM blocked WHERE alias=?").run(alias); }
    const row = this.db().prepare("SELECT until FROM gates WHERE scope=? AND model=?").get(this.scope(p), model) as { until: number } | undefined;
    return !row || row.until <= Date.now();
  }
  public static reserve(project: ProjectManifest, model: string, tokens = 0, leaseMs = 120000): string | null {
    const db = this.db(), now = Date.now(), scope = this.scope(project); db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE usage SET active=0 WHERE lease_until<=?").run(now); db.prepare("DELETE FROM usage WHERE at<? AND active=0").run(now - 172800000);
      if (!this.isProjectAvailable(project.alias, model)) { db.exec("COMMIT"); return null; }
      const counts = db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(tokens),0) AS tokens,COALESCE(SUM(active),0) AS active FROM usage WHERE scope=? AND model=? AND at>?").get(scope, model, now - 60000) as { count: number; tokens: number; active: number };
      const active = db.prepare("SELECT COUNT(*) AS count FROM usage WHERE scope=? AND active=1").get(scope) as { count: number };
      const daily = db.prepare("SELECT COUNT(*) AS count FROM usage WHERE scope=? AND model=? AND at>?").get(scope, model, now - 86400000) as { count: number };
      const paid = db.prepare("SELECT COUNT(*) AS count FROM usage WHERE tier='PAID' AND at>?").get(now - 86400000) as { count: number };
      if (counts.count >= project.maxRpm || counts.tokens + tokens > project.maxTpm || active.count >= 2 || (project.maxRpd && daily.count >= project.maxRpd) || (project.tier === "PAID" && paid.count >= Number(process.env.WASEET_AI_PAID_DAILY_REQUEST_BUDGET || 0))) { db.exec("COMMIT"); return null; }
      const id = randomUUID(); db.prepare("INSERT INTO usage VALUES(?,?,?,?,?,?,?,?)").run(id, scope, model, now, tokens, 1, now + leaseMs, project.tier); db.exec("COMMIT"); return id;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  public static release(id: string, tokens?: number): void { if (tokens !== undefined) this.db().prepare("UPDATE usage SET active=0,tokens=? WHERE id=?").run(tokens, id); else this.db().prepare("UPDATE usage SET active=0 WHERE id=?").run(id); }
  public static accountTokens(id: string, tokens: number): void { if (Number.isFinite(tokens) && tokens >= 0) this.db().prepare("UPDATE usage SET tokens=? WHERE id=?").run(tokens, id); }
  public static recordRateLimit(alias: string, model: string, durationMs = 60000): void {
    const p = this.getProjects().find(p => p.alias === alias); if (!p) return;
    this.db().prepare("INSERT INTO gates VALUES(?,?,?,1) ON CONFLICT(scope,model) DO UPDATE SET until=MAX(until,excluded.until),count=count+1").run(this.scope(p), model, Date.now() + Math.min(86400000, Math.max(1000, durationMs)));
  }
  public static recordSuccess(_alias: string, _model: string): void { /* Never erase a concurrent vendor cooldown. */ }
  public static blockAuthentication(alias: string): void { const project = this.getProjects().find(p => p.alias === alias); if (project) this.db().prepare("INSERT OR REPLACE INTO blocked(alias,reason,credential_hash) VALUES(?,?,?)").run(alias, "authentication", createHash("sha256").update(project.apiKey).digest("hex")); }
  public static resetCooldowns(): void { if (process.env.NODE_ENV !== "test") throw new Error("AI_POLICY: cooldown resets are restricted to tests"); this.db().exec("DELETE FROM gates;DELETE FROM blocked;DELETE FROM usage;"); }
  public static catalog(): Array<Record<string, unknown>> { return this.getProjects().map(({ apiKey: key, ...p }) => ({ ...p, credentialConfigured: !!key })); }
  public static diagnostics(): Record<string, unknown> { return { credentialsConfigured: this.getProjects().filter(p => p.enabled && p.apiKey).length, freeConfirmedCredentials: this.getProjects().filter(p => p.enabled && p.freeConfirmed && p.tier === "FREE").length, verifiedProjectIdentities: [...new Set(this.getProjects().map(p => this.scope(p)).filter(id => id !== "unverified"))].length, unknownProjectCredentials: this.getProjects().filter(p => this.scope(p) === "unverified").length, paidEnabled: this.paidAllowed(), quotaStore: "sqlite-shared-volume", remoteAvailabilityVerified: false }; }
}
