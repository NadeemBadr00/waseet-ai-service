import { inflateSync } from "node:zlib";
import sharp from "sharp";

/**
 * Evidence images are DECODED, not merely recognised. "Sent to the model" is not "read": an image counts only when a real decoder (libvips through sharp) opens the
 * container and produces every pixel, within hard limits that are enforced while decoding:
 *  - input size is capped by the caller (2 MB);
 *  - pixel count is capped before any pixel is produced (`limitInputPixels`), so a 1x1 header can not hide a huge canvas and a 20000x20000 header is refused outright;
 *  - the decoded raster must be exactly width x height x channels and under MAX_DECODED_BYTES;
 *  - a PNG's compressed pixel stream is inflated with a hard output cap equal to what its own header allows (a few KB of IDAT that expands to megabytes is refused);
 *  - truncated or damaged data fails (`failOn: "warning"`), only the first frame is read, and only png / jpeg / webp are accepted.
 * It judges the container, never the content.
 */
export interface ImageCheck { ok: boolean; width?: number; height?: number; reason?: string }

export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_DECODED_BYTES = MAX_IMAGE_PIXELS * 4;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FORMAT_FOR_MIME: Readonly<Record<string, "png" | "jpeg" | "webp">> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };

/** Bytes a PNG's pixel stream may legally inflate to, from its own header (filter byte per row included; Adam7 passes summed). null = header not understood. */
function pngExpectedInflatedBytes(ihdr: Buffer): number | null {
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), depth = ihdr[8]!, colorType = ihdr[9]!, interlace = ihdr[12]!;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || !width || !height) return null;
  const rowBytes = (w: number) => 1 + Math.ceil((w * channels * depth) / 8);
  if (interlace === 0) return rowBytes(width) * height;
  if (interlace !== 1) return null;
  const passes: Array<[number, number, number, number]> = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  let total = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = Math.ceil((width - x0) / dx), passHeight = Math.ceil((height - y0) / dy);
    if (passWidth > 0 && passHeight > 0) total += rowBytes(passWidth) * passHeight;
  }
  return total;
}

/** The PNG data stream, inflated under a cap taken from the header: a decompression bomb is refused here, before the decoder ever sees it. */
function pngBombGuard(body: Buffer): ImageCheck | null {
  if (body.length < 33 || !body.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, reason: "PNG_SIGNATURE" };
  let offset = 8, expected: number | null = null, sawIend = false;
  const idat: Buffer[] = [];
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset), type = body.toString("ascii", offset + 4, offset + 8), end = offset + 12 + length;
    if (end > body.length) return { ok: false, reason: "PNG_TRUNCATED" };
    if (type === "IHDR") { if (length !== 13) return { ok: false, reason: "PNG_IHDR" }; if (body.readUInt32BE(offset + 8) * body.readUInt32BE(offset + 12) > MAX_IMAGE_PIXELS) return { ok: false, reason: "IMAGE_TOO_LARGE" }; expected = pngExpectedInflatedBytes(body.subarray(offset + 8, offset + 21)); if (expected === null) return { ok: false, reason: "PNG_HEADER" }; }
    if (type === "IDAT") idat.push(body.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") { sawIend = true; break; }
    offset = end;
  }
  if (expected === null || !idat.length || !sawIend) return { ok: false, reason: "PNG_INCOMPLETE" };
  try {
    const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
    if (inflated.length !== expected) return { ok: false, reason: "PNG_DATA_LENGTH" };
  } catch (error) {
    return { ok: false, reason: (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "PNG_DECOMPRESSION_BOMB" : "PNG_DATA" };
  }
  return null;
}

export async function checkImage(body: Buffer, mimeType: string): Promise<ImageCheck> {
  const format = FORMAT_FOR_MIME[mimeType.toLowerCase()];
  if (!format) return { ok: false, reason: "UNSUPPORTED_IMAGE_TYPE" };
  if (format === "png") { const guarded = pngBombGuard(body); if (guarded) return guarded; }
  try {
    const decoder = sharp(body, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning", pages: 1, sequentialRead: true });
    const meta = await decoder.metadata();
    if (meta.format !== format) return { ok: false, reason: "FORMAT_MISMATCH" };
    if (!meta.width || !meta.height || meta.width * meta.height > MAX_IMAGE_PIXELS) return { ok: false, reason: "IMAGE_DIMENSIONS" };
    // a full decode: every pixel is produced, so truncated / damaged data surfaces here
    const { data, info } = await decoder.raw().toBuffer({ resolveWithObject: true });
    if (info.width !== meta.width || info.height !== meta.height || data.length !== info.width * info.height * info.channels || data.length > MAX_DECODED_BYTES) return { ok: false, reason: "DECODED_SIZE" };
    return { ok: true, width: info.width, height: info.height };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    return { ok: false, reason: /pixel limit|exceeds/i.test(message) ? "IMAGE_TOO_LARGE" : "IMAGE_NOT_DECODABLE" };
  }
}
