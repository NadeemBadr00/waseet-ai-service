import { FirestoreService, type StoredKnowledgeDoc } from "../../core/database/firestore.js";
import type { CatalogUpsertInput, KnowledgeDocUpsertInput } from "./ingestion.types.js";
import { assertPrivileged, getTenantContext } from "../../core/auth/tenant-context.js";

export class IngestionService {
  public static async upsertCatalog(collection: "providers" | "projects" | "services", input: CatalogUpsertInput): Promise<{ recorded: boolean; id: string; version: number }> {
    assertPrivileged();
    await FirestoreService.upsertCatalog(collection, input.id, {
      ...input.data,
      id: input.id,
      sourceVersion: input.sourceVersion,
    });
    return { recorded: true, id: input.id, version: input.sourceVersion };
  }

  public static async deleteCatalog(collection: "providers" | "projects" | "services", id: string): Promise<{ deleted: boolean; id: string }> {
    assertPrivileged();
    const deleted = await FirestoreService.deleteCatalog(collection, id);
    return { deleted, id };
  }

  public static async upsertKnowledge(input: KnowledgeDocUpsertInput): Promise<{ recorded: boolean; documentId: string }> {
    assertPrivileged();
    const doc: StoredKnowledgeDoc = {
      documentId: input.documentId,
      version: input.version,
      title: input.title,
      locale: input.locale,
      content: input.content,
      status: input.status,
      audience: input.audience,
      createdAt: new Date().toISOString(),
      sourceVersion: input.sourceVersion,
      sourceUrl: input.sourceUrl,
      ownerId: input.ownerId,
      embedding: input.embedding,
      embeddingModel: input.embeddingModel,
      approvedBy: input.status === "APPROVED" ? getTenantContext()?.actor.userId : undefined,
      approvedAt: input.status === "APPROVED" ? new Date().toISOString() : undefined,
    };
    await FirestoreService.upsertKnowledge(doc);
    return { recorded: true, documentId: input.documentId };
  }

  public static async deleteKnowledge(documentId: string): Promise<{ deleted: boolean; documentId: string }> {
    assertPrivileged();
    const deleted = await FirestoreService.deleteKnowledge(documentId);
    return { deleted, documentId };
  }

  public static async getKnowledgeStatus(documentId: string): Promise<StoredKnowledgeDoc | null> {
    return FirestoreService.getKnowledge(documentId);
  }
}
