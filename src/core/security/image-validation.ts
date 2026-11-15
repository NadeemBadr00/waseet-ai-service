import { inflateSync } from "node:zlib";

/**
 * Structural decode check for the images we accept as evidence (PNG / JPEG / WebP). "Sent to the model" is not "read": an image only counts when its container is
 * well formed (signature, dimensions, and the data a decoder needs), so a file that merely starts with the right bytes - or random bytes over 32 - is rejected here.
 * It does not judge content; it answers "could a decoder open this?".
 */
export interface ImageCheck { ok: boolean; width?: number; height?: number; reason?: string }

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXELS = 100_000_000;

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return ~crc >>> 0;
}

function checkPng(body: Buffer): ImageCheck {
  if (body.length < 33 || !body.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, reason: "PNG_SIGNATURE" };
  let offset = 8, width = 0, height = 0, sawIhdr = false, sawIend = false;
  const idat: Buffer[] = [];
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset), type = body.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > body.length) return { ok: false, reason: "PNG_TRUNCATED" };
    const data = body.subarray(offset + 8, offset + 8 + length);
    if (crc32(body.subarray(offset + 4, offset + 8 + length)) !== body.readUInt32BE(offset + 8 + length)) return { ok: false, reason: "PNG_CRC" };
    if (type === "IHDR") { if (length !== 13) return { ok: false, reason: "PNG_IHDR" }; width = data.readUInt32BE(0); height = data.readUInt32BE(4); sawIhdr = true; }
    else if (!sawIhdr) return { ok: false, reason: "PNG_IHDR_FIRST" };
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") { sawIend = true; break; }
    offset = end;
  }
  if (!sawIhdr || !sawIend || !idat.length) return { ok: false, reason: "PNG_INCOMPLETE" };
  if (!width || !height || width * height > MAX_PIXELS) return { ok: false, reason: "PNG_DIMENSIONS" };
  try { inflateSync(Buffer.concat(idat)); } catch { return { ok: false, reason: "PNG_DATA" }; }
  return { ok: true, width, height };
}

function checkJpeg(body: Buffer): ImageCheck {
  if (body.length < 32 || body[0] !== 0xff || body[1] !== 0xd8) return { ok: false, reason: "JPEG_SIGNATURE" };
  let offset = 2, width = 0, height = 0, sawScan = false;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 0xff) return { ok: false, reason: "JPEG_MARKER" };
    const marker = body[offset + 1]!;
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd9) break;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) { offset += 2; continue; }
    const length = body.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > body.length) return { ok: false, reason: "JPEG_TRUNCATED" };
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      height = body.readUInt16BE(offset + 5); width = body.readUInt16BE(offset + 7);
    }
    if (marker === 0xda) { sawScan = true; break; }
    offset += 2 + length;
  }
  if (!width || !height || width * height > MAX_PIXELS || !sawScan) return { ok: false, reason: "JPEG_INCOMPLETE" };
  if (!body.subarray(Math.max(0, body.length - 4)).includes(Buffer.from([0xff, 0xd9]))) return { ok: false, reason: "JPEG_NO_EOI" };
  return { ok: true, width, height };
}

function checkWebp(body: Buffer): ImageCheck {
  if (body.length < 30 || body.toString("ascii", 0, 4) !== "RIFF" || body.toString("ascii", 8, 12) !== "WEBP") return { ok: false, reason: "WEBP_SIGNATURE" };
  if (body.readUInt32LE(4) + 8 > body.length) return { ok: false, reason: "WEBP_TRUNCATED" };
  const chunk = body.toString("ascii", 12, 16);
  let width = 0, height = 0;
  if (chunk === "VP8 ") { if (body[23] !== 0x9d || body[24] !== 0x01 || body[25] !== 0x2a) return { ok: false, reason: "WEBP_VP8" }; width = body.readUInt16LE(26) & 0x3fff; height = body.readUInt16LE(28) & 0x3fff; }
  else if (chunk === "VP8L") { if (body[20] !== 0x2f) return { ok: false, reason: "WEBP_VP8L" }; const bits = body.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
  else if (chunk === "VP8X") { width = (body.readUIntLE(24, 3)) + 1; height = (body.readUIntLE(27, 3)) + 1; }
  else return { ok: false, reason: "WEBP_CHUNK" };
  if (!width || !height || width * height > MAX_PIXELS) return { ok: false, reason: "WEBP_DIMENSIONS" };
  return { ok: true, width, height };
}

export function checkImage(body: Buffer, mimeType: string): ImageCheck {
  const mime = mimeType.toLowerCase();
  if (mime === "image/png") return checkPng(body);
  if (mime === "image/jpeg") return checkJpeg(body);
  if (mime === "image/webp") return checkWebp(body);
  return { ok: false, reason: "UNSUPPORTED_IMAGE_TYPE" };
}
