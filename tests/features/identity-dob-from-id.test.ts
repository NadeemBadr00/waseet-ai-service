import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiGateway, paidFixture } from "../helpers/ai-fixtures.js";
const { birthDateFromEgyptianNationalId, compareBirthDatesWithId, IdentityService } = await import("../../src/features/identity/identity.service.js");

test("the birth date inside an Egyptian national ID number (century digit + YYMMDD)", () => {
  assert.deepEqual(birthDateFromEgyptianNationalId("30408012203296"), { year: 2004, month: 8, day: 1 });
  assert.deepEqual(birthDateFromEgyptianNationalId("٢٩٠٠١٠١١٢٣٤٥٦٧"), { year: 1990, month: 1, day: 1 });
  for (const bad of ["12345", "40408012203296", "30413012203296", "30402302203296", "", null, undefined]) assert.equal(birthDateFromEgyptianNationalId(bad as never), null);
});

test("an unreadable / swapped printed date is confirmed by the number when the declared date equals it", () => {
  const id = "30408012203296";
  assert.deepEqual(compareBirthDatesWithId("2004-08-01", null, null, id), { status: "MATCH", reason: "CONFIRMED_BY_NATIONAL_ID_NUMBER" });
  assert.deepEqual(compareBirthDatesWithId("2004-08-01", "2004-01-08", "2004/01/08", id), { status: "MATCH", reason: "CONFIRMED_BY_NATIONAL_ID_NUMBER" });
  assert.equal(compareBirthDatesWithId("2004-08-01", "2004-08-01", null, id).reason, undefined); // already read correctly: plain MATCH
});

test("a declared date that differs from the number's date is still a MISMATCH; no readable number keeps the old result", () => {
  assert.equal(compareBirthDatesWithId("2004-01-08", null, null, "30408012203296").status, "COULD_NOT_VERIFY"); // declared differs from the number's date, nothing printed readable: not confirmed
  assert.equal(compareBirthDatesWithId("2004-01-08", "2004-08-01", null, "30408012203296").status, "MISMATCH");
  assert.equal(compareBirthDatesWithId("2004-08-01", null, null, null).status, "COULD_NOT_VERIFY");
});

test("inspect-document: a date the model misread but the number confirms is not reported as a mismatch", async () => {
  paidFixture();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64").toString("base64");
  GeminiGateway.setMockHandler(async () => JSON.stringify({ isIdentityDocument: true, detectedSide: "FRONT", readability: "CLEAR", documentKind: "NATIONAL_ID", fullNameAr: "عمرو محمود يحيى محمد", birthDateGregorianIso: "2004-01-08", nationalId: "30408012203296", summaryAr: "وثيقة واضحة", warningsAr: [] }));
  try {
    const out = await IdentityService.inspectDocument({ side: "FRONT", image: png, imageMimeType: "image/png", document: { country: "EG", type: "NATIONAL_ID" }, declared: { fullName: "عمرو محمود يحيى محمد", birthDate: "2004-08-01", nationalId: "30408012203296" } } as never);
    assert.equal(out.fields?.birthDate, "MATCH"); assert.equal(out.status, "CLEAR_VALID"); assert.deepEqual(out.warningsAr, []);
  } finally { GeminiGateway.setMockHandler(null); }
});
