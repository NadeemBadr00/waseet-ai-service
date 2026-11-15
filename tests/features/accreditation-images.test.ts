import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { authHeaders, buildApp, paidFixture, GeminiGateway, forbidNetwork } from "../helpers/ai-fixtures.js";
import type { InferenceRequest } from "../../src/router/types.js";
import { checkImage } from "../../src/core/security/image-validation.js";
import { AccreditationService, ACCREDITATION_RUBRIC } from "../../src/features/providers/accreditation.service.js";

// "Sent to the model" is not "read": an image counts as evidence only when it decodes AND the model confirms it saw it.
const crc32 = (buffer: Buffer) => { let crc = ~0; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return ~crc >>> 0; };
const chunk = (type: string, data: Buffer) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([length, body, crc]); };
function makePng(width = 8, height = 8): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height); for (let y = 0; y < height; y++) for (let x = 0; x < width * 3; x++) raw[y * (width * 3 + 1) + 1 + x] = (x * 7 + y * 13) & 255;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const VALID_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAACAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACAAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8Ap/sgfAj/AI8v9H/u9q/Sb/hRH/Tv+leH/sgf8uX/AAGv0mr1Dzz/2Q==", "base64");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const garbage = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
const uri = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

describe("accreditation images: sent is not read", () => {
  const app = buildApp();
  before(async () => { paidFixture(); await app.ready(); });
  beforeEach(() => { paidFixture(); globalThis.fetch = forbidNetwork; });
  after(() => { GeminiGateway.setMockHandler(null); });

  const answer = (readable: boolean | "omit") => async (req: InferenceRequest) => {
    const prompt = JSON.parse(req.prompt);
    return JSON.stringify({
      criteria: ACCREDITATION_RUBRIC.criteria.map(c => ({ id: c.id, score: 80, observation: "ملاحظة من الصورة" })),
      ...(readable === "omit" ? {} : { visualReadings: prompt.visualAttachments.map((att: { index: number }) => ({ index: att.index, readable, observation: readable ? "واجهة تطبيق فيها قائمة وأزرار" : "الصورة غير واضحة" })) }),
      feedbackAr: "قراءة من الصورة", findings: [], recommendations: ["أضف توثيقًا"],
    });
  };
  const review = (attachments: string[]) => AccreditationService.evaluateAccreditation("img-1", "تطبيق", undefined, [], "وصف تطبيق كامل وواضح", undefined, { attachments, specialtyName: "تطوير تطبيقات" });

  test("the structural check accepts a real PNG and JPEG and rejects signature-only / truncated / random files of any size above 32 bytes", () => {
    assert.equal(checkImage(makePng(), "image/png").ok, true);
    assert.equal(checkImage(VALID_JPEG, "image/jpeg").ok, true);
    assert.equal(checkImage(Buffer.concat([PNG_SIGNATURE, garbage(120)]), "image/png").ok, false, "PNG signature followed by garbage");
    assert.equal(checkImage(makePng().subarray(0, 60), "image/png").ok, false, "truncated PNG");
    assert.equal(checkImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), garbage(150)]), "image/jpeg").ok, false, "JPEG start then garbage");
    assert.equal(checkImage(garbage(200), "image/webp").ok, false);
    assert.equal(checkImage(makePng(), "image/gif").ok, false, "an unsupported type is not accepted");
  });

  test("a valid PNG that the model confirms it read: inspected=true, the score is computed, sent and reviewed are counted separately", async () => {
    GeminiGateway.setMockHandler(answer(true));
    const out = await review([uri("image/png", makePng())]);
    assert.equal(out.inspected, true);
    assert.equal(out.basis, "VISUAL_ATTACHMENT_CONFIRMED");
    assert.equal(out.aiScore, 80);
    assert.equal(out.evidenceSent, 1);
    assert.equal(out.evidenceReviewed, 1);
    assert.equal(out.humanReviewRequired, true);
  });

  test("the same through the HTTP route: the response says inspected=true with the score, exactly what the website requires to store it", async () => {
    GeminiGateway.setMockHandler(answer(true));
    const res = await app.inject({ method: "POST", url: "/v1/ai/accreditation-review", headers: authHeaders("p1", "provider"), payload: { sampleId: "s1", title: "تطبيق", description: "وصف", technologiesUsed: [], specialtyName: "تطوير", attachments: [uri("image/png", makePng())] } });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.inspected, true);
    assert.equal(data.evaluation.aiScore, 80);
  });

  test("a CORRUPT image larger than 32 bytes is never sent to the model and never scored; it is reported as not decodable", async () => {
    let modelCalls = 0;
    GeminiGateway.setMockHandler(async (req) => { modelCalls += 1; return JSON.stringify({ feedbackAr: "وصف", strengths: [], recommendations: [] }); });
    for (const bad of [uri("image/png", Buffer.concat([PNG_SIGNATURE, garbage(120)])), uri("image/jpeg", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), garbage(150)])), uri("image/png", garbage(200))]) {
      const out = await review([bad]);
      assert.equal(out.aiScore, null);
      assert.equal(out.aiQualityRating, null);
      assert.equal(out.inspected, false);
      assert.equal(out.evidenceReviewed, 0);
      assert.ok(out.evidenceMissing!.some(item => item.startsWith("IMAGE_NOT_DECODABLE:")), JSON.stringify(out.evidenceMissing));
    }
    assert.equal(modelCalls, 3, "only the description-only commentary ran; no image reached an evidence review");
  });

  test("a valid image the MODEL says it could not read: no score, inspected=false, reported as not confirmed", async () => {
    GeminiGateway.setMockHandler(async (req) => (req.featureId.includes("DECLARED") ? JSON.stringify({ feedbackAr: "وصف", strengths: [], recommendations: [] }) : answer(false)(req)));
    const out = await review([uri("image/png", makePng())]);
    assert.equal(out.aiScore, null);
    assert.equal(out.inspected, false);
    assert.ok(out.evidenceMissing!.some(item => item.startsWith("IMAGE_NOT_CONFIRMED_READABLE:")));
  });

  test("a model answer that does not say whether each sent image was read is refused", async () => {
    GeminiGateway.setMockHandler(answer("omit"));
    await assert.rejects(review([uri("image/png", makePng())]), /AI_UNGROUNDED|حالة قراءة/);
  });

  test("one readable and one corrupt image: only the readable one is scored and the corrupt one is reported", async () => {
    GeminiGateway.setMockHandler(answer(true));
    const out = await review([uri("image/png", makePng()), uri("image/png", Buffer.concat([PNG_SIGNATURE, garbage(90)]))]);
    assert.equal(out.inspected, true);
    assert.equal(out.evidenceSent, 1);
    assert.equal(out.evidenceReviewed, 1);
    assert.ok(out.evidenceMissing!.some(item => item.startsWith("IMAGE_NOT_DECODABLE:")));
  });
});
