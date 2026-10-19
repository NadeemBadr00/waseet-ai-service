#!/usr/bin/env node
/** Local, deterministic, review-only developer documentation index. Never a customer KB importer. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEX_VERSION = 'developer-docs-v1';
const SERVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = 'C:\\Users\\DELL\\Desktop\\AI_Docs';
const REDACTED = '[REDACTED]';
const hash = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const NAV_LABELS = new Set(['Skip to main content', 'Search', '/', 'English', 'Get API key', 'Cookbook', 'Community', 'Sign in', 'Docs', 'API reference', 'Home', 'On this page', 'Copy page', 'Was this page helpful?', 'Yes', 'No', 'Previous', 'Next', 'Privacy', 'Terms', 'Manage cookies', 'Cookie settings', 'Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'REST']);

/** Counts credential-like literals, not verified active credentials; never logs matched values. */
export function redactCredentials(text) {
  let replacements = 0;
  const replace = (pattern, render = () => REDACTED) => {
    text = text.replace(pattern, (...args) => { replacements++; return render(...args); });
  };
  replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY)-----/g,
    value => value.split('\n').map((_, i) => i === 0 ? '[REDACTED PRIVATE KEY]' : '').join('\n'));
  replace(/\b(?:AIza[\w-]{20,}|sk-(?:proj-|ant-api\d+-)?[\w-]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|xox[baprs]-[\w-]{15,}|AKIA[A-Z0-9]{16})\b/g);
  replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g);
  replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, (_, protocol) => `${protocol}[REDACTED]@`);
  replace(/(\b(?:Bearer|Basic)\s+)([A-Za-z0-9_+./=-]{8,})/gi, (_, prefix) => `${prefix}${REDACTED}`);
  const key = '(?:[A-Z_]*API[_-]?KEY|[A-Z_]*CLIENT[_-]?SECRET|[A-Z_]*ACCESS[_-]?TOKEN|[A-Z_]*REFRESH[_-]?TOKEN|[A-Z_]*AUTH[_-]?TOKEN|[A-Z_]*PASSWORD|[A-Z_]*SECRET[_-]?KEY)';
  replace(new RegExp(`((?:["']?${key}["']?)\\s*[:=]\\s*)(["'])([^\\r\\n]*?)\\2`, 'gi'),
    (match, prefix, quote, value) => {
      if (value.includes('[REDACTED]') || /^(?:\$\{|process\.env|os\.environ|YOUR_|<|\{\{)/i.test(value)) { replacements--; return match; }
      return `${prefix}${quote}${REDACTED}${quote}`;
    });
  replace(new RegExp(`(\\b${key}\\s*=\\s*)([A-Za-z0-9_+./=-]{8,})`, 'gi'),
    (match, prefix, value) => /^(?:YOUR_|process\.|os\.)/i.test(value) ? (replacements--, match) : `${prefix}${REDACTED}`);
  replace(/([?&](?:api[_-]?key|key|access[_-]?token|refresh[_-]?token|token|secret|password)=)([^\s&#"'<>\])]+)/gi,
    (match, prefix, value) => value.includes('REDACTED') ? (replacements--, match) : `${prefix}${REDACTED}`);
  return { text, replacements };
}

function isProse(line) {
  const text = line.trim();
  return text.length >= 75 && text.split(/\s+/).length >= 10 && /[.!?:،。]$/.test(text)
    && !/^(?:[>|{[\]`]|https?:|\w+\s*=|(?:const|let|var|import|from|def|class)\b)/.test(text)
    && !/[{};]|=>/.test(text);
}

/** Retains original line numbers after removals; embedded instructions remain untrusted data. */
export function cleanDocument(raw, title = 'Document') {
  const redacted = redactCredentials(raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  const lines = redacted.text.split('\n');
  let start = 0;
  const markdownTitle = lines.findIndex(line => /^#\s+\S/.test(line));
  const scrape = lines.slice(0, 12).some(line => /^(Skip to main content|For the complete documentation index|For complete documentation index)/i.test(line));
  if (scrape && markdownTitle < 0) {
    const prose = lines.findIndex((line, i) => i < 1200 && isProse(line));
    if (prose >= 0) {
      start = prose;
      for (let i = prose - 1; i >= Math.max(0, prose - 8); i--) {
        if (lines[i].trim().toLowerCase() === title.toLowerCase()) { start = i; break; }
      }
    }
  }
  let removed = start;
  let fence = false;
  const kept = [];
  for (let i = start; i < lines.length; i++) {
    const text = lines[i].trimEnd();
    const trimmed = text.trim();
    if (/^\s*(```|~~~)/.test(text)) fence = !fence;
    const boilerplate = !fence && (
      /^>\s*(?:## Documentation Index|Fetch the complete documentation index at:|Use this file to discover all available pages)/.test(trimmed)
      || /^For (?:the )?complete documentation index.*llms\.txt/i.test(trimmed)
      || NAV_LABELS.has(trimmed)
      || /^Gemini [\d.]+ (?:Flash|Pro).*now available.*Try it out\./.test(trimmed)
      || /^(?:Last updated .* UTC\.?|Except as otherwise noted, the content of this page is licensed)/.test(trimmed)
    );
    if (boilerplate) { removed++; continue; }
    if (!trimmed && (!kept.length || !kept.at(-1).text.trim())) { removed++; continue; }
    kept.push({ text, line: i + 1 });
  }
  while (kept.length && !kept.at(-1).text.trim()) { kept.pop(); removed++; }
  return { lines: kept, navigationLinesRemoved: removed, redactions: redacted.replacements };
}

function heading(line, previous, next, fenced) {
  if (fenced) return null;
  const explicit = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
  if (explicit) return { level: explicit[1].length, title: explicit[2].slice(0, 180) };
  // Conservative fallback for scraped plain-text headings, never code expressions.
  if (line.length >= 4 && line.length <= 90 && !previous?.trim() && next?.trim()
      && /^[A-Z\p{Script=Arabic}][\p{L}\p{N} ()/&'’–-]+$/u.test(line)
      && !NAV_LABELS.has(line) && !/^(?:const|import|from|return|print|client|model|input)\b/i.test(line)) {
    return { level: 2, title: line };
  }
  return null;
}

export function chunkDocument(lines, title, maxChars = 2400) {
  const sections = [];
  let current = { section: title, lines: [] };
  const headings = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = heading(line.text, lines[i - 1]?.text, lines[i + 1]?.text, fence);
    if (h) {
      if (current.lines.length) sections.push(current);
      headings.splice(h.level - 1);
      headings[h.level - 1] = h.title;
      current = { section: headings.filter(Boolean).join(' / ') || title, lines: [] };
    }
    current.lines.push(line);
    if (/^\s*(```|~~~)/.test(line.text)) fence = !fence;
  }
  if (current.lines.length) sections.push(current);
  const chunks = [];
  for (const section of sections) {
    let parts = [];
    let length = 0;
    const flush = () => {
      const text = parts.map(part => part.text).join('\n').trim();
      if (text.length >= 80) chunks.push({ text, section: section.section, lineStart: parts[0].line, lineEnd: parts.at(-1).line });
      parts = []; length = 0;
    };
    for (const line of section.lines) {
      // Split even pathological generated/code lines so the bound is strict.
      for (let offset = 0; offset < Math.max(line.text.length, 1); offset += maxChars) {
        const part = { text: line.text.slice(offset, offset + maxChars), line: line.line };
        if (length + part.text.length + (parts.length ? 1 : 0) > maxChars) flush();
        parts.push(part); length += part.text.length + (parts.length > 1 ? 1 : 0);
      }
    }
    flush();
  }
  return chunks;
}

async function walk(root) {
  const result = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { result.push({ full, relative: slash(path.relative(root, full)), symlink: true }); continue; }
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push({ full, relative: slash(path.relative(root, full)) });
    }
  };
  await visit(root);
  return result;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function titleFromFile(file) {
  return path.basename(file, path.extname(file)).replace(/^\d+_/, '').replaceAll('_', ' ').slice(0, 180);
}

function documentOrigin(raw) {
  // An index URL is not a verified canonical page URL. Record only explicit local provenance.
  const indexUrl = raw.slice(0, 3000).match(/https?:\/\/[^\s<>]+\/llms\.txt/);
  return indexUrl ? { documentationIndexUrl: redactCredentials(indexUrl[0]).text, verification: 'local-archive-unverified' }
    : { verification: 'local-archive-unverified' };
}

async function writeAtomic(filename, text) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  await fs.writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filename);
}

export async function indexDeveloperDocs(options = {}) {
  const source = await fs.realpath(path.resolve(options.source ?? DEFAULT_SOURCE));
  const output = path.resolve(options.output ?? path.join(SERVICE_ROOT, 'work/developer-knowledge.jsonl'));
  const reportFile = path.resolve(options.report ?? path.join(SERVICE_ROOT, 'work/developer-knowledge-report.json'));
  const maxChars = Number(options.maxChars ?? 2400);
  if (!Number.isInteger(maxChars) || maxChars < 400 || maxChars > 10000) throw new Error('maxChars must be an integer from 400 to 10000');
  if (inside(source, output) || inside(source, reportFile) || output === reportFile) throw new Error('Outputs must be distinct and outside the read-only source archive');
  // Resolve existing output ancestors to reject symlink aliases back into the originals.
  for (const target of [output, reportFile]) {
    let ancestor = path.dirname(target);
    while (true) {
      try { if (inside(source, await fs.realpath(ancestor))) throw new Error('Output ancestor aliases the read-only source archive'); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; const next = path.dirname(ancestor); if (next === ancestor) throw error; ancestor = next; }
    }
    try { if (inside(source, await fs.realpath(target))) throw new Error('Output aliases the read-only source archive'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const files = await walk(source);
  const report = {
    indexVersion: INDEX_VERSION, sourceRoot: source, outputFile: output, reportFile,
    policy: { status: 'DRAFT', audience: 'admin', autoApproved: false, customerKnowledge: false, networkUsed: false, modelsUsed: false, sourceModified: false },
    maxChunkChars: maxChars, filesDiscovered: files.length, documentsRead: 0, sourceBytes: 0,
    navigationLinesRemoved: 0, credentialLikeLiteralsRedacted: 0,
    rawDuplicateDocuments: 0, cleanedDuplicateDocuments: 0, chunkOccurrences: 0, chunksUnique: 0,
    skipped: [], documents: [], warnings: ['Local archive claims and model/pricing/version statements are unverified and require administrator review.'],
  };
  const rawHashes = new Map();
  const cleanHashes = new Map();
  const uniqueChunks = new Map();
  const manifest = [];
  for (const file of files) {
    const safeRelative = redactCredentials(file.relative).text;
    const ext = path.extname(file.relative).toLowerCase();
    let reason = file.symlink ? 'symlink-not-followed' : null;
    if (/^MultiAgentsNext_All_Codes\.txt$/i.test(path.basename(file.relative))) reason = 'raw-code-corpus-reference-only';
    else if (ext === '.pdf') reason = 'pdf-not-extracted-text-and-layout-review-required';
    else if (/^000_.*INDEX\.md$/i.test(path.basename(file.relative))) reason = 'navigation-index-reference-only';
    else if (!['.md', '.txt', '.markdown'].includes(ext)) reason = 'unsupported-format';
    if (reason) { report.skipped.push({ sourceFile: safeRelative, reason }); continue; }
    const bytes = await fs.readFile(file.full);
    const versionHash = hash(bytes);
    const raw = bytes.toString('utf8');
    const title = redactCredentials(titleFromFile(file.relative)).text;
    const cleaned = cleanDocument(raw, title);
    const cleanedHash = hash(cleaned.lines.map(line => line.text).join('\n'));
    const chunks = chunkDocument(cleaned.lines, title, maxChars);
    report.documentsRead++; report.sourceBytes += bytes.length;
    report.navigationLinesRemoved += cleaned.navigationLinesRemoved;
    report.credentialLikeLiteralsRedacted += cleaned.redactions;
    const rawDuplicateOf = rawHashes.get(versionHash) ?? null;
    const cleanedDuplicateOf = cleanHashes.get(cleanedHash) ?? null;
    if (rawDuplicateOf) report.rawDuplicateDocuments++;
    if (cleanedDuplicateOf) report.cleanedDuplicateDocuments++;
    if (!rawDuplicateOf) rawHashes.set(versionHash, safeRelative);
    if (!cleanedDuplicateOf) cleanHashes.set(cleanedHash, safeRelative);
    manifest.push([safeRelative, versionHash]);
    report.documents.push({ sourceFile: safeRelative, versionHash, cleanedHash, chunkOccurrences: chunks.length, redactions: cleaned.redactions, navigationLinesRemoved: cleaned.navigationLinesRemoved, rawDuplicateOf, cleanedDuplicateOf });
    if (!chunks.length) report.skipped.push({ sourceFile: safeRelative, reason: 'no-substantive-text-after-cleaning' });
    for (const chunk of chunks) {
      report.chunkOccurrences++;
      const contentHash = hash(chunk.text);
      const provenance = { sourceFile: safeRelative, section: chunk.section, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd, versionHash, cleanedHash, ...documentOrigin(raw) };
      const prior = uniqueChunks.get(contentHash);
      if (prior) prior.sources.push(provenance);
      else uniqueChunks.set(contentHash, {
        id: `devdoc_${contentHash}`, indexVersion: INDEX_VERSION, status: 'DRAFT', audience: 'admin',
        autoApproved: false, customerKnowledge: false, kind: 'developer-documentation', trust: 'untrusted-source-content',
        contentHash, text: chunk.text, sources: [provenance],
      });
    }
  }
  const chunks = [...uniqueChunks.values()].sort((a, b) => compare(a.id, b.id));
  for (const chunk of chunks) {
    chunk.sources.sort((a, b) => compare(a.sourceFile, b.sourceFile) || a.lineStart - b.lineStart || compare(a.section, b.section));
    if (chunk.text.length > maxChars || chunk.status !== 'DRAFT' || chunk.audience !== 'admin' || chunk.autoApproved || chunk.customerKnowledge) throw new Error('Chunk policy invariant failed');
    if (redactCredentials(chunk.text).replacements > 0 || chunk.sources.some(source => redactCredentials(source.section).replacements > 0 || redactCredentials(source.sourceFile).replacements > 0)) throw new Error(`Credential guard rejected sanitized chunk at ${chunk.sources[0].sourceFile}:${chunk.sources[0].lineStart}`);
  }
  const jsonl = chunks.map(chunk => JSON.stringify(chunk)).join('\n') + (chunks.length ? '\n' : '');
  report.chunksUnique = chunks.length;
  report.duplicateChunkOccurrencesRemoved = report.chunkOccurrences - chunks.length;
  report.sourceManifestHash = hash(JSON.stringify(manifest));
  report.indexContentHash = hash(jsonl);
  report.verification = { boundedChunks: true, secretsGuardPassed: true, onlyAdminDraft: true, originalsWritten: false };
  await writeAtomic(output, jsonl);
  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return { report, chunks };
}

async function main() {
  const options = {};
  const names = { '--source': 'source', '--output': 'output', '--report': 'report', '--max-chars': 'maxChars' };
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log('node scripts/index-developer-docs.mjs [--source DIR] [--output FILE] [--report FILE] [--max-chars 2400]\nLocal only. Originals read-only. Output is admin DRAFT developer knowledge; no KB import.');
    return;
  }
  for (let i = 0; i < argv.length; i++) {
    if (!names[argv[i]] || !argv[i + 1]) throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    options[names[argv[i]]] = argv[++i];
  }
  const { report } = await indexDeveloperDocs(options);
  console.log(JSON.stringify({ documentsRead: report.documentsRead, chunksUnique: report.chunksUnique, duplicateChunkOccurrencesRemoved: report.duplicateChunkOccurrencesRemoved, credentialLikeLiteralsRedacted: report.credentialLikeLiteralsRedacted, skippedFiles: report.skipped.length, outputFile: report.outputFile, reportFile: report.reportFile, indexContentHash: report.indexContentHash }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Developer index failed: ${error.message}`); process.exitCode = 1; });
}
