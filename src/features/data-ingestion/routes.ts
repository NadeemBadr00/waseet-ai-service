import type { FastifyPluginAsync } from "fastify";
import {
  CatalogUpsertInputSchema,
  CatalogDeleteInputSchema,
  KnowledgeDocUpsertInputSchema,
} from "./ingestion.types.js";
import { IngestionService } from "./ingestion.service.js";
import { z } from "zod";
import { FirestoreService } from "../../core/database/firestore.js";
import { getTenantContext } from "../../core/auth/tenant-context.js";

export const dataIngestionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/v1/knowledge/search", async request => {
    const context = getTenantContext();
    if (!context?.scopes?.includes("ai:generate")) throw Object.assign(new Error("Knowledge search is not authorized."), { statusCode: 403, code: "FORBIDDEN" });
    const input = z.object({ query: z.string().trim().min(1).max(6000), limit: z.number().int().min(1).max(8).default(5), locale: z.string().min(1).max(16).optional(), audience: z.enum(["all", "client", "provider", "admin"]).optional() }).strict().parse(request.body);
    const result = await FirestoreService.searchApprovedKnowledgeWithMode(input.query, input.audience, { locale: input.locale, limit: input.limit });
    const documents = result.documents.map(doc => ({ documentId: doc.documentId, version: doc.version, title: doc.title, locale: doc.locale, content: doc.content, status: doc.status, audience: doc.audience, createdAt: doc.createdAt, approvedBy: doc.approvedBy, approvedAt: doc.approvedAt, ...(doc.sourceUrl ? { sourceUrl: doc.sourceUrl } : {}) }));
    return { success: true, data: { documents, retrievalMode: result.retrievalMode } };
  });
  // Catalog upserts
  fastify.post("/v1/data/providers/upsert", async (request) => {
    const input = CatalogUpsertInputSchema.parse(request.body);
    const data = await IngestionService.upsertCatalog("providers", input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/data/projects/upsert", async (request) => {
    const input = CatalogUpsertInputSchema.parse(request.body);
    const data = await IngestionService.upsertCatalog("projects", input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/data/services/upsert", async (request) => {
    const input = CatalogUpsertInputSchema.parse(request.body);
    const data = await IngestionService.upsertCatalog("services", input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // Catalog deletes
  fastify.post("/v1/data/providers/delete", async (request) => {
    const input = CatalogDeleteInputSchema.parse(request.body);
    const data = await IngestionService.deleteCatalog("providers", input.id);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/data/projects/delete", async (request) => {
    const input = CatalogDeleteInputSchema.parse(request.body);
    const data = await IngestionService.deleteCatalog("projects", input.id);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/data/services/delete", async (request) => {
    const input = CatalogDeleteInputSchema.parse(request.body);
    const data = await IngestionService.deleteCatalog("services", input.id);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  // Knowledge docs
  fastify.post("/v1/knowledge/documents/upsert", async (request) => {
    const input = KnowledgeDocUpsertInputSchema.parse(request.body);
    const data = await IngestionService.upsertKnowledge(input);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.post("/v1/knowledge/documents/delete", async (request) => {
    const body = z.object({ documentId: z.string().min(1) }).parse(request.body);
    const data = await IngestionService.deleteKnowledge(body.documentId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });

  fastify.get("/v1/knowledge/documents/:documentId/status", async (request) => {
    const params = z.object({ documentId: z.string() }).parse(request.params);
    const data = await IngestionService.getKnowledgeStatus(params.documentId);
    return { success: true, requestId: `req-${Date.now()}`, data };
  });
};
