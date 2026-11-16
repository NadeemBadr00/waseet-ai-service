/**
 * One JSON line per failure on stderr (Cloud Run Logging picks it up as a structured entry). Only codes, HTTP statuses, model / project ALIAS names and schema paths are logged:
 * never an API key, a prompt, a model answer or user data.
 */
export function logFailure(event: string, fields: Record<string, string | number | boolean | null | undefined>): void {
  try { console.error(JSON.stringify({ severity: "ERROR", component: "waseet-ai", event, ...fields })); } catch { /* logging must never break a request */ }
}
export function errorFields(error: unknown): { code: string; status?: number } {
  const e = error as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : undefined;
  return { code: typeof e?.code === "string" ? e.code : typeof e?.name === "string" ? e.name : "UNKNOWN", ...(status !== undefined ? { status } : {}) };
}
