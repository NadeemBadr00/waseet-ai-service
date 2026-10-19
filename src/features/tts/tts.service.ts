import { ProjectPoolManager } from "../../router/project-pool.manager.js";
import { TTS_MODELS } from "../../router/model-registry.js";
import { AiProviderError, SmartRouter } from "../../router/smart-router.js";
import { deadlineSignal, modelOperation, providerFetch, readJsonBounded, responseUsage, sseEvents, type OperationOptions } from "../../router/transport.js";
import type { DataClassification } from "../../router/types.js";
import { TtsSynthesizeInputSchema, TtsVoiceEnum, type TtsSynthesizeInput, type TtsSynthesizeOutput } from "./tts.types.js";

export interface TtsSynthesisOptions extends OperationOptions { classification?: DataClassification; }
const dialectStyles: Record<string, string> = { egyptian: "Egyptian Arabic, warm and natural", gulf: "Gulf Arabic, calm and welcoming", saudi: "Saudi Arabic, clear and welcoming", msa: "Modern Standard Arabic, clear and polished", english: "Natural clear English", custom: "Natural conversational tone" };
function audioContent(data: Record<string, unknown>): Array<Record<string, unknown>> { return ((data.steps ?? []) as Array<{ content?: Array<Record<string, unknown>> }>).flatMap(s => s.content ?? []).filter(c => c.type === "audio"); }
export class TtsService {
  public static resolveStyle(input: TtsSynthesizeInput): string { return `${dialectStyles[input.dialect]}${input.speakingRate === "slow" ? ", speak slowly" : input.speakingRate === "rapid" ? ", speak briskly" : ""}${input.style ? `, ${input.style}` : ""}`; }
  public static getCandidateModels(preferredModel: string): string[] { if (preferredModel === "AUTO") return [...TTS_MODELS]; if (!(TTS_MODELS as readonly string[]).includes(preferredModel)) throw new AiProviderError("AI_TTS_MODEL_UNAPPROVED", 400); return [preferredModel, ...TTS_MODELS.filter(m => m !== preferredModel)]; }
  private static payload(model: string, input: TtsSynthesizeInput, stream = false): Record<string, unknown> { return { model, store: false, stream, input: [{ type: "user_input", content: [{ type: "text", text: input.text, annotations: [{ type: "speech_metadata", style: this.resolveStyle(input) }] }] }], response_format: { type: "audio", mime_type: stream ? "audio/l16" : input.mimeType }, generation_config: { speech_config: [{ voice: input.voice }] } }; }
  public static async synthesize(value: TtsSynthesizeInput, options: TtsSynthesisOptions = {}): Promise<TtsSynthesizeOutput> {
    const input = TtsSynthesizeInputSchema.parse(value), style = this.resolveStyle(input);
    const out = await modelOperation(this.getCandidateModels(input.model), options.classification ?? "PERSONAL", async (project, model, signal, lease) => {
      const response = await providerFetch(project, "interactions", this.payload(model, input), signal), data = await readJsonBounded(response, signal);
      if (data.error || data.status !== "completed") throw new AiProviderError("AI_TTS_INCOMPLETE");
      const parts = audioContent(data); if (!parts.length || parts.some(p => typeof p.data !== "string")) throw new AiProviderError("AI_TTS_EMPTY_AUDIO");
      const mimeType = typeof parts[0]!.mime_type === "string" ? parts[0]!.mime_type as string : input.mimeType;
      if (parts.some(p => p.mime_type && p.mime_type !== mimeType)) throw new AiProviderError("AI_TTS_FORMAT_MISMATCH");
      const bytes = Buffer.concat(parts.map(p => decodeBase64(p.data as string, 12000000)));
      if (!bytes.length || bytes.length > 12000000 || (mimeType === "audio/wav" && (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE"))) throw new AiProviderError("AI_TTS_INVALID_AUDIO");
      const usage = responseUsage(data); if (usage) ProjectPoolManager.accountTokens(lease, usage.totalTokens);
      const durationEstimateSec = Math.round(((mimeType === "audio/wav" ? Math.max(0, bytes.length - 44) : bytes.length) / (24000 * (mimeType === "audio/alaw" || mimeType === "audio/mulaw" ? 1 : 2))) * 10) / 10;
      return { audio: { mimeType, base64Audio: bytes.toString("base64"), sizeBytes: bytes.length, durationEstimateSec }, metadata: { voice: input.voice, dialect: input.dialect, style, modelUsed: model, projectAliasUsed: project.alias, mimeType, sizeBytes: bytes.length, durationEstimateSec } };
    }, { ...options, estimatedTokens: Buffer.byteLength(input.text) + 4096 }); return out.result;
  }
  public static async* streamSynthesis(value: TtsSynthesizeInput, options: TtsSynthesisOptions = {}): AsyncGenerator<{ chunkBase64: string; projectAliasUsed: string; modelUsed: string; mimeType: string; sampleRate: number }> {
    const input = TtsSynthesizeInputSchema.parse(value), route = this.getCandidateModels(input.model), classification = options.classification ?? "PERSONAL", deadline = deadlineSignal(options), excluded = new Set<string>(); let emitted = false;
    try {
      const attempts = options.maxAttempts ?? 3; if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8) throw new AiProviderError("AI_INVALID_ATTEMPTS", 400);
      for (let i = 0; i < attempts; i++) {
        deadline.signal.throwIfAborted(); const choice = SmartRouter.selectForModels(route, classification, excluded); if (!choice) throw new AiProviderError(SmartRouter.isFreeEligible(classification) ? "AI_ROUTE_UNAVAILABLE" : "AI_DATA_POLICY_BLOCKED");
        const lease = ProjectPoolManager.reserve(choice.project, choice.model, Buffer.byteLength(input.text) + 4096, (options.deadlineMs ?? 60000) + 5000); if (!lease) { excluded.add(`${choice.project.alias}:${choice.model}`); continue; }
        const attempt = options.attemptTimeoutMs ? AbortSignal.timeout(options.attemptTimeoutMs) : undefined, signal = attempt ? AbortSignal.any([deadline.signal, attempt]) : deadline.signal; let complete = false;
        try {
          const response = await providerFetch(choice.project, "interactions?alt=sse", this.payload(choice.model, input, true), signal);
          for await (const event of sseEvents(response, signal)) {
            if (event.error || event.event_type === "error" || event.type === "error") throw new AiProviderError("AI_TTS_STREAM_FAILED");
            const delta = event.delta as { type?: string; data?: string; mime_type?: string } | undefined;
            if (delta?.data && (delta.type === "audio" || event.event_type === "content.delta" || event.type === "content.delta")) {
              const bytes = decodeBase64(delta.data, 4000000); if (!bytes.length || bytes.length % 2 !== 0 || (delta.mime_type && !delta.mime_type.startsWith("audio/l16"))) throw new AiProviderError("AI_TTS_FORMAT_MISMATCH");
              emitted = true; yield { chunkBase64: delta.data, projectAliasUsed: choice.project.alias, modelUsed: choice.model, mimeType: "audio/l16", sampleRate: 24000 };
            }
            const interaction = event.interaction as Record<string, unknown> | undefined;
            if (event.event_type === "interaction.complete" || event.type === "interaction.complete" || event.event_type === "interaction.completed" || interaction?.status === "completed") complete = true;
            const usage = responseUsage(interaction ?? event); if (usage) ProjectPoolManager.accountTokens(lease, usage.totalTokens);
          }
          if (!emitted || !complete) throw new AiProviderError("AI_TTS_PARTIAL_STREAM"); return;
        } catch (error) { deadline.signal.throwIfAborted(); if (emitted) throw new AiProviderError("AI_TTS_PARTIAL_STREAM"); if (attempt?.aborted) excluded.add(`${choice.project.alias}:${choice.model}`); else if (!SmartRouter.handleFailure(choice.project, choice.model, error, excluded)) throw error; }
        finally { ProjectPoolManager.release(lease); }
      }
      throw new AiProviderError("AI_ATTEMPTS_EXHAUSTED");
    } finally { deadline.dispose(); }
  }
  public static getVoicesCatalog() { return { models: TTS_MODELS.map(id => ({ id, name: id, badge: "Configured capability required" })), voices: TtsVoiceEnum.options.map(id => ({ id, name: id, label: id })), dialects: Object.keys(dialectStyles).map(id => ({ id, name: id })), streaming: { mimeType: "audio/l16", sampleRate: 24000, channels: 1, bitsPerSample: 16 } }; }
}
export function decodeBase64(value: string, maxBytes: number): Buffer { if (!value || value.length > Math.ceil(maxBytes / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new AiProviderError("AI_INVALID_BASE64", 400); const bytes = Buffer.from(value, "base64"); if (bytes.length > maxBytes) throw new AiProviderError("AI_AUDIO_TOO_LARGE", 413); return bytes; }
