import type { StoredKnowledgeDoc } from "../database/firestore.js";

export interface RetrievalOptions { locale?: string; sourceVersion?: number; limit?: number; queryEmbedding?: number[]; embeddingModel?: string }
export function normalizedTerms(text: string): string[] {
  return text.toLowerCase().normalize("NFKC").replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}
export function cosine(first: number[], second: number[]): number {
  if (first.length !== second.length || !first.length || first.some(value => !Number.isFinite(value)) || second.some(value => !Number.isFinite(value))) return 0;
  let product = 0, firstSize = 0, secondSize = 0;
  for (let index = 0; index < first.length; index++) { const a = first[index]!, b = second[index]!; product += a * b; firstSize += a * a; secondSize += b * b; }
  return firstSize && secondSize ? product / Math.sqrt(firstSize * secondSize) : 0;
}
/** BM25 + vector rank fusion. Vector mode is used only for matching, explicitly versioned embeddings. */
export function rankKnowledge(query: string, docs: StoredKnowledgeDoc[], options: RetrievalOptions): StoredKnowledgeDoc[] {
  const terms = [...new Set(normalizedTerms(query))];
  if (!terms.length || !docs.length) return [];
  const tokens = docs.map(doc => normalizedTerms(`${doc.title} ${doc.title} ${doc.content}`));
  const average = tokens.reduce((sum, values) => sum + values.length, 0) / docs.length || 1;
  const lexical = docs.map((doc, index) => {
    const values = tokens[index]!;
    const score = terms.reduce((sum, term) => {
      const frequency = values.filter(value => value === term).length;
      const documentCount = tokens.filter(value => value.includes(term)).length;
      const idf = Math.log(1 + (docs.length - documentCount + 0.5) / (documentCount + 0.5));
      return sum + idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * values.length / average));
    }, 0);
    return { doc, score };
  }).filter(item => item.score > 0).sort((first, second) => second.score - first.score);
  const semantic = options.queryEmbedding && options.embeddingModel ? docs.map(doc => ({ doc, score: Math.max(
    doc.embedding && doc.embeddingModel === options.embeddingModel ? cosine(options.queryEmbedding!, doc.embedding) : 0,
    ...(doc.embeddingChunks?.filter(chunk => chunk.model === options.embeddingModel).map(chunk => cosine(options.queryEmbedding!, chunk.embedding)) ?? []),
  ) })).filter(item => item.score >= 0.4).sort((first, second) => second.score - first.score || first.doc.documentId.localeCompare(second.doc.documentId)) : [];
  const fused = new Map<string, { doc: StoredKnowledgeDoc; score: number }>();
  for (const ranked of [lexical, semantic]) ranked.forEach((item, rank) => { const entry = fused.get(item.doc.documentId) ?? { doc: item.doc, score: 0 }; entry.score += 1 / (60 + rank + 1); fused.set(item.doc.documentId, entry); });
  return [...fused.values()].sort((first, second) => second.score - first.score).slice(0, Math.min(8, Math.max(1, options.limit ?? 5))).map(item => item.doc);
}
