import type { AgentRole, ModelCapability, ModelEffort, ModelTier } from "./types.js";

export const MODEL_POLICY_VERSION = "waseet-multiagents-free-2026-10-12-v1";
export const MODEL_ROUTES: Readonly<Record<ModelEffort, readonly string[]>> = Object.freeze({
  low: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash-lite"],
  medium: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash"],
  high: ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
  xhigh: ["gemini-2.5-flash", "gemini-3.8-flash"], max: ["gemini-2.5-flash", "gemini-3.8-flash"],
});
export const TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"] as const;
export const MODEL_CAPABILITIES: Readonly<Record<string, readonly ModelCapability[]>> = Object.freeze({
  "gemini-2.5-flash-lite": ["TEXT", "STREAM"], "gemini-2.5-flash": ["TEXT", "STREAM"],
  "gemini-3.5-flash-lite": ["TEXT", "STREAM"], "gemini-3.8-flash": ["TEXT", "STREAM"],
  "gemini-embedding-2": ["EMBEDDING"], "gemini-embedding-2-preview": ["EMBEDDING"],
  "gemini-3.5-transcribe": ["STT"], "gemini-3.8-live": ["LIVE"],
  "gemini-3.8-flash-lite-tts": ["TTS"], "gemini-3.8-flash-tts": ["TTS"],
});
export function effortForTier(tier: ModelTier): ModelEffort {
  return tier === "HEAVY" ? "high" : tier === "MEDIUM" ? "medium" : "low";
}
export function roleEffort(role: AgentRole): ModelEffort {
  return role === "builder" || role === "reviewer" ? "high" : role === "responder" ? "low" : "medium";
}
export function reasoningConfig(model: string, effort: ModelEffort, requested?: string): Record<string, unknown> {
  const actual = effort === "xhigh" || effort === "max" ? "high" : effort;
  if (model.startsWith("gemini-2.5-")) return { thinkingBudget: { low: 0, medium: 1024, high: 4096 }[actual], includeThoughts: false };
  if (model === "gemini-3.5-flash-lite" || model === "gemini-3.8-flash") {
    const level = requested ?? actual;
    if (level === "minimal" && model !== "gemini-3.5-flash-lite") throw new Error("AI_CAPABILITY_MISMATCH: minimal thinking is unsupported by this model");
    return { thinkingLevel: level.toUpperCase(), includeThoughts: false };
  }
  throw new Error("AI_MODEL_UNAPPROVED: no model-specific reasoning adapter");
}
export function modelRoute(tier: ModelTier, effort?: ModelEffort, preferred?: string, pin?: string): string[] {
  const route = [...MODEL_ROUTES[effort ?? effortForTier(tier)]];
  if (pin) {
    if (!MODEL_CAPABILITIES[pin]?.includes("TEXT")) throw new Error("AI_MODEL_UNAPPROVED");
    return [pin];
  }
  if (preferred && preferred !== "AUTO") {
    if (!MODEL_CAPABILITIES[preferred]?.includes("TEXT")) throw new Error("AI_MODEL_UNAPPROVED");
    return [preferred, ...route.filter(id => id !== preferred)];
  }
  return route;
}
