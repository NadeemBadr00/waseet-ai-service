import { parentPort, workerData } from "node:worker_threads";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { parse as parseCode } from "@babel/parser";
interface Parsed { name?: string; text: string; basis: string; truncated: boolean; analysis?: unknown }
const MAX_TEXT = 24000, MAX_EXPANDED = 2 * 1024 * 1024;
const body = Buffer.from(workerData.body as Uint8Array);
const source = String(workerData.source), mime = String(workerData.mimeType);
function ast(text: string, name: string): unknown {
  if (!/\.(?:tsx?|jsx?)(?:\?|$)/i.test(name)) return undefined;
  let functions = 0, classes = 0, calls = 0;
  const imports: string[] = [], riskyCalls: Array<{ name: string; line: number }> = [];
  try {
    const tree = parseCode(text, { sourceType: "unambiguous", plugins: [...(/\.tsx?(?:\?|$)/i.test(name) ? ["typescript" as const] : []), "jsx"], errorRecovery: false });
    function visit(value: unknown): void {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const node = value as Record<string, any>;
      if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassMethod"].includes(node.type)) functions++;
      if (node.type === "ClassDeclaration") classes++;
      if (node.type === "ImportDeclaration" && typeof node.source?.value === "string") imports.push(node.source.value);
      if (node.type === "CallExpression") {
        calls++; const callee = node.callee, name = callee?.type === "Identifier" ? callee.name : callee?.type === "MemberExpression" ? callee.property?.name : "";
        if (["eval", "exec", "execSync", "spawn", "spawnSync", "writeFile", "writeFileSync", "fetch"].includes(name)) riskyCalls.push({ name, line: node.loc?.start?.line ?? 0 });
      }
      for (const [key, child] of Object.entries(node)) if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) visit(child);
    }
    visit(tree);
    return { kind: "BABEL_AST", semanticTypecheck: false, executed: false, syntaxValid: true, functions, classes, calls, imports: imports.slice(0, 50), riskyCalls: riskyCalls.slice(0, 30), basis: "STATIC_SYNTAX_ANALYSIS_NOT_RUNTIME_PROOF" };
  } catch (error) {
    return { kind: "BABEL_AST", semanticTypecheck: false, executed: false, syntaxValid: false, syntaxErrors: [String((error as Error).message).slice(0, 500)], basis: "STATIC_SYNTAX_ANALYSIS_NOT_RUNTIME_PROOF" };
  }
}
async function parse(): Promise<Parsed[]> {
  if (mime === "application/pdf" || /\.pdf(?:\?|$)/i.test(source)) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(body), disableFontFace: true, useSystemFonts: false, enableXfa: false, disableAutoFetch: true, disableStream: true });
    const pdf = await task.promise; const parts: string[] = []; let total = 0;
    try {
      for (let index = 1; index <= Math.min(pdf.numPages, 20); index++) {
        const page = await pdf.getPage(index), content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
        parts.push(text); total += text.length; page.cleanup(); if (total >= MAX_TEXT) break;
      }
      return [{ text: parts.join("\n").slice(0, MAX_TEXT), basis: "PDF_TEXT_EXTRACTION", truncated: pdf.numPages > parts.length || total > MAX_TEXT }];
    } finally { await task.destroy(); }
  }
  if (mime.includes("wordprocessingml") || /\.(?:docx|zip)(?:\?|$)/i.test(source) || mime === "application/zip") {
    let expanded = 0, count = 0, skipped = false;
    const contents = unzipSync(new Uint8Array(body), { filter: item => {
      count++; expanded += item.originalSize;
      const safe = count <= 100 && item.originalSize <= 512 * 1024 && expanded <= MAX_EXPANDED && !/^(?:\/|\\)|(?:^|[/\\])\.\.(?:[/\\]|$)|^[a-z]:/i.test(item.name);
      if (!safe) skipped = true; return safe;
    } });
    if (mime.includes("wordprocessingml") || /\.docx(?:\?|$)/i.test(source)) {
      if (skipped || !contents["word/document.xml"]) throw new Error("DOCUMENT_ARCHIVE_LIMIT");
      const xml = Buffer.from(contents["word/document.xml"]!).toString("utf8");
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCUMENT_ENTITY_BLOCKED");
      const parser = new SaxesParser({ xmlns: true }); const parts: string[] = []; let inText = false;
      parser.on("opentag", tag => { if (tag.local === "t") inText = true; if (tag.local === "tab") parts.push(" "); });
      parser.on("text", text => { if (inText) parts.push(text); });
      parser.on("closetag", tag => { if (tag.local === "t") inText = false; if (tag.local === "p") parts.push("\n"); });
      parser.write(xml).close(); const value = parts.join("");
      return [{ text: value.slice(0, MAX_TEXT), basis: "DOCX_TEXT_EXTRACTION", truncated: value.length > MAX_TEXT }];
    }
    const entries = Object.entries(contents).filter(([name]) => /\.(?:txt|md|json|tsx?|jsx?|py|css|html?|yml|yaml|csv)$/i.test(name)).slice(0, 12);
    return entries.map(([name, bytes]) => { const text = Buffer.from(bytes).toString("utf8"); return { name, text: text.slice(0, MAX_TEXT), basis: "ZIP_TEXT_EXTRACTION", truncated: skipped || count > entries.length || text.length > MAX_TEXT, analysis: ast(text, name) }; });
  }
  const text = body.toString("utf8");
  return [{ text: text.slice(0, MAX_TEXT), basis: "FETCHED_TEXT", truncated: text.length > MAX_TEXT, analysis: ast(text, source) }];
}
parse().then(result => parentPort?.postMessage({ result })).catch(error => parentPort?.postMessage({ error: String(error?.message ?? "DOCUMENT_PARSE_FAILED").slice(0, 120) }));
