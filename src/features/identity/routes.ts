import type { FastifyPluginAsync } from "fastify";
import { getTenantContext } from "../../core/auth/tenant-context.js";
import { IdentityCompareInputSchema, IdentityInspectInputSchema } from "./identity.types.js";
import { IdentityService } from "./identity.service.js";

const IDENTITY_BODY_LIMIT = 10 * 1024 * 1024;

export const identityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/v1/ai/identity/compare-fields", { bodyLimit: IDENTITY_BODY_LIMIT }, async (request) => {
    const headerReqId = typeof request.headers["x-request-id"] === "string" && request.headers["x-request-id"].trim()
      ? request.headers["x-request-id"].trim().slice(0, 200)
      : getTenantContext()?.requestId ?? `req-${Date.now()}`;
    const input = IdentityCompareInputSchema.parse(request.body);
    const { requestId, data } = await IdentityService.compareFields(input, headerReqId);
    return { success: true, requestId, data };
  });

  fastify.post("/v1/ai/identity/inspect-document", { bodyLimit: IDENTITY_BODY_LIMIT }, async (request) => {
    const headerReqId = typeof request.headers["x-request-id"] === "string" && request.headers["x-request-id"].trim()
      ? request.headers["x-request-id"].trim().slice(0, 200)
      : getTenantContext()?.requestId ?? `req-${Date.now()}`;
    const input = IdentityInspectInputSchema.parse(request.body);
    const data = await IdentityService.inspectDocument(input);
    return { success: true, requestId: headerReqId, data };
  });
};
