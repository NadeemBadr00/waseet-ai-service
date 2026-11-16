import { z } from "zod";
import { GeminiGateway } from "../../router/gemini-gateway.js";
import { getTenantContext } from "../../core/auth/tenant-context.js";
import { featureError, parseModelOutput } from "../../core/security/model-output.js";
import type {
  FieldCompareStatusA,
  FieldCompareStatusB,
  IdentityCompareInput,
  IdentityCompareShapeA,
  IdentityCompareShapeAOutput,
  IdentityCompareShapeBOutput,
  IdentityInspectInput,
  IdentityInspectOutput,
} from "./identity.types.js";

const MAX_DECODED_ID_BYTES = 6 * 1024 * 1024;

export const DOCUMENT_KINDS = ["NATIONAL_ID", "PASSPORT", "RESIDENCE_PERMIT", "DRIVING_LICENCE", "OTHER", "UNKNOWN"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
const KIND_LABEL_AR: Record<DocumentKind, string> = { NATIONAL_ID: "بطاقة هوية وطنية", PASSPORT: "جواز سفر", RESIDENCE_PERMIT: "إقامة", DRIVING_LICENCE: "رخصة قيادة", OTHER: "وثيقة أخرى", UNKNOWN: "غير محدد" };
/** The kind the user chose (the app's codes, either spelling of licence) as a DocumentKind; anything else is "not stated". */
export function expectedKindOf(type: string | undefined): DocumentKind | null {
  const t = (type ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (t === "NATIONAL_ID" || t === "ID_CARD" || t === "NATIONAL_IDENTITY_CARD") return "NATIONAL_ID";
  if (t === "PASSPORT") return "PASSPORT";
  if (t === "RESIDENCE_PERMIT" || t === "IQAMA" || t === "RESIDENCY") return "RESIDENCE_PERMIT";
  if (t === "DRIVING_LICENCE" || t === "DRIVING_LICENSE" || t === "DRIVER_LICENSE") return "DRIVING_LICENCE";
  return null;
}
/** A documented mismatch only: the model must have named a SPECIFIC kind (not UNKNOWN / OTHER-unsure) that differs from the chosen one. */
export function documentKindMismatch(expected: DocumentKind | null, detected: DocumentKind | undefined): boolean {
  return !!expected && !!detected && detected !== "UNKNOWN" && detected !== expected;
}

const ocrSchema = z.object({
  isIdentityDocument: z.boolean(),
  detectedSide: z.enum(["FRONT", "BACK", "UNKNOWN"]).catch("UNKNOWN"),
  readability: z.enum(["CLEAR", "BLURRY", "PARTIAL", "UNREADABLE"]).catch("UNREADABLE"),
  documentKind: z.enum(DOCUMENT_KINDS).catch("UNKNOWN").optional(),
  fullNameAr: z.string().max(300).nullable().optional(),
  fullNameEn: z.string().max(300).nullable().optional(),
  birthDateGregorianIso: z.string().max(40).nullable().optional(),
  birthDateRaw: z.string().max(60).nullable().optional(),
  nationalId: z.string().max(80).nullable().optional(),
  summaryAr: z.string().max(600).optional(),
  warningsAr: z.array(z.string().max(300)).max(6).optional(),
});

type OcrExtracted = z.infer<typeof ocrSchema>;

function stripDataUrlPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",");
    if (comma < 0) throw featureError("INVALID_ID_IMAGE", "صورة المستند غير صالحة.", 400);
    return trimmed.slice(comma + 1).replace(/\s+/g, "");
  }
  return trimmed.replace(/\s+/g, "");
}

function validateAndDecodeBase64(raw: string): { base64: string; byteLength: number } {
  const base64 = stripDataUrlPrefix(raw);
  if (!base64 || base64.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(base64)) {
    throw featureError("INVALID_ID_IMAGE", "ترميز صورة المستند غير صالح.", 400);
  }
  const decoded = Buffer.from(base64, "base64");
  if (!decoded.byteLength || decoded.byteLength > MAX_DECODED_ID_BYTES) {
    throw featureError("ID_IMAGE_TOO_LARGE", "حجم صورة المستند يتجاوز الحد المسموح.", 413);
  }
  return { base64, byteLength: decoded.byteLength };
}

