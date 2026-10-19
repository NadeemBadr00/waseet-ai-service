import { TenantAuthService } from "../core/auth/tenant-auth.service.js";
import { env } from "../core/config/env.js";

/**
 * Standalone Daily Batch Sync Script.
 * Can be executed via Cron (e.g. daily at 00:00 UTC) or webhook trigger.
 * Ingests successfully completed projects (escrow released, rating >= 3.5, zero disputes)
 * into the Waseet AI Dynamic Vector Memory.
 */
export async function runSync(options: { apiUrl?: string; token?: string; projects?: unknown[] } = {}) {
  const apiUrl = options.apiUrl || process.env.WASEET_AI_API_URL || `http://localhost:${env.PORT}`;
  const token = options.token || process.env.WASEET_AI_SERVICE_TOKEN || (
    env.WASEET_AI_CLIENT_SECRET.length >= 32
      ? TenantAuthService.issue({
          clientId: env.WASEET_AI_CLIENT_ID,
          clientSecret: env.WASEET_AI_CLIENT_SECRET,
          environment: env.WASEET_AI_ENVIRONMENT,
          actor: { userId: "system-vector-sync", role: "system" },
        }).token
      : undefined
  );

  console.log(`[VectorSync] Starting daily batch sync against ${apiUrl}...`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Sample or passed projects
  const payload = {
    projects: options.projects ?? [
      {
        projectId: `sync-batch-${Date.now()}`,
        category: "برمجة وتطوير",
        subSpecialty: "تطوير ويب",
        scopeSummary: "تصميم وبرمجة متجر إلكتروني بنظام سلة مع ربط بوابات دفع ميسر والشحن السريع",
        durationDays: 14,
        budgetAmount: 3500,
        currency: "SAR",
        milestonesCount: 3,
        milestonesSummary: "المرحلة الأولى: التصميم والـ UI. المرحلة الثانية: البرمجة والتكامل. المرحلة الثالثة: الفحص والتسليم.",
        rating: 4.9,
        escrowReleased: true,
        disputeCount: 0,
        completedAt: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(`${apiUrl}/v1/ai/knowledge/projects/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VectorSync] Sync failed with status ${response.status}: ${errText}`);
      return { success: false, status: response.status, error: errText };
    }

    const data = await response.json();
    console.log(`[VectorSync] Sync completed successfully!`, data);
    return { success: true, data };
  } catch (err: unknown) {
    console.error(`[VectorSync] Network or connection error:`, (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

if (process.argv[1]?.endsWith("sync-completed-projects.ts")) {
  runSync().catch(console.error);
}
