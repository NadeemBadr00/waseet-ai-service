import { z } from "zod";

export const TtsModelEnum = z.enum([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "AUTO",
]);
export type TtsModel = z.infer<typeof TtsModelEnum>;

export const TtsVoiceEnum = z.enum([
  "Puck",
  "Kore",
  "Fenrir",
  "Aoede",
  "Zephyr",
  "Sulafat",
  "Charon",
  "Leda",
  "Orus",
  "Callirrhoe",
]);
export type TtsVoice = z.infer<typeof TtsVoiceEnum>;

export const TtsDialectEnum = z.enum([
  "egyptian",
  "gulf",
  "saudi",
  "msa",
  "english",
  "custom",
]);
export type TtsDialect = z.infer<typeof TtsDialectEnum>;

export const TtsSynthesizeInputSchema = z.object({
  text: z.string().min(1).max(5000),
  model: TtsModelEnum.default("gemini-3.8-flash-lite-tts"),
  voice: TtsVoiceEnum.default("Puck"),
  dialect: TtsDialectEnum.default("egyptian"),
  style: z.string().max(1000).optional(),
  speakingRate: z.enum(["slow", "normal", "rapid"]).default("normal"),
  mimeType: z.enum(["audio/wav", "audio/l16", "audio/mulaw", "audio/alaw"]).default("audio/wav"),
}).strict();

export type TtsSynthesizeInput = z.infer<typeof TtsSynthesizeInputSchema>;

export interface TtsAudioMetadata {
  voice: string;
  dialect: string;
  style: string;
  modelUsed: string;
  projectAliasUsed: string;
  mimeType: string;
  sizeBytes: number;
  durationEstimateSec: number;
}

export interface TtsSynthesizeOutput {
  audio: {
    mimeType: string;
    base64Audio: string;
    sizeBytes: number;
    durationEstimateSec: number;
  };
  metadata: TtsAudioMetadata;
}