export function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, ch => {
    const code = ch.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

export function normalizeNationalId(value: string): string {
  return normalizeDigits(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normalizeArabicName(value: string): string {
  return normalizeDigits(value)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function nameTokens(value: string): string[] {
  const connectors = new Set(["بن", "ابن", "بنت", "ال", "عبد", "ابو", "ام", "bin", "ibn", "bint", "al", "el"]);
  const rawTokens = normalizeArabicName(value).split(" ").filter(t => t.length >= 2);
  const merged: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const cur = rawTokens[i]!;
    if ((cur === "عبد" || cur === "ابو" || cur === "ام") && i + 1 < rawTokens.length) {
      merged.push(cur + rawTokens[i + 1]!);
      i++;
    } else if (!connectors.has(cur)) {
      merged.push(cur);
    }
  }
  return merged.length > 0 ? merged : rawTokens;
}

export function compareNames(declared: string, extractedAr?: string | null, extractedEn?: string | null): { status: FieldCompareStatusA; reason?: string } {
  const candidates = [extractedAr, extractedEn].filter((v): v is string => typeof v === "string" && v.trim().length >= 2);
  if (candidates.length === 0) {
    return { status: "COULD_NOT_VERIFY", reason: "NAME_NOT_VISIBLE" };
  }
  const decNorm = normalizeArabicName(declared);
  const decTokens = nameTokens(declared);
  if (!decNorm || decTokens.length === 0) {
    return { status: "COULD_NOT_VERIFY", reason: "DECLARED_NAME_EMPTY" };
  }

  const declaredIsArabic = /[\u0600-\u06FF]/.test(declared);
  let comparableCandidateFound = false;

  for (const cand of candidates) {
    const candIsArabic = /[\u0600-\u06FF]/.test(cand);
    if (declaredIsArabic !== candIsArabic) continue;
    comparableCandidateFound = true;
    const candNorm = normalizeArabicName(cand);
    if (candNorm === decNorm || candNorm.includes(decNorm) || decNorm.includes(candNorm)) {
      return { status: "MATCH" };
    }
    const candTokens = nameTokens(cand);
    if (candTokens.length === 0) continue;
    const matched = decTokens.filter(dt => candTokens.some(ct => ct === dt || (ct.length >= 4 && dt.length >= 4 && (ct.startsWith(dt) || dt.startsWith(ct)))));
    const minRequired = Math.min(2, decTokens.length, candTokens.length);
    const c0 = candTokens[0] ?? "";
    const d0 = decTokens[0] ?? "";
    const firstMatches = c0 === d0 || (c0.length >= 3 && d0.length >= 3 && (c0.startsWith(d0) || d0.startsWith(c0)));
    if (matched.length >= minRequired && (matched.length / Math.min(decTokens.length, candTokens.length) >= 0.66) && firstMatches) {
      return { status: "MATCH" };
    }
  }

  if (!comparableCandidateFound) {
    return { status: "COULD_NOT_VERIFY", reason: "SCRIPT_TRANSLITERATION_REQUIRED" };
  }
  return { status: "MISMATCH", reason: "NAME_MISMATCH" };
}

function parseIsoDateParts(raw: string): { year: number; month: number; day: number } | null {
  const s = normalizeDigits(raw).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const first = Number(m[1]), second = Number(m[2]), year = Number(m[3]);
    if (second >= 1 && second <= 12 && first >= 1 && first <= 31) return { year, month: second, day: first };
  }
  return null;
}

export function compareBirthDates(declared: string, extractedIso?: string | null, extractedRaw?: string | null): { status: FieldCompareStatusA; reason?: string } {
  const dec = parseIsoDateParts(declared);
  if (!dec) return { status: "COULD_NOT_VERIFY", reason: "DECLARED_DATE_UNPARSEABLE" };

  const candidates = [extractedIso, extractedRaw].filter((v): v is string => typeof v === "string" && v.trim().length >= 4);
  if (candidates.length === 0) return { status: "COULD_NOT_VERIFY", reason: "BIRTH_DATE_NOT_VISIBLE" };

  let parsedAnyGregorian = false;
  let sawHijriOnly = false;

  for (const raw of candidates) {
    const parsed = parseIsoDateParts(raw);
    if (!parsed) continue;
    if (parsed.year >= 1300 && parsed.year <= 1500 && dec.year >= 1900) {
      sawHijriOnly = true;
      continue;
    }
    parsedAnyGregorian = true;
    if (parsed.year === dec.year && parsed.month === dec.month && parsed.day === dec.day) {
      return { status: "MATCH" };
    }
  }

  if (!parsedAnyGregorian) {
    return { status: "COULD_NOT_VERIFY", reason: sawHijriOnly ? "HIJRI_DATE_ONLY" : "BIRTH_DATE_UNREADABLE" };
  }
  return { status: "MISMATCH", reason: "BIRTH_DATE_MISMATCH" };
}

/**
 * An Egyptian national ID number (14 digits) carries the birth date: C YYMMDD ... (C = 2 -> 19xx, 3 -> 20xx). The card prints that number clearly while the printed date is often
 * partly covered by the emblem / hologram or read with day and month swapped, so a date the model could not read (or misread) is confirmed through the number when the DECLARED date
 * equals the date inside the number read from the same card. A declared date that differs from the number's date stays a MISMATCH.
 */
export function birthDateFromEgyptianNationalId(raw: string | null | undefined): { year: number; month: number; day: number } | null {
  const id = normalizeDigits(String(raw ?? "")).replace(/\D/g, "");
  if (id.length !== 14) return null;
  const century = id[0] === "2" ? 1900 : id[0] === "3" ? 2000 : null;
  if (century === null) return null;
  const year = century + Number(id.slice(1, 3)), month = Number(id.slice(3, 5)), day = Number(id.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? { year, month, day } : null;
}

export function compareBirthDatesWithId(declared: string, extractedIso?: string | null, extractedRaw?: string | null, extractedNationalId?: string | null): { status: FieldCompareStatusA; reason?: string } {
  const base = compareBirthDates(declared, extractedIso, extractedRaw);
  if (base.status === "MATCH") return base;
  const dec = parseIsoDateParts(declared), fromId = birthDateFromEgyptianNationalId(extractedNationalId);
  if (dec && fromId && dec.year === fromId.year && dec.month === fromId.month && dec.day === fromId.day) return { status: "MATCH", reason: "CONFIRMED_BY_NATIONAL_ID_NUMBER" };
  return base;
}

export function compareNationalIds(declared: string, extracted?: string | null): { status: FieldCompareStatusA; reason?: string } {
  const dec = normalizeNationalId(declared);
  if (!dec || dec.length < 4) return { status: "COULD_NOT_VERIFY", reason: "DECLARED_ID_INVALID" };
  if (!extracted || !extracted.trim()) return { status: "COULD_NOT_VERIFY", reason: "NATIONAL_ID_NOT_VISIBLE" };
  const ext = normalizeNationalId(extracted);
  if (!ext || ext.length < 4) return { status: "COULD_NOT_VERIFY", reason: "NATIONAL_ID_UNREADABLE" };
  return ext === dec ? { status: "MATCH" } : { status: "MISMATCH", reason: "NATIONAL_ID_MISMATCH" };
}

function toShapeBStatus(status: FieldCompareStatusA): FieldCompareStatusB {
  return status === "COULD_NOT_VERIFY" ? "UNREADABLE" : status;
}

export class IdentityService {
  /**
   * Privacy-preserving OCR extraction: sends ONLY the document image and optional document country/type/expectedSide
   * to Gemini Vision under SENSITIVE classification. Declared/registered PII is NEVER sent to the LLM.
   */
  private static async extractDocumentFields(
    imageBase64: string,
    mimeType: string,
    meta: { country?: string; type?: string; expectedSide?: "FRONT" | "BACK" }
  ): Promise<{ extracted: OcrExtracted; modelUsed: string }> {
    const signal = getTenantContext()?.signal;
    const responseSchema = {
      type: "object",
      properties: {
        isIdentityDocument: { type: "boolean" },
        detectedSide: { type: "string", enum: ["FRONT", "BACK", "UNKNOWN"] },
        readability: { type: "string", enum: ["CLEAR", "BLURRY", "PARTIAL", "UNREADABLE"] },
        documentKind: { type: "string", enum: [...DOCUMENT_KINDS] },
        fullNameAr: { type: "string", nullable: true },
        fullNameEn: { type: "string", nullable: true },
        birthDateGregorianIso: { type: "string", nullable: true },
        birthDateRaw: { type: "string", nullable: true },
        nationalId: { type: "string", nullable: true },
        summaryAr: { type: "string" },
        warningsAr: { type: "array", items: { type: "string" } },
      },
      required: ["isIdentityDocument", "detectedSide", "readability", "summaryAr", "warningsAr"],
    };

    const response = await GeminiGateway.generate({
      featureId: "AI-KYC-IDENTITY-OCR",
      modelTier: "MEDIUM",
      preferredModel: "gemini-2.5-flash",
      effort: "low",
      classification: "SENSITIVE",
      maxOutputTokens: 1200,
      attemptTimeoutMs: 25000,
      maxAttempts: 8,
      signal,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: imageBase64 } }],
        },
      ],
      systemInstruction: [
        "أنت مدقق بصري استشاري لوثائق الهوية الرسمية على منصة وسيط (بطاقة هوية وطنية، إقامة، جواز سفر، رخصة قيادة).",
        "افحص الصورة المرفقة فقط دون افتراض أي بيانات غير مرئية:",
        "1. حدد isIdentityDocument=false فوراً إذا كانت الصورة لقطة شاشة عشوائية أو شعاراً أو صورة شخصية عادية أو فاتورة أو كوداً برمجياً أو أي صورة ليست وثيقة هوية رسمية.",
        "2. حدد detectedSide: 'FRONT' إذا ظهر الوجه الأمامي للبطاقة (الصورة الشخصية والاسم ورقم الهوية)، أو 'BACK' إذا ظهر الوجه الخلفي (الباركود أو MRZ أو بيانات الإصدار الخلفية فقط)، أو 'UNKNOWN' إذا لم تكن وثيقة هوية.",
        "3. حدد readability: 'CLEAR' إذا كانت النصوص مقروءة بوضوح، 'BLURRY' إذا كانت مشوشة أو معتمة، 'PARTIAL' إذا كانت مقطوعة جزئياً، 'UNREADABLE' إذا تعذرت قراءتها.",
        "4. استخرج الحقول المرئية فقط كما هي مطبوعة دون تخمين: fullNameAr (الاسم الكامل بالعربية إن وُجد)، fullNameEn (الاسم بالإنجليزية إن وُجد)، birthDateGregorianIso (تاريخ الميلاد الميلادي بصيغة YYYY-MM-DD إن وُجد كـ ميلادي)، birthDateRaw (تاريخ الميلاد كما كُتب نصياً)، nationalId (رقم الهوية/الإقامة/الجواز بالأرقام اللاتينية 0-9).",
        "5. حدد documentKind بنوع الوثيقة الفعلي كما تراه في الصورة: NATIONAL_ID (بطاقة هوية وطنية / بطاقة تحقيق شخصية)، PASSPORT (جواز سفر بصفحة البيانات و MRZ)، RESIDENCE_PERMIT (إقامة)، DRIVING_LICENCE (رخصة قيادة)، OTHER (وثيقة أخرى رسمية)، أو UNKNOWN إذا لم تستطع التحديد بثقة. لا تتأثر بنوع الوثيقة المتوقع في المدخلات؛ صف ما تراه فقط.",
        "6. اكتب summaryAr باللغة العربية الفصحى الواضحة وwarningsAr لأي ملاحظات جودة أو عدم تطابق (دون ذكر أي أرقام سرية كاملة في summaryAr).",
      ].join("\n"),
      prompt: JSON.stringify({
        expectedDocumentCountry: meta.country ?? null,
        expectedDocumentType: meta.type ?? null,
        expectedSide: meta.expectedSide ?? "FRONT",
      }),
      responseJsonSchema: responseSchema,
    });

    const extracted = parseModelOutput(response.text, ocrSchema);
    return { extracted, modelUsed: response.modelUsed };
  }

  public static isShapeA(input: IdentityCompareInput): input is IdentityCompareShapeA {
    return "registered" in input && typeof input.image === "string";
  }

  public static async compareFields(
    input: IdentityCompareInput,
    fallbackRequestId: string
  ): Promise<{ requestId: string; data: IdentityCompareShapeAOutput | IdentityCompareShapeBOutput }> {
    const shapeA = this.isShapeA(input);
    const rawImage = shapeA ? input.image : input.image.data;
    const mimeType = shapeA ? input.imageMimeType : input.image.mimeType;
    const declaredName = shapeA ? input.registered.fullName : input.declared.name;
    const declaredBirthDate = shapeA ? input.registered.birthDate : input.declared.birthDate;
    const declaredNationalId = shapeA ? input.registered.nationalId : input.declared.nationalId;
    const requestId = shapeA ? input.requestId : fallbackRequestId;

    const { base64 } = validateAndDecodeBase64(rawImage);
    const { extracted, modelUsed } = await this.extractDocumentFields(base64, mimeType, {
      country: input.document?.country,
      type: input.document?.type,
      expectedSide: "FRONT",
    });

    let nameRes: { status: FieldCompareStatusA; reason?: string };
    let dobRes: { status: FieldCompareStatusA; reason?: string };
    let idRes: { status: FieldCompareStatusA; reason?: string };

    if (!extracted.isIdentityDocument) {
      nameRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_NOT_ID_DOCUMENT" };
      dobRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_NOT_ID_DOCUMENT" };
      idRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_NOT_ID_DOCUMENT" };
    } else if (extracted.readability === "UNREADABLE") {
      nameRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_UNREADABLE" };
      dobRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_UNREADABLE" };
      idRes = { status: "COULD_NOT_VERIFY", reason: "IMAGE_UNREADABLE" };
    } else {
      nameRes = compareNames(declaredName, extracted.fullNameAr, extracted.fullNameEn);
      dobRes = compareBirthDatesWithId(declaredBirthDate, extracted.birthDateGregorianIso, extracted.birthDateRaw, extracted.nationalId);
      idRes = compareNationalIds(declaredNationalId, extracted.nationalId);
    }

    if (shapeA) {
      const out: IdentityCompareShapeAOutput = {
        requestId,
        fields: {
          fullName: nameRes.reason ? { status: nameRes.status, reason: nameRes.reason } : { status: nameRes.status },
          birthDate: dobRes.reason ? { status: dobRes.status, reason: dobRes.reason } : { status: dobRes.status },
          nationalId: idRes.reason ? { status: idRes.status, reason: idRes.reason } : { status: idRes.status },
        },
        model: {
          name: modelUsed,
          version: "2026-11",
        },
        readAt: new Date().toISOString(),
      };
      return { requestId, data: out };
    }

    const outB: IdentityCompareShapeBOutput = {
      fields: {
        name: toShapeBStatus(nameRes.status),
        birthDate: toShapeBStatus(dobRes.status),
        nationalId: toShapeBStatus(idRes.status),
      },
      faceMatch: "NOT_CHECKED",
      liveness: "NOT_CHECKED",
      documentAuthenticity: "NOT_CHECKED",
    };
    return { requestId, data: outB };
  }

  public static async inspectDocument(input: IdentityInspectInput): Promise<IdentityInspectOutput> {
    const { base64 } = validateAndDecodeBase64(input.image);
    const { extracted } = await this.extractDocumentFields(base64, input.imageMimeType, {
      country: input.document?.country,
      type: input.document?.type,
      expectedSide: input.side,
    });

    const warningsAr = [...(extracted.warningsAr ?? [])].filter(Boolean);

    if (!extracted.isIdentityDocument) {
      return {
        status: "NOT_ID_DOCUMENT",
        isIdentityDocument: false,
        detectedSide: "UNKNOWN",
        sideMatchesExpected: false,
        readability: extracted.readability,
        summaryAr: extracted.summaryAr?.trim() || "الصورة المرفوعة لا تبدو وثيقة هوية رسمية. يرجى رفع صورة واضحة لوثيقة الهوية الصحيحة.",
        warningsAr: warningsAr.length ? warningsAr : ["لم يتم التعرف على وثيقة هوية رسمية في الملف المرفوع."],
        advisoryOnly: true,
      };
    }

    if (extracted.readability === "UNREADABLE") {
      return {
        status: "UNREADABLE",
        isIdentityDocument: true,
        detectedSide: extracted.detectedSide,
        sideMatchesExpected: extracted.detectedSide === "UNKNOWN" || extracted.detectedSide === input.side,
        readability: "UNREADABLE",
        summaryAr: extracted.summaryAr?.trim() || "بيانات الوثيقة غير واضحة أو مشوشة، يرجى إعادة التصوير بإضاءة جيدة ودون انعكاس.",
        warningsAr: warningsAr.length ? warningsAr : ["النصوص المطبوعة على الوثيقة غير واضحة للقراءة الآلية."],
        advisoryOnly: true,
      };
    }

    const sideMatchesExpected = extracted.detectedSide === "UNKNOWN" || extracted.detectedSide === input.side;
    if (!sideMatchesExpected) {
      warningsAr.unshift(
        input.side === "FRONT"
          ? "يبدو أن الصورة المرفوعة تخص الوجه الخلفي للوثيقة بينما الحقل مخصص للوجه الأمامي."
          : "يبدو أن الصورة المرفوعة تخص الوجه الأمامي للوثيقة بينما الحقل مخصص للوجه الخلفي."
      );
    }

    const expectedKind = expectedKindOf(input.document?.type);
    const kindMismatch = documentKindMismatch(expectedKind, extracted.documentKind);
    if (kindMismatch) warningsAr.unshift(`الوثيقة المرفوعة تبدو ${KIND_LABEL_AR[extracted.documentKind as DocumentKind]} بينما النوع المختار هو ${KIND_LABEL_AR[expectedKind as DocumentKind]}. اختر النوع الصحيح أو ارفع الوثيقة المطلوبة.`);

    const fields: IdentityInspectOutput["fields"] = {};
    if (input.declared) {
      if (input.declared.fullName?.trim() && (input.side === "FRONT" || extracted.fullNameAr || extracted.fullNameEn)) {
        fields.fullName = compareNames(input.declared.fullName, extracted.fullNameAr, extracted.fullNameEn).status;
        if (fields.fullName === "MISMATCH") warningsAr.push("الاسم الظاهر في الوثيقة لا يطابق الاسم المدخل في الحساب.");
      }
      if (input.declared.birthDate?.trim() && (input.side === "FRONT" || extracted.birthDateGregorianIso || extracted.birthDateRaw)) {
        fields.birthDate = compareBirthDatesWithId(input.declared.birthDate, extracted.birthDateGregorianIso, extracted.birthDateRaw, extracted.nationalId).status;
        if (fields.birthDate === "MISMATCH") warningsAr.push("تاريخ الميلاد الظاهر في الوثيقة لا يطابق التاريخ المدخل.");
      }
      if (input.declared.nationalId?.trim() && (input.side === "FRONT" || extracted.nationalId)) {
        fields.nationalId = compareNationalIds(input.declared.nationalId, extracted.nationalId).status;
        if (fields.nationalId === "MISMATCH") warningsAr.push("رقم الهوية الظاهر في الوثيقة لا يطابق الرقم المدخل.");
      }
    }

    const hasMismatch = Object.values(fields).includes("MISMATCH");
    const needsAttention = !sideMatchesExpected || kindMismatch || extracted.readability === "BLURRY" || extracted.readability === "PARTIAL" || hasMismatch;

    const defaultSummary = needsAttention
      ? "تم فحص الوثيقة مبدئياً وتوجد ملاحظات تحتاج انتباهك قبل إرسالها للمراجعة."
      : input.side === "FRONT"
      ? "وثيقة هوية واضحة (الوجه الأمامي) — جاهزة للمراجعة البشرية."
      : "وثيقة هوية واضحة (الوجه الخلفي) — جاهزة للمراجعة البشرية.";

    return {
      status: needsAttention ? "NEEDS_ATTENTION" : "CLEAR_VALID",
      isIdentityDocument: true,
      detectedSide: extracted.detectedSide,
      sideMatchesExpected,
      readability: extracted.readability,
      summaryAr: extracted.summaryAr?.trim() || defaultSummary,
      warningsAr,
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(extracted.documentKind ? { documentKind: extracted.documentKind } : {}),
      ...(expectedKind && extracted.documentKind && extracted.documentKind !== "UNKNOWN" ? { documentTypeMatches: !kindMismatch } : {}),
      advisoryOnly: true,
    };
  }
}
