import { z } from "zod";

export const SupportedIdMimeEnum = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Shape A (PR #207): registered + top-level image string + requestId */
export const IdentityCompareShapeASchema = z.object({
  requestId: z.string().trim().min(4).max(160),
  image: z.string().trim().min(8).max(10_500_000),
  imageMimeType: SupportedIdMimeEnum,
  document: z.object({
    country: z.string().trim().min(2).max(16).optional(),
    type: z.string().trim().min(1).max(60).optional(),
  }).optional(),
  registered: z.object({
    fullName: z.string().trim().min(1).max(200),
    birthDate: z.string().trim().min(4).max(40),
    nationalId: z.string().trim().min(3).max(60),
  }),
}).strict();

/** Shape B (PR #210): image.{mimeType,data} + declared.{name,birthDate,nationalId} */
export const IdentityCompareShapeBSchema = z.object({
  image: z.object({
    mimeType: SupportedIdMimeEnum,
    data: z.string().trim().min(8).max(10_500_000),
  }).strict(),
  declared: z.object({
    name: z.string().trim().min(1).max(200),
    birthDate: z.string().trim().min(4).max(40),
    nationalId: z.string().trim().min(3).max(60),
  }).strict(),
  document: z.object({
    country: z.string().trim().min(2).max(16).optional(),
    type: z.string().trim().min(1).max(60).optional(),
  }).optional(),
  actor: z.object({
    userId: z.string(),
    role: z.string(),
  }).optional(),
}).strict();

export const IdentityCompareInputSchema = z.union([
  IdentityCompareShapeASchema,
  IdentityCompareShapeBSchema,
]);

export type IdentityCompareInput = z.infer<typeof IdentityCompareInputSchema>;
export type IdentityCompareShapeA = z.infer<typeof IdentityCompareShapeASchema>;
export type IdentityCompareShapeB = z.infer<typeof IdentityCompareShapeBSchema>;

export type FieldCompareStatusA = "MATCH" | "MISMATCH" | "COULD_NOT_VERIFY";
export type FieldCompareStatusB = "MATCH" | "MISMATCH" | "UNREADABLE";

export interface IdentityCompareShapeAOutput {
  requestId: string;
  fields: {
    fullName: { status: FieldCompareStatusA; reason?: string };
    birthDate: { status: FieldCompareStatusA; reason?: string };
    nationalId: { status: FieldCompareStatusA; reason?: string };
  };
  model: {
    name: string;
    version: string;
  };
  readAt: string;
}

export interface IdentityCompareShapeBOutput {
  fields: {
    name: FieldCompareStatusB;
    birthDate: FieldCompareStatusB;
    nationalId: FieldCompareStatusB;
  };
  faceMatch: "NOT_CHECKED";
  liveness: "NOT_CHECKED";
  documentAuthenticity: "NOT_CHECKED";
}

export const IdentityInspectInputSchema = z.object({
  side: z.enum(["FRONT", "BACK"]).default("FRONT"),
  image: z.string().trim().min(8).max(10_500_000),
  imageMimeType: SupportedIdMimeEnum,
  document: z.object({
    country: z.string().trim().min(2).max(16).optional(),
    type: z.string().trim().min(1).max(60).optional(),
  }).optional(),
  declared: z.object({
    fullName: z.string().trim().max(200).optional(),
    birthDate: z.string().trim().max(40).optional(),
    nationalId: z.string().trim().max(60).optional(),
  }).optional(),
  actor: z.object({
    userId: z.string(),
    role: z.string(),
  }).optional(),
});

export type IdentityInspectInput = z.infer<typeof IdentityInspectInputSchema>;

export interface IdentityInspectOutput {
  status: "CLEAR_VALID" | "NEEDS_ATTENTION" | "NOT_ID_DOCUMENT" | "UNREADABLE";
  isIdentityDocument: boolean;
  detectedSide: "FRONT" | "BACK" | "UNKNOWN";
  sideMatchesExpected: boolean;
  readability: "CLEAR" | "BLURRY" | "PARTIAL" | "UNREADABLE";
  summaryAr: string;
  warningsAr: string[];
  fields?: {
    fullName?: FieldCompareStatusA;
    birthDate?: FieldCompareStatusA;
    nationalId?: FieldCompareStatusA;
  };
  advisoryOnly: true;
}
