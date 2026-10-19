import { randomUUID } from "node:crypto";
import { DurableStore } from "../../core/database/durable-store.js";
import { getTenantContext, tenantStorage, type TenantContext } from "../../core/auth/tenant-context.js";
import { featureError } from "../../core/security/model-output.js";
import { BusinessModelService } from "./business-model.service.js";
import type { BulkReAuditInput, JobStatusOutput } from "./business-model.types.js";
interface Job extends JobStatusOutput { ownerId: string; input: BulkReAuditInput; leaseId?: string; leaseUntil?: number; cancelled?: boolean; expiresAt: number }
export class BulkAuditWorker {
  private static actor(): string {
    const id = getTenantContext()?.actor.userId;
    if (!id || id === "service-reader") throw featureError("ACTOR_REQUIRED", "A user actor is required for audit jobs.", 403);
    return id;
  }
  private static owned(id: string): Job {
    const job = DurableStore.get<Job>("bulk-audit", id);
    if (!job || job.ownerId !== this.actor()) throw featureError("NOT_FOUND", "Job not found.", 404);
    return job;
  }
  public static async enqueueJob(input: BulkReAuditInput): Promise<{ jobId: string; status: "QUEUED" }> {
    const ownerId = this.actor(), jobId = "job-" + randomUUID(), now = new Date().toISOString();
    DurableStore.put<Job>("bulk-audit", jobId, { jobId, ownerId, input, status: "QUEUED", total: input.items.length, processed: 0, results: [], createdAt: now, updatedAt: now, expiresAt: Date.now() + 86400000 });
    this.schedule(jobId, getTenantContext()!); return { jobId, status: "QUEUED" };
  }
  private static schedule(id: string, context: TenantContext): void { setImmediate(() => { void tenantStorage.run(context, () => this.process(id)).catch(() => { /* Failure is persisted per item; lease allows explicit restart recovery. */ }); }); }
  private static async process(id: string): Promise<void> {
    const leaseId = randomUUID();
    const started = DurableStore.transaction(() => {
      const job = this.owned(id);
      if (job.cancelled || job.expiresAt <= Date.now() || ["SUCCEEDED", "PARTIAL", "FAILED"].includes(job.status) || (job.leaseUntil ?? 0) > Date.now()) return false;
      job.leaseId = leaseId; job.leaseUntil = Date.now() + 180000; job.status = "RUNNING"; job.updatedAt = new Date().toISOString(); DurableStore.put("bulk-audit", id, job); return true;
    });
    if (!started) return;
    while (true) {
      const job = this.owned(id);
      if (job.cancelled || job.leaseId !== leaseId) return;
      if (job.processed >= job.total) {
        const failures = job.results.filter(item => item.status === "FAILED").length;
        job.status = failures === 0 ? "SUCCEEDED" : failures === job.total ? "FAILED" : "PARTIAL";
        delete job.leaseId; delete job.leaseUntil; job.updatedAt = new Date().toISOString(); DurableStore.put("bulk-audit", id, job); return;
      }
      const index = job.processed, item = job.input.items[index]!;
      let result: Job["results"][number];
      try { const audit = await BusinessModelService.auditModel(item); result = { id: item.modelId ?? "input:" + index, status: "REQUIRES_HUMAN_REVIEW", isApproved: audit.isApproved, score: audit.score }; }
      catch { result = { id: item.modelId ?? "input:" + index, status: "FAILED" }; }
      DurableStore.transaction(() => {
        const current = this.owned(id); if (current.cancelled || current.leaseId !== leaseId || current.processed !== index) return;
        current.results.push(result); current.processed++; current.leaseUntil = Date.now() + 180000; current.updatedAt = new Date().toISOString(); DurableStore.put("bulk-audit", id, current);
      });
    }
  }
  public static async getJobStatus(id: string): Promise<JobStatusOutput> {
    const job = this.owned(id);
    return { jobId: job.jobId, status: job.status, total: job.total, processed: job.processed, results: job.results, createdAt: job.createdAt, updatedAt: job.updatedAt };
  }
  public static async resume(id: string): Promise<JobStatusOutput> {
    const job = this.owned(id); if (job.expiresAt <= Date.now()) throw featureError("JOB_EXPIRED", "Audit job has expired.", 410);
    this.schedule(id, getTenantContext()!); return this.getJobStatus(id);
  }
  public static async cancel(id: string): Promise<JobStatusOutput> {
    DurableStore.transaction(() => { const job = this.owned(id); job.cancelled = true; job.status = "FAILED"; job.updatedAt = new Date().toISOString(); DurableStore.put("bulk-audit", id, job); });
    return this.getJobStatus(id);
  }
}
