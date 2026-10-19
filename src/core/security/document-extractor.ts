import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import type { ContentEvidence } from "./content-inspector.js";
import { extractTextContent } from "./content-inspector.js";
import { featureError } from "./model-output.js";
interface Parsed { name?: string; text: string; basis: string; truncated: boolean; analysis?: unknown }
/** Trusted parsers operate in a bounded worker; submitted JavaScript is only parsed, never executed. */
export async function extractContent(body: Buffer, mimeType: string, source: string, signal?: AbortSignal): Promise<ContentEvidence[]> {
  const supportedDocument = /pdf|wordprocessingml|zip/.test(mimeType) || /\.(?:pdf|docx|zip)(?:\?|$)/i.test(source);
  const basic = extractTextContent(body, mimeType, source);
  if (!supportedDocument && !basic.contentRead) return [basic];
  const workerPath = new URL(import.meta.url.endsWith(".ts") ? "./document-parser.worker.ts" : "./document-parser.worker.js", import.meta.url);
  const parsed = await new Promise<Parsed[]>((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { body: new Uint8Array(body), mimeType, source }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
    let done = false;
    const finish = (error?: Error, result?: Parsed[]) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); void worker.terminate(); if (error) reject(error); else resolve(result ?? []); };
    const timer = setTimeout(() => finish(featureError("DOCUMENT_PARSE_TIMEOUT", "Document parser deadline exceeded.", 422)), 5000);
    const abort = () => finish(featureError("CANCELLED", "Document extraction cancelled.", 499));
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
    worker.once("message", (data: { result?: Parsed[]; error?: string }) => data.error ? finish(featureError("DOCUMENT_PARSE_FAILED", "Document could not be safely parsed.", 422)) : finish(undefined, data.result));
    worker.once("error", () => finish(featureError("DOCUMENT_PARSE_FAILED", "Document parser failed.", 422)));
    worker.once("exit", () => { if (!done) finish(featureError("DOCUMENT_PARSE_FAILED", "Document parser stopped before returning evidence.", 422)); });
  });
  const hash = createHash("sha256").update(body).digest("hex");
  return parsed.map(item => {
    const itemSource = item.name ? source + "#" + encodeURIComponent(item.name) : source;
    // HTML scripts/styles are removed by the same extraction policy, including archive entries.
    const text = /\.html?(?:\?|$)/i.test(item.name ?? source) || mimeType === "text/html" ? extractTextContent(Buffer.from(item.text), "text/html", itemSource).excerpt : item.text.trim();
    return { source: itemSource, mimeType, sha256: hash, contentRead: text.length > 0, excerpt: text, truncated: item.truncated, basis: item.basis, lineCount: text.split("\n").length, ...(item.analysis ? { analysis: item.analysis } : {}) };
  });
}
