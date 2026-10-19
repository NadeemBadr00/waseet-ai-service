import { GeminiGateway } from "../../router/gemini-gateway.js";
import type { AvatarChatInput, AvatarChatOutput } from "./avatar.types.js";
import { TtsService } from "../tts/tts.service.js";
export class AvatarSpeechService {
  public static async chatWithAvatar(input: AvatarChatInput, signal?: AbortSignal): Promise<AvatarChatOutput> {
    const response = await GeminiGateway.generate({ featureId: "AI2-04-AVATAR-ASSISTANT", modelTier: "LIGHT", role: "responder", effort: "low", classification: "PERSONAL", systemInstruction: `أنت مساعد وسيط. أجب بشكل ودود ومباشر باللغة ${input.locale}. لا تدّعي تنفيذ حسابات أو إجراءات أو الوصول لبيانات لم تُقدّم لك.`, prompt: input.message, maxOutputTokens: 1024, signal });
    const text = response.text.trim(); if (!text) throw new Error("AVATAR_EMPTY_RESPONSE"); if (!input.includeBase64) return { text, audio: { status: "omitted" } };
    try { const tts = await TtsService.synthesize({ text: text.slice(0, 5000), model: "gemini-3.8-flash-lite-tts", voice: "Puck", dialect: input.locale.startsWith("en") ? "english" : "egyptian", speakingRate: "normal", mimeType: "audio/wav" }, { classification: "PERSONAL", signal }); return { text, audio: { status: "available", mimeType: tts.audio.mimeType, base64Audio: tts.audio.base64Audio } }; }
    catch { signal?.throwIfAborted(); return { text, audio: { status: "unavailable" } }; }
  }
}
