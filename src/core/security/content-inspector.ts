import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { featureError } from "./model-output.js";
import { extractContent } from "./document-extractor.js";
import { getTenantContext } from "../auth/tenant-context.js";

export interface ContentEvidence { source: string; mimeType: string; sha256: string; contentRead: boolean; excerpt: string; truncated: boolean; basis: string; lineCount: number; analysis?: unknown }
export interface VisualAttachment { source: string; mimeType: string; data: string; byteLength: number }
export interface InspectionResult { inspected: boolean; basis: string; evidence: ContentEvidence[]; unavailable: string[] }
export interface DetailedInspectionResult extends InspectionResult { visualAttachments: VisualAttachment[] }
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 24000;
const TEXT_SOURCE_EXT = /\.(?:md|txt|csv|json|ts|tsx|js|jsx|py|go|java|cs|sql|prisma|php|rb|dart|kt|swift|vue|svelte|scss|graphql|sh|toml|html?|css|yaml|yml)(?:\?|$)/i;
const REPO_BLOB_EXT = /\.(?:md|ts|tsx|js|jsx|py|json|go|java|cs|sql|prisma|php|rb|dart|kt|swift|vue|svelte|scss|graphql|html?|css|yaml|yml)$/i;
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split(".").map(Number) as [number, number, number];
    return !(first === 0 || first === 10 || first === 127 || first >= 224 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && (second === 168 || second === 0) || first === 100 && second >= 64 && second <= 127 || first === 198 && (second === 18 || second === 19 || second === 51 && third === 100) || first === 203 && second === 0 && third === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return /^[23][0-9a-f]{0,3}:/.test(normalized) && !normalized.startsWith("2001:db8:") && !normalized.startsWith("2002:");
  }
  return false;
}
export function validateContentUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw featureError("INVALID_CONTENT_URL", "Invalid content URL.", 400); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowed = new Set(["github.com", "api.github.com", "raw.githubusercontent.com", "res.cloudinary.com", ...(process.env.WASEET_AI_FETCH_ALLOWED_HOSTS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)]);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !allowed.has(hostname) || isIP(hostname) && !isPublicAddress(hostname)) throw featureError("CONTENT_URL_BLOCKED", "Content host or protocol is not approved.", 422);
  if (url.searchParams.size > 0 && [...url.searchParams.keys()].some(key => /token|secret|password|api.?key/i.test(key))) throw featureError("CONTENT_URL_BLOCKED", "Credential-bearing content URLs are not accepted.", 422);
  return url;
}
/** DNS is checked once and the HTTPS connection is pinned to the checked address; redirects re-enter the same validation. */
export async function fetchBounded(raw: string, signal?: AbortSignal, redirects = 0): Promise<{ body: Buffer; mimeType: string; url: string }> {
  const url = validateContentUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw featureError("CONTENT_ADDRESS_BLOCKED", "Private or reserved content address.", 422);
  const chosen = addresses[0]!;
  const timeout = AbortSignal.timeout(8000), active = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return await new Promise((resolve, reject) => {
    const operation = request(url, { method: "GET", signal: active, headers: { accept: "application/json,text/plain,text/html,*/*;q=0.1", "user-agent": "WaseetAI-Evidence/1.0", "accept-encoding": "identity" }, lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family) }, response => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        if (!response.headers.location || redirects >= 2) return reject(featureError("CONTENT_REDIRECT_LIMIT", "Content redirect limit exceeded.", 422));
        void fetchBounded(new URL(response.headers.location, url).href, active, redirects + 1).then(resolve, reject); return;
      }
      if (status !== 200) { response.resume(); reject(featureError("CONTENT_UNAVAILABLE", `Content unavailable (HTTP ${status}).`, 422)); return; }
      if (Number(response.headers["content-length"] ?? 0) > MAX_BYTES || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") { response.destroy(); reject(featureError("CONTENT_TOO_LARGE", "Content exceeds the bounded read limit.", 422)); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_BYTES) { response.destroy(); reject(featureError("CONTENT_TOO_LARGE", "Content exceeds the bounded read limit.", 422)); } else chunks.push(chunk); });
      response.on("end", () => resolve({ body: Buffer.concat(chunks), mimeType: String(response.headers["content-type"] ?? "application/octet-stream").split(";")[0]!, url: url.href }));
      response.on("error", reject);
    });
    operation.on("error", reject); operation.end();
  });
}
export function extractTextContent(body: Buffer, mimeType: string, source: string): ContentEvidence {
  const isText = /^(text\/|application\/(?:json|javascript|xml|x-typescript|sql|graphql))/.test(mimeType) || TEXT_SOURCE_EXT.test(source);
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (!isText || body.includes(0)) return { source, mimeType, sha256, contentRead: false, excerpt: "", truncated: false, basis: "UNSUPPORTED_BINARY_FORMAT", lineCount: 0 };
  let text = body.toString("utf8");
  if (mimeType === "text/html" || /\.html?(?:\?|$)/i.test(source)) text = text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s{3,}/g, "  ");
  text = text.trim();
  return { source, mimeType, sha256, contentRead: text.length > 0, excerpt: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT, basis: "FETCHED_TEXT", lineCount: text.split("\n").length };
}
function decodeInlineContent(raw: string, index: number): { body: Buffer; mimeType: string; source: string } {
  const source = `uploaded-file://inline/${index + 1}`;
  const commaIdx = raw.indexOf(",");
  if (commaIdx < 5) throw featureError("INVALID_INLINE_CONTENT", "Malformed inline content.", 422);
  const meta = raw.slice(5, commaIdx);
  const mimeType = (meta.split(";")[0] || "application/octet-stream").trim().toLowerCase();
  const payload = raw.slice(commaIdx + 1).trim();
  if (!payload) throw featureError("EMPTY_INLINE_CONTENT", "Inline content is empty.", 422);
  if (meta.includes(";base64")) {
    const normalized = payload.replace(/\s+/g, "");
    if (normalized.length > Math.ceil(MAX_INLINE_BYTES / 3) * 4 + 4 || normalized.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(normalized)) {
      throw featureError("CONTENT_TOO_LARGE", "Inline content exceeds limit or is malformed.", 422);
    }
    const body = Buffer.from(normalized, "base64");
    if (!body.byteLength || body.byteLength > MAX_INLINE_BYTES) throw featureError("CONTENT_TOO_LARGE", "Inline content exceeds limit.", 422);
    return { body, mimeType, source };
  }
  const decoded = decodeURIComponent(payload);
  const body = Buffer.from(decoded, "utf8");
  if (!body.byteLength || body.byteLength > MAX_INLINE_BYTES) throw featureError("CONTENT_TOO_LARGE", "Inline content exceeds limit.", 422);
  return { body, mimeType, source };
}
function maybeCollectVisual(body: Buffer, mimeType: string, source: string, out: VisualAttachment[]): void {
  if (out.length >= 2 || body.byteLength < 32 || body.byteLength > 2 * 1024 * 1024) return;
  const normalizedMime = /^image\/(?:jpeg|png|webp)$/i.test(mimeType)
    ? mimeType.toLowerCase()
    : /\.jpe?g(?:\?|$)/i.test(source) ? "image/jpeg"
    : /\.png(?:\?|$)/i.test(source) ? "image/png"
    : /\.webp(?:\?|$)/i.test(source) ? "image/webp"
    : null;
  if (!normalizedMime) return;
  out.push({ source, mimeType: normalizedMime, data: body.toString("base64"), byteLength: body.byteLength });
}
export class ContentInspector {
  public static async inspectWithMedia(rawUrls: string[], signal?: AbortSignal): Promise<DetailedInspectionResult> {
    signal ??= getTenantContext()?.signal;
    signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    const evidence: ContentEvidence[] = [], unavailable: string[] = [], visualAttachments: VisualAttachment[] = [];
    for (const [index, raw] of [...new Set(rawUrls)].slice(0, 6).entries()) {
      if (signal?.aborted) throw featureError("CANCELLED", "Inspection cancelled.", 499);
      if (raw.startsWith("data:")) {
        const inlineSource = `uploaded-file://inline/${index + 1}`;
        try {
          const { body, mimeType, source } = decodeInlineContent(raw, index);
          maybeCollectVisual(body, mimeType, source, visualAttachments);
          const extracted = await extractContent(body, mimeType, source, signal);
          evidence.push(...extracted);
          if (!extracted.some(item => item.contentRead)) unavailable.push(`CONTENT_NOT_READABLE:${source}`);
        } catch (error) {
          unavailable.push(`${(error as { code?: string }).code ?? "INLINE_CONTENT_INVALID"}:${inlineSource}`);
        }
        continue;
      }
      try {
        const url = validateContentUrl(raw);
        const match = url.hostname === "github.com" ? /^\/([^/]+)\/([^/]+)(?:\/)?$/.exec(url.pathname) : null;
        if (match) {
          const owner = match[1]!, repo = match[2]!.replace(/\.git$/, "");
          if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw featureError("INVALID_CONTENT_URL", "Invalid repository path.", 400);
          const metadata = await fetchBounded(`https://api.github.com/repos/${owner}/${repo}`, signal);
          const info = JSON.parse(metadata.body.toString()) as { default_branch?: string };
          const commit = await fetchBounded(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(info.default_branch ?? "HEAD")}`, signal);
          const sha = (JSON.parse(commit.body.toString()) as { sha?: string }).sha;
          if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw featureError("CONTENT_UNAVAILABLE", "A fixed repository revision could not be established.", 422);
          const treeResponse = await fetchBounded(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, signal);
          const tree = JSON.parse(treeResponse.body.toString()) as { tree?: Array<{ path: string; type: string; size?: number }>; truncated?: boolean };
          const files = (tree.tree ?? []).filter(file => file.type === "blob" && (file.size ?? MAX_BYTES + 1) <= MAX_BYTES && REPO_BLOB_EXT.test(file.path) && !/(?:^|\/)(?:node_modules|dist|build|coverage|vendor|\.git)(?:\/|$)/.test(file.path)).sort((a, b) => (/readme/i.test(a.path) ? -1 : 0) - (/readme/i.test(b.path) ? -1 : 0)).slice(0, 8);
          for (const file of files) {
            const source = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
            const fetched = await fetchBounded(source, signal); evidence.push(...await extractContent(fetched.body, fetched.mimeType, source, signal));
          }
          if (tree.truncated || (tree.tree?.length ?? 0) > files.length) unavailable.push(`REPOSITORY_PARTIAL:${raw}`);
        } else {
          const fetched = await fetchBounded(url.href, signal);
          maybeCollectVisual(fetched.body, fetched.mimeType, url.href, visualAttachments);
          const extracted = await extractContent(fetched.body, fetched.mimeType, url.href, signal);
          evidence.push(...extracted);
          if (!extracted.some(item => item.contentRead)) unavailable.push(`CONTENT_NOT_READABLE:${url.href.split("?")[0]}`);
        }
      } catch (error) { unavailable.push(`${(error as { code?: string }).code ?? "CONTENT_FETCH_FAILED"}:${raw.split("?")[0]}`); }
    }
    const inspected = evidence.some(item => item.contentRead);
    return { inspected, basis: inspected ? "FETCHED_CONTENT_PARTIAL" : "CONTENT_NOT_INSPECTED", evidence, unavailable, visualAttachments };
  }
  public static async inspect(rawUrls: string[], signal?: AbortSignal): Promise<InspectionResult> {
    const { visualAttachments: _unused, ...rest } = await this.inspectWithMedia(rawUrls, signal);
    return rest;
  }
}
