import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentRole, DataClassification, ModelEffort } from "../router/types.js";
import { assertDurableStorage } from "../router/storage-policy.js";

export interface TaskScope { tenantId: string; userId: string; }
export interface TaskNode { id: string; role: AgentRole; prompt: string; dependencies: string[]; effort?: ModelEffort; modelPin?: string; }
export interface TaskPlan { goal: string; classification: DataClassification; version: string; nodes: TaskNode[]; }
export type TaskStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export interface StoredTask { id: string; scope: TaskScope; plan: TaskPlan; planHash: string; generation: number; status: TaskStatus; createdAt: number; updatedAt: number; apiCalls: number; nodes: Record<string, { status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"; text?: string; model?: string; usage?: unknown; error?: string }>; error?: string; verification: "MODEL_OUTPUT_ONLY"; }
export class TaskStore {
  private database: DatabaseSync | undefined;
  get db(): DatabaseSync {
    assertDurableStorage();
    if (this.database) return this.database;
    const dir = resolve(process.env.WASEET_AI_STATE_DIR ?? "work/state"); mkdirSync(dir, { recursive: true }); this.database = new DatabaseSync(resolve(dir, "agent-tasks.sqlite"));
    this.database.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,tenant TEXT,user TEXT,idempotency TEXT,hash TEXT,json TEXT,generation INTEGER,owner TEXT,lease INTEGER,UNIQUE(tenant,user,idempotency));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,task TEXT,json TEXT); CREATE INDEX IF NOT EXISTS task_events ON events(task,id);`); return this.database;
  }
  create(scope: TaskScope, plan: TaskPlan, hash: string, key: string): StoredTask {
    this.db.exec("BEGIN IMMEDIATE"); try {
    const prior = this.db.prepare("SELECT json,hash FROM tasks WHERE tenant=? AND user=? AND idempotency=?").get(scope.tenantId, scope.userId, key) as { json: string; hash: string } | undefined;
    if (prior) { if (prior.hash !== hash) throw new Error("TASK_IDEMPOTENCY_CONFLICT"); this.db.exec("COMMIT"); return JSON.parse(prior.json) as StoredTask; }
    const task: StoredTask = { id: randomUUID(), scope, plan, planHash: hash, generation: 1, status: "QUEUED", createdAt: Date.now(), updatedAt: Date.now(), apiCalls: 0, nodes: Object.fromEntries(plan.nodes.map(n => [n.id, { status: "PENDING" }])), verification: "MODEL_OUTPUT_ONLY" };
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE tenant=? AND user=?").get(scope.tenantId, scope.userId) as { count: number }; if (count.count >= 100) throw new Error("TASK_STORAGE_BUDGET_EXHAUSTED");
    this.db.prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,NULL,0)").run(task.id, scope.tenantId, scope.userId, key, hash, JSON.stringify(task), 1); this.event(task.id, { type: "task_created", status: task.status, generation: 1 }); this.db.exec("COMMIT"); return task;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  get(scope: TaskScope, id: string): StoredTask | undefined { const row = this.db.prepare("SELECT json FROM tasks WHERE id=? AND tenant=? AND user=?").get(id, scope.tenantId, scope.userId) as { json: string } | undefined; return row ? JSON.parse(row.json) as StoredTask : undefined; }
  mutate(scope: TaskScope, id: string, mutate: (task: StoredTask) => void): StoredTask {
    this.db.exec("BEGIN IMMEDIATE"); try { const task = this.get(scope, id); if (!task) throw new Error("TASK_NOT_FOUND"); mutate(task); task.updatedAt = Date.now(); this.db.prepare("UPDATE tasks SET json=?,generation=? WHERE id=?").run(JSON.stringify(task), task.generation, id); this.db.exec("COMMIT"); return task; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  claim(scope: TaskScope, id: string, owner: string): boolean { return this.db.prepare("UPDATE tasks SET owner=?,lease=? WHERE id=? AND tenant=? AND user=? AND (lease<? OR owner=?)").run(owner, Date.now() + 120000, id, scope.tenantId, scope.userId, Date.now(), owner).changes > 0; }
  release(id: string, owner: string): void { this.db.prepare("UPDATE tasks SET owner=NULL,lease=0 WHERE id=? AND owner=?").run(id, owner); }
  event(id: string, value: Record<string, unknown>): void { this.db.prepare("INSERT INTO events(task,json) VALUES(?,?)").run(id, JSON.stringify({ ...value, at: new Date().toISOString() })); this.db.prepare("DELETE FROM events WHERE task=? AND id NOT IN (SELECT id FROM events WHERE task=? ORDER BY id DESC LIMIT 2000)").run(id, id); }
  events(scope: TaskScope, id: string, after = 0): Array<Record<string, unknown>> { if (!this.get(scope, id)) throw new Error("TASK_NOT_FOUND"); return (this.db.prepare("SELECT id,json FROM events WHERE task=? AND id>? ORDER BY id LIMIT 200").all(id, after) as Array<{ id: number; json: string }>).map(r => ({ id: r.id, ...JSON.parse(r.json) as Record<string, unknown> })); }
  delete(scope: TaskScope, id: string): void { const task = this.get(scope, id); if (!task) throw new Error("TASK_NOT_FOUND"); if (task.status === "RUNNING") throw new Error("TASK_RUNNING"); this.db.prepare("DELETE FROM events WHERE task=?").run(id); this.db.prepare("DELETE FROM tasks WHERE id=? AND tenant=? AND user=?").run(id, scope.tenantId, scope.userId); }
}
