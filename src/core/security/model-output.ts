import { z, type ZodType } from "zod";
import { GeminiGateway } from "../../router/gemini-gateway.js";
import type { InferenceRequest } from "../../router/types.js";
import { getTenantContext } from "../auth/tenant-context.js";

export function featureError(code: string, message: string, statusCode = 503): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
export function parseModelOutput<T>(text: string, schema: ZodType<T>): T {
  try {
    const raw: unknown = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
    return schema.parse(raw);
  } catch {
    throw featureError("AI_INVALID_RESPONSE", "تعذر التحقق من نتيجة التحليل. يرجى إعادة المحاولة.");
  }
}
function simplifySchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplifySchemaForGemini);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "$schema" || k === "minLength" || k === "maxLength" || k === "minItems" || k === "maxItems" || k === "minimum" || k === "maximum" || k === "exclusiveMinimum" || k === "exclusiveMaximum") continue;
    out[k] = simplifySchemaForGemini(v);
  }
  return out;
}
export async function generateValidated<T>(request: InferenceRequest, schema: ZodType<T>): Promise<T> {
  const response = await GeminiGateway.generate({ maxOutputTokens: 4096, preferredModel: "gemini-2.5-flash", attemptTimeoutMs: 25000, maxAttempts: 4, ...request, signal: request.signal ?? getTenantContext()?.signal, responseJsonSchema: simplifySchemaForGemini(z.toJSONSchema(schema)) as Record<string, unknown> });
  return parseModelOutput(response.text, schema);
}
export const scoreSchema = z.number().finite().min(0).max(100);
export const textSchema = z.string().trim().min(1).max(6000);
export const textListSchema = z.array(textSchema).max(30);
