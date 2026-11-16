import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiGateway, paidFixture } from "../helpers/ai-fixtures.js";
const { IdentityService, expectedKindOf, documentKindMismatch } = await import("../../src/features/identity/identity.service.js");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64").toString("base64");
const ocr = (kind: string, extra: Record<string, unknown> = {}) => JSON.stringify({ isIdentityDocument: true, detectedSide: "FRONT", readability: "CLEAR", documentKind: kind, summaryAr: "وثيقة واضحة", warningsAr: [], ...extra });
const inspect = async (answer: string, type?: string) => {
  paidFixture(); GeminiGateway.setMockHandler(async () => answer);
  try { return await IdentityService.inspectDocument({ side: "FRONT", image: png, imageMimeType: "image/png", ...(type ? { document: { country: "EG", type } } : {}) } as never); } finally { GeminiGateway.setMockHandler(null); }
};

test("chosen kinds map from the app's codes (either licence spelling); unknown codes state nothing", () => {
  assert.equal(expectedKindOf("NATIONAL_ID"), "NATIONAL_ID"); assert.equal(expectedKindOf("DRIVING_LICENSE"), "DRIVING_LICENCE");
  assert.equal(expectedKindOf("DRIVING_LICENCE"), "DRIVING_LICENCE"); assert.equal(expectedKindOf("RESIDENCE_PERMIT"), "RESIDENCE_PERMIT");
  assert.equal(expectedKindOf("whatever"), null); assert.equal(expectedKindOf(undefined), null);
});

test("mismatch only when a specific, different kind was recognised", () => {
  assert.equal(documentKindMismatch("NATIONAL_ID", "PASSPORT"), true);
  assert.equal(documentKindMismatch("NATIONAL_ID", "NATIONAL_ID"), false);
  assert.equal(documentKindMismatch("NATIONAL_ID", "UNKNOWN"), false);
  assert.equal(documentKindMismatch(null, "PASSPORT"), false);
});

test("a passport uploaded as «بطاقة هوية وطنية» needs attention and says why", async () => {
  const out = await inspect(ocr("PASSPORT"), "NATIONAL_ID");
  assert.equal(out.status, "NEEDS_ATTENTION"); assert.equal(out.documentTypeMatches, false); assert.equal(out.documentKind, "PASSPORT");
  assert.match(out.warningsAr[0]!, /جواز سفر.*بطاقة هوية وطنية/);
});

test("the right kind stays clear and reports the match", async () => {
  const out = await inspect(ocr("NATIONAL_ID"), "NATIONAL_ID");
  assert.equal(out.status, "CLEAR_VALID"); assert.equal(out.documentTypeMatches, true);
});

test("no kind chosen, or the model cannot tell: no kind verdict is invented", async () => {
  const a = await inspect(ocr("PASSPORT")); assert.equal(a.documentTypeMatches, undefined); assert.equal(a.status, "CLEAR_VALID");
  const b = await inspect(ocr("UNKNOWN"), "NATIONAL_ID"); assert.equal(b.documentTypeMatches, undefined); assert.equal(b.status, "CLEAR_VALID");
});
