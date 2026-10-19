// WaseetAI Client API Handlers & SSE Streams
const CLOUD_RUN_API = "https://waseet-ai-api-1041761245251.us-central1.run.app";
const API_BASE = CLOUD_RUN_API; // Connected 100% to Cloud Run directly (Zero Local Backend)
const AUTH_TOKEN = "Bearer waseet_secret_dev_key_2026";

const MODEL_MAPPING = {
    "AUTO": "AUTO",
    "waseet-turbo-3.1": "gemini-3.1-flash-lite",
    "waseet-turbo-3.5": "gemini-3.5-flash-lite",
    "waseet-neural-3.5": "gemini-3.5-flash",
    "waseet-neural-3.6": "gemini-3.6-flash",
    "waseet-neural-3.7": "gemini-3.7-flash",
    "waseet-ultra-3.8": "gemini-3.8-flash",
    "waseet-global-2.5": "gemini-2.5-flash",
    "waseet-voice-lite": "gemini-3.8-flash-lite-tts",
    "waseet-voice-turbo": "gemini-3.1-flash-tts-preview",
    "waseet-voice-pro": "gemini-3.8-flash-tts"
};

function resolveBackendModel(model) {
    if (!model) return "AUTO";
    return MODEL_MAPPING[model] || model;
}

export const WaseetApiClient = {
    async call(endpoint, method = "POST", body = null) {
        const start = Date.now();
        const options = {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: AUTH_TOKEN,
            },
        };
        if (body) {
            const mappedBody = { ...body };
            if (mappedBody.model) mappedBody.model = resolveBackendModel(mappedBody.model);
            if (mappedBody.preferredModel) mappedBody.preferredModel = resolveBackendModel(mappedBody.preferredModel);
            options.body = JSON.stringify(mappedBody);
        }

        const res = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await res.json().catch(() => ({}));
        return { data, status: res.status, ok: res.ok, duration: Date.now() - start };
    },

    async streamDescription(title, category, onChunk, onDone, onError, modelTier = "MEDIUM", preferredModel = "") {
        try {
            const actualModel = resolveBackendModel(preferredModel);
            const res = await fetch(`${API_BASE}/v1/ai/project-description/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: AUTH_TOKEN },
                body: JSON.stringify({ title, category, language: "ar", modelTier, preferredModel: actualModel }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                onError(new Error(errData.error?.message || `HTTP ${res.status}`));
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                for (const line of text.split("\n")) {
                    if (line.startsWith("data: ")) {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.chunk) onChunk(parsed.chunk, parsed.model, parsed.project);
                        } catch {}
                    }
                }
            }
            onDone();
        } catch (err) {
            onError(err);
        }
    },

    async streamHelp(question, onChunk, onCitations, onFallback, onDone) {
        try {
            const res = await fetch(`${API_BASE}/v1/ai/help/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: AUTH_TOKEN },
                body: JSON.stringify({ question }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                for (const line of text.split("\n")) {
                    if (line.startsWith("data: ")) {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.chunk) onChunk(parsed.chunk);
                            if (parsed.citations) onCitations(parsed.citations);
                            if (parsed.human_support_fallback) onFallback();
                        } catch {}
                    }
                }
            }
            onDone();
        } catch (err) {
            onChunk(`\n[خطأ: ${err.message}]`);
        }
    },

    async checkHealth() {
        const res = await fetch(`${API_BASE}/health`);
        return await res.json();
    },

    async synthesizeSpeech(text, { model = "AUTO", voice = "Puck", dialect = "egyptian", speakingRate = "normal" } = {}) {
        return await this.call("/v1/ai/tts/synthesize", "POST", { text, model, voice, dialect, speakingRate });
    },

    async getTtsCatalog() {
        return await this.call("/v1/ai/tts/catalog", "GET");
    }
};
