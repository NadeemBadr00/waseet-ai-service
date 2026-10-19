import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthenticatedActor { userId: string; role: "client" | "provider" | "marketer" | "admin" | "system" }
export interface TenantContext {
  clientId: string;
  actor: AuthenticatedActor;
  requestId: string;
  environment?: "dev" | "bank" | "prod";
  scopes?: string[];
  signal?: AbortSignal;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();
export function getTenantContext(): TenantContext | undefined { return tenantStorage.getStore(); }
export function tenantNamespace(): string {
  const current = getTenantContext();
  // Direct service tests and offline imports remain separate from authenticated HTTP tenants.
  return current ? `${current.environment ?? "dev"}:${current.clientId}` : "offline:internal";
}
export function assertPrivileged(): void {
  const context = getTenantContext();
  const actor = context?.actor;
  if (actor && ((actor.role !== "system" && actor.role !== "admin") || !context?.scopes?.includes("data:write"))) {
    throw Object.assign(new Error("لا تملك صلاحية إدارة هذه البيانات"), { statusCode: 403, code: "FORBIDDEN" });
  }
}
