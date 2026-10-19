import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tenantNamespace } from "../auth/tenant-context.js";
import { DataSanitizer } from "./sanitizer.js";
import { embedText, embeddingText } from "../../runtime/voice.js";
import { StatisticalPricingEngine, type StatisticalPricingResult } from "./pricing-engine.js";

export interface CompletedProjectRecord {
  projectId: string;
  category: string;
  subSpecialty?: string;
  scopeSummary: string;
  durationDays: number;
  budgetAmount: number;
  currency?: string;
  milestonesCount?: number;
  milestonesSummary?: string;
  rating: number;
  escrowReleased?: boolean;
  disputeCount?: number;
  vector?: number[];
  completedAt: string;
}

export interface ProjectSearchResult {
  project: Omit<CompletedProjectRecord, "vector">;
  similarity: number;
}

export class ProjectVectorStore {
  private static db: DatabaseSync | undefined;
  public static readonly EMBEDDING_MODEL = "gemini-embedding-2";
  public static readonly EMBEDDING_DIMENSIONS = 768;

  private static connect(): DatabaseSync {
    if (this.db) return this.db;
    const directory = resolve(process.env.WASEET_AI_STATE_DIR || join(process.cwd(), "work", "state"));
    mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, "project-vectors.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS completed_projects (
        project_id TEXT NOT NULL,
        tenant TEXT NOT NULL,
        category TEXT NOT NULL,
        sub_specialty TEXT,
        scope_summary TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        budget_amount REAL NOT NULL,
        currency TEXT NOT NULL,
        milestones_count INTEGER NOT NULL,
        milestones_summary TEXT,
        rating REAL NOT NULL,
        model_version TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector_blob BLOB NOT NULL,
        completed_at TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tenant, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_completed_projects_tenant_cat ON completed_projects(tenant, category);
      CREATE INDEX IF NOT EXISTS idx_completed_projects_rating ON completed_projects(tenant, rating);
    `);
    const columns = db.prepare("PRAGMA table_info(completed_projects)").all() as Array<{ name: string; pk: number }>;
    const tenantCol = columns.find(c => c.name === "tenant");
    if (tenantCol && tenantCol.pk === 0) {
      db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE completed_projects_v2 (
          project_id TEXT NOT NULL,
          tenant TEXT NOT NULL,
          category TEXT NOT NULL,
          sub_specialty TEXT,
          scope_summary TEXT NOT NULL,
          duration_days INTEGER NOT NULL,
          budget_amount REAL NOT NULL,
          currency TEXT NOT NULL,
          milestones_count INTEGER NOT NULL,
          milestones_summary TEXT,
          rating REAL NOT NULL,
          model_version TEXT NOT NULL,
          dimensions INTEGER NOT NULL,
          vector_blob BLOB NOT NULL,
          completed_at TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (tenant, project_id)
        );
        INSERT OR REPLACE INTO completed_projects_v2 SELECT * FROM completed_projects;
        DROP TABLE completed_projects;
        ALTER TABLE completed_projects_v2 RENAME TO completed_projects;
        CREATE INDEX IF NOT EXISTS idx_completed_projects_tenant_cat ON completed_projects(tenant, category);
        CREATE INDEX IF NOT EXISTS idx_completed_projects_rating ON completed_projects(tenant, rating);
        COMMIT;
      `);
    }
    this.db = db;
    return db;
  }

  /**
   * Strict Quality Gate: evaluates if a project qualifies for inclusion in vector memory.
   */
  public static isEligible(project: CompletedProjectRecord): boolean {
    if (!project.projectId || !project.scopeSummary || project.scopeSummary.trim().length < 15) return false;
    if (project.rating < 3.5) return false;
    if (project.escrowReleased === false) return false;
    if (typeof project.disputeCount === "number" && project.disputeCount > 0) return false;
    return true;
  }

  /**
   * Formats text using Google's official asymmetric retrieval prefix.
   */
  public static formatDocumentText(project: CompletedProjectRecord): string {
    const title = `${project.category}${project.subSpecialty ? " - " + project.subSpecialty : ""}`;
    const sanitizedScope = DataSanitizer.scrub(project.scopeSummary);
    return embeddingText(sanitizedScope, "RETRIEVAL_DOCUMENT", title);
  }

  private static normalizeVector(vector: number[]): Float32Array {
    const arr = new Float32Array(vector.length);
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      const val = Number(vector[i] ?? 0);
      arr[i] = Number.isFinite(val) ? val : 0;
      sumSq += arr[i]! * arr[i]!;
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = arr[i]! / norm;
      }
    }
    return arr;
  }

  /**
   * Inserts or updates a qualified, sanitized completed project record.
   */
  public static insertProject(project: CompletedProjectRecord, vector: number[]): boolean {
    if (!this.isEligible(project)) {
      // Invalidate if project is no longer eligible (e.g. subsequent dispute or rating drop)
      this.invalidate(project.projectId);
      return false;
    }

    if (!vector || vector.length !== this.EMBEDDING_DIMENSIONS) {
      throw new Error("INVALID_VECTOR_DIMENSIONS");
    }

    const sanitizedScope = DataSanitizer.scrub(project.scopeSummary);
    const sanitizedMilestones = project.milestonesSummary ? DataSanitizer.scrub(project.milestonesSummary) : null;
    const normalized = this.normalizeVector(vector);
    const vectorBuffer = Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength);
    const tenant = tenantNamespace();

    this.connect().prepare(`
      INSERT INTO completed_projects (
        project_id, tenant, category, sub_specialty, scope_summary,
        duration_days, budget_amount, currency, milestones_count,
        milestones_summary, rating, model_version, dimensions,
        vector_blob, completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant, project_id) DO UPDATE SET
        category=excluded.category,
        sub_specialty=excluded.sub_specialty,
        scope_summary=excluded.scope_summary,
        duration_days=excluded.duration_days,
        budget_amount=excluded.budget_amount,
        currency=excluded.currency,
        milestones_count=excluded.milestones_count,
        milestones_summary=excluded.milestones_summary,
        rating=excluded.rating,
        model_version=excluded.model_version,
        dimensions=excluded.dimensions,
        vector_blob=excluded.vector_blob,
        completed_at=excluded.completed_at
    `).run(
      project.projectId,
      tenant,
      project.category.trim(),
      project.subSpecialty?.trim() ?? null,
      sanitizedScope,
      Math.max(1, Math.round(project.durationDays)),
      Math.max(0, project.budgetAmount),
      project.currency ?? "SAR",
      Math.max(1, Math.round(project.milestonesCount ?? 1)),
      sanitizedMilestones,
      project.rating,
      this.EMBEDDING_MODEL,
      this.EMBEDDING_DIMENSIONS,
      vectorBuffer,
      project.completedAt,
      Date.now()
    );

    return true;
  }

  /**
   * Deletes or invalidates a project from the vector memory.
   */
  public static invalidate(projectId: string): boolean {
    const tenant = tenantNamespace();
    const result = this.connect().prepare(
      "DELETE FROM completed_projects WHERE tenant=? AND project_id=?"
    ).run(tenant, projectId);
    return Number(result.changes) > 0;
  }

  /**
   * High-performance cosine similarity calculation between stored Float32Array and query vector.
   */
  private static cosineSimilarity(a: Float32Array, b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const va = a[i]!;
      const vb = b[i]!;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Searches for similar projects using vector similarity with SQL metadata pre-filtering.
   */
  public static searchSimilar(
    queryVector: number[],
    options: { category?: string; limit?: number; minSimilarity?: number } = {}
  ): ProjectSearchResult[] {
    if (!queryVector || queryVector.length !== this.EMBEDDING_DIMENSIONS) return [];
    const limit = Math.max(1, Math.min(10, options.limit ?? 3));
    const minSim = options.minSimilarity ?? 0.35;
    const tenant = tenantNamespace();

    let query = "SELECT project_id, category, sub_specialty, scope_summary, duration_days, budget_amount, currency, milestones_count, milestones_summary, rating, completed_at, vector_blob FROM completed_projects WHERE tenant=? AND model_version=? AND dimensions=?";
    const params: any[] = [tenant, this.EMBEDDING_MODEL, this.EMBEDDING_DIMENSIONS];

    if (options.category) {
      query += " AND category=?";
      params.push(options.category.trim());
    }

    const rows = this.connect().prepare(query).all(...params) as Array<{
      project_id: string;
      category: string;
      sub_specialty: string | null;
      scope_summary: string;
      duration_days: number;
      budget_amount: number;
      currency: string;
      milestones_count: number;
      milestones_summary: string | null;
      rating: number;
      completed_at: string;
      vector_blob: Buffer;
    }>;

    const results: ProjectSearchResult[] = [];

    for (const row of rows) {
      const blob = row.vector_blob;
      const floatArr = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
      const similarity = this.cosineSimilarity(floatArr, queryVector);

      if (similarity >= minSim) {
        results.push({
          similarity,
          project: {
            projectId: row.project_id,
            category: row.category,
            subSpecialty: row.sub_specialty ?? undefined,
            scopeSummary: row.scope_summary,
            durationDays: row.duration_days,
            budgetAmount: row.budget_amount,
            currency: row.currency,
            milestonesCount: row.milestones_count,
            milestonesSummary: row.milestones_summary ?? undefined,
            rating: row.rating,
            completedAt: row.completed_at,
          },
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Helper that embeds query text using official asymmetric search format and returns top matches.
   */
  public static async searchSimilarByText(
    queryText: string,
    options: { category?: string; limit?: number; minSimilarity?: number; signal?: AbortSignal } = {}
  ): Promise<ProjectSearchResult[]> {
    try {
      const embedResult = await embedText({
        text: queryText,
        purpose: "RETRIEVAL_QUERY",
        model: this.EMBEDDING_MODEL,
        classification: "PERSONAL",
      }, { signal: options.signal });
      return this.searchSimilar(embedResult.vector, options);
    } catch {
      return [];
    }
  }

  /**
   * Retrieves statistical pricing benchmarks for a category/specialty.
   */
  public static getStatisticalPricing(
    category: string,
    options: { subSpecialty?: string; currency?: string; minSampleSize?: number } = {}
  ): StatisticalPricingResult {
    const tenant = tenantNamespace();
    let query = "SELECT project_id, category, duration_days, budget_amount, currency, rating FROM completed_projects WHERE tenant=? AND category=?";
    const params: any[] = [tenant, category.trim()];

    if (options.subSpecialty) {
      query += " AND sub_specialty=?";
      params.push(options.subSpecialty.trim());
    }
    query += " ORDER BY created_at DESC LIMIT 500";

    const rows = this.connect().prepare(query).all(...params) as Array<{
      project_id: string;
      category: string;
      duration_days: number;
      budget_amount: number;
      currency: string;
      rating: number;
    }>;

    return StatisticalPricingEngine.calculate(
      rows.map(r => ({
        projectId: r.project_id,
        category: r.category,
        durationDays: r.duration_days,
        budgetAmount: r.budget_amount,
        currency: r.currency,
        rating: r.rating,
      })),
      options.currency ?? "SAR",
      options.minSampleSize ?? 3
    );
  }

  /**
   * Returns vector store statistics for health checks and status reporting.
   */
  public static getStats(): { totalProjects: number; categories: Record<string, number> } {
    const tenant = tenantNamespace();
    const countRow = this.connect().prepare("SELECT COUNT(*) as count FROM completed_projects WHERE tenant=?").get(tenant) as { count: number } | undefined;
    const catRows = this.connect().prepare("SELECT category, COUNT(*) as count FROM completed_projects WHERE tenant=? GROUP BY category").all(tenant) as Array<{ category: string; count: number }>;

    const categories: Record<string, number> = {};
    for (const r of catRows) {
      categories[r.category] = r.count;
    }

    return {
      totalProjects: countRow?.count ?? 0,
      categories,
    };
  }

  public static clear(): void {
    this.connect().prepare("DELETE FROM completed_projects WHERE tenant=?").run(tenantNamespace());
  }

  public static close(): void {
    this.db?.close();
    this.db = undefined;
  }
}
