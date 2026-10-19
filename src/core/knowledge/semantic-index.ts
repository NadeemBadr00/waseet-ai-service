import { createHash } from "node:crypto";
import { DurableStore } from "../database/durable-store.js";
import type { StoredKnowledgeDoc } from "../database/firestore.js";
import { getTenantContext } from "../auth/tenant-context.js";
import { embedTexts } from "../../runtime/voice.js";

export interface KnowledgeChunk { start: number; end: number; content: string; embedding: number[] }
interface KnowledgeIndex { digest: string; model: string; chunks: KnowledgeChunk[] }
const FORMAT_VERSION = "embedding2-retrieval-chunks-v1";
export function knowledgeDigest(doc: StoredKnowledgeDoc): string {
  return createHash("sha256").update(JSON.stringify([FORMAT_VERSION, doc.sourceVersion, doc.version, doc.title, doc.content, doc.locale, doc.audience, doc.ownerId, doc.status])).digest("hex");
}
/** Bounded overlapping windows prefer paragraph/sentence boundaries and preserve exact source offsets. */
export function chunkKnowledge(content: string, maxLength = 6000, overlap = 500): Array<Omit<KnowledgeChunk, "embedding">> {
  if (!Number.isInteger(maxLength) || maxLength < 100 || overlap < 0 || overlap >= maxLength) throw new Error("INVALID_CHUNK_BOUNDS");
  const chunks: Array<Omit<KnowledgeChunk, "embedding">> = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(content.length, start + maxLength);
    if (end < content.length) {
      const window = content.slice(start, end), boundary = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("؟ "));
      if (boundary > maxLength * 0.8) end = start + boundary + 1;
    }
    chunks.push({ start, end, content: content.slice(start, end) });
    if (end === content.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
export class SemanticKnowledgeIndex {
  public static read(doc: StoredKnowledgeDoc, model: string): KnowledgeChunk[] | undefined {
    const record = DurableStore.get<KnowledgeIndex>("knowledge-index", doc.documentId);
    return record?.digest === knowledgeDigest(doc) && record.model === model ? record.chunks : undefined;
  }
  public static invalidate(documentId: string): void { DurableStore.remove("knowledge-index", documentId); }
  public static async index(doc: StoredKnowledgeDoc, model: string, signal = getTenantContext()?.signal): Promise<KnowledgeChunk[]> {
    signal?.throwIfAborted();
    const cached = this.read(doc, model); if (cached) return cached;
    const chunks = chunkKnowledge(doc.content);
    const result = await embedTexts({ texts: chunks.map(chunk => chunk.content), title: doc.title, model, purpose: "RETRIEVAL_DOCUMENT", classification: doc.ownerId ? "PERSONAL" : doc.audience === "admin" ? "SENSITIVE" : "INTERNAL" }, { signal, deadlineMs: 20000, maxAttempts: 1 });
    signal?.throwIfAborted();
    // Do not install stale work after a concurrent source update or deletion.
    const current = DurableStore.get<StoredKnowledgeDoc>("knowledge", doc.documentId);
    if (!current || knowledgeDigest(current) !== knowledgeDigest(doc)) return [];
    const indexed = chunks.map((chunk, index) => ({ ...chunk, embedding: result.vectors[index]! }));
    DurableStore.put<KnowledgeIndex>("knowledge-index", doc.documentId, { digest: knowledgeDigest(doc), model: result.model, chunks: indexed });
    return indexed;
  }
}
