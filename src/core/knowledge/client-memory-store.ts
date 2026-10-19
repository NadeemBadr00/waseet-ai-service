import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tenantNamespace } from "../auth/tenant-context.js";
import { DataSanitizer } from "./sanitizer.js";

export interface ClientPreferenceRecord {
  clientId: string;
  preferredCategories: string[];
  styleNotes?: string;
  avgBudget?: number;
  completedProjectsCount: number;
  updatedAt: number;
}

export class ClientMemoryStore {
  private static db: DatabaseSync | undefined;

  private static connect(): DatabaseSync {
    if (this.db) return this.db;
    const directory = resolve(process.env.WASEET_AI_STATE_DIR || join(process.cwd(), "work", "state"));
    mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, "client-memory.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS client_preferences (
        client_id TEXT NOT NULL,
        tenant TEXT NOT NULL,
        preferred_categories TEXT NOT NULL,
        style_notes TEXT,
        avg_budget REAL,
        completed_projects_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant, client_id)
      );
    `);
    this.db = db;
    return db;
  }

  public static get(clientId: string): ClientPreferenceRecord | null {
    if (!clientId) return null;
    const tenant = tenantNamespace();
    const row = this.connect().prepare(
      "SELECT client_id, preferred_categories, style_notes, avg_budget, completed_projects_count, updated_at FROM client_preferences WHERE tenant=? AND client_id=?"
    ).get(tenant, clientId) as {
      client_id: string;
      preferred_categories: string;
      style_notes: string | null;
      avg_budget: number | null;
      completed_projects_count: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      clientId: row.client_id,
      preferredCategories: JSON.parse(row.preferred_categories),
      styleNotes: row.style_notes ?? undefined,
      avgBudget: row.avg_budget ?? undefined,
      completedProjectsCount: row.completed_projects_count,
      updatedAt: row.updated_at,
    };
  }

  public static upsert(record: Omit<ClientPreferenceRecord, "updatedAt">): void {
    const tenant = tenantNamespace();
    const sanitizedNotes = record.styleNotes ? DataSanitizer.scrub(record.styleNotes) : null;

    this.connect().prepare(`
      INSERT INTO client_preferences (
        client_id, tenant, preferred_categories, style_notes, avg_budget, completed_projects_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant, client_id) DO UPDATE SET
        preferred_categories=excluded.preferred_categories,
        style_notes=excluded.style_notes,
        avg_budget=excluded.avg_budget,
        completed_projects_count=excluded.completed_projects_count,
        updated_at=excluded.updated_at
    `).run(
      record.clientId,
      tenant,
      JSON.stringify(record.preferredCategories),
      sanitizedNotes,
      record.avgBudget ?? null,
      record.completedProjectsCount,
      Date.now()
    );
  }

  public static clear(): void {
    this.connect().prepare("DELETE FROM client_preferences WHERE tenant=?").run(tenantNamespace());
  }

  public static close(): void {
    this.db?.close();
    this.db = undefined;
  }
}
