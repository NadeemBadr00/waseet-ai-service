import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tenantNamespace } from "../auth/tenant-context.js";

/** Durable single-host storage. Production requires a persistent volume; multi-host deployments need a shared database. */
export class DurableStore {
  private static db: DatabaseSync | undefined;
  private static connect(): DatabaseSync {
    if (this.db) return this.db;
    if (process.env.WASEET_AI_DISTRIBUTED === "true" || process.env.WASEET_AI_DISTRIBUTED_REPLICAS === "true" || (process.env.K_SERVICE && process.env.WASEET_AI_DURABLE_VOLUME !== "true")) {
      throw Object.assign(new Error("A shared domain database adapter is required for distributed deployments."), { code: "SHARED_STORAGE_REQUIRED", statusCode: 503 });
    }
    const directory = resolve(process.env.WASEET_AI_STATE_DIR || join(process.cwd(), "work", "state"));
    mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, "domain.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    db.exec("CREATE TABLE IF NOT EXISTS domain_records (tenant TEXT NOT NULL, bucket TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (tenant,bucket,key)); CREATE INDEX IF NOT EXISTS domain_bucket ON domain_records(tenant,bucket);");
    this.db = db;
    return db;
  }
  public static get<T>(bucket: string, key: string): T | null {
    const row = this.connect().prepare("SELECT value FROM domain_records WHERE tenant=? AND bucket=? AND key=?").get(tenantNamespace(), bucket, key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : null;
  }
  public static put<T>(bucket: string, key: string, value: T): void {
    this.connect().prepare("INSERT INTO domain_records(tenant,bucket,key,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(tenant,bucket,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(tenantNamespace(), bucket, key, JSON.stringify(value), Date.now());
  }
  public static remove(bucket: string, key: string): boolean {
    return Number(this.connect().prepare("DELETE FROM domain_records WHERE tenant=? AND bucket=? AND key=?").run(tenantNamespace(), bucket, key).changes) > 0;
  }
  public static list<T>(bucket: string): T[] {
    const rows = this.connect().prepare("SELECT value FROM domain_records WHERE tenant=? AND bucket=? ORDER BY key").all(tenantNamespace(), bucket) as Array<{ value: string }>;
    return rows.map(row => JSON.parse(row.value) as T);
  }
  public static transaction<T>(operation: () => T): T {
    const db = this.connect(); db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  public static clear(): void { this.connect().prepare("DELETE FROM domain_records WHERE tenant=?").run(tenantNamespace()); }
  public static close(): void { this.db?.close(); this.db = undefined; }
}
