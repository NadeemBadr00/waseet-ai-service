import { z } from "zod";

export const CatalogUpsertInputSchema = z.object({
  id: z.string().min(1),
  sourceVersion: z.number().int().positive().default(1),
  data: z.record(z.string(), z.unknown()),
});

export type CatalogUpsertInput = z.infer<typeof CatalogUpsertInputSchema>;

export const CatalogDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export type CatalogDeleteInput = z.infer<typeof CatalogDeleteInputSchema>;

export const KnowledgeDocUpsertInputSchema = z.object({
  documentId: z.string().min(1),
  version: z.string().default("1.0"),
  title: z.string().min(1),
  locale: z.string().default("ar"),
  content: z.string().min(1).max(200000),
  status: z.enum(["DRAFT", "APPROVED", "DEPRECATED"]).default("DRAFT"),
  audience: z.enum(["all", "client", "provider", "admin"]).default("all"),
  sourceVersion: z.number().int().positive().default(1),
  sourceUrl: z.string().url().optional(),
  ownerId: z.string().min(1).optional(),
  embedding: z.array(z.number().finite()).min(32).max(4096).optional(),
  embeddingModel: z.string().min(1).optional(),
});

export type KnowledgeDocUpsertInput = z.infer<typeof KnowledgeDocUpsertInputSchema>;
