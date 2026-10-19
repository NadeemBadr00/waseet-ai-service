export type DataClassification =
  | "PUBLIC_APPROVED"
  | "SYNTHETIC"
  | "INTERNAL"
  | "PERSONAL"
  | "SENSITIVE";

export type ModelTier = "HEAVY" | "MEDIUM" | "NORMAL" | "LIGHT";

export type ModelCapability = "TEXT" | "STREAM" | "EMBEDDING" | "TTS" | "STT" | "LIVE";
export type ModelEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type AgentRole = "responder" | "planner" | "researcher" | "analyst" | "builder" | "reviewer";

export interface ProjectManifest {
  alias: string;
  projectId: string;
  apiKey: string;
  tier: "FREE" | "PAID";
  enabled: boolean;
  supportedModels: string[];
  maxRpm: number;
  maxTpm: number;
  maxRpd?: number;
  freeConfirmed?: boolean;
}

export interface ModelResolution {
  requestedTier: ModelTier;
  targetModel: string;
  fallbackModels: string[];
}

export interface ProjectCooldownStatus {
  isCooledDown: boolean;
  cooldownUntil: number;
  consecutive429s: number;
}

export interface RouterSelectionResult {
  project: ProjectManifest;
  model: string;
  tier: ModelTier;
  classification: DataClassification;
}

export interface InferenceRequest {
  featureId: string;
  modelTier: ModelTier;
  classification: DataClassification;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseJsonSchema?: Record<string, unknown>;
  preferredModel?: string;
  /** Trusted server-owned latency profile; omitted options preserve the normal gateway. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  deadlineMs?: number;
  effort?: ModelEffort;
  role?: AgentRole;
  modelPin?: string;
  signal?: AbortSignal;
  contents?: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }>;
  /** Coordinator-owned request fence, never accepted from JSON clients. */
  onRequest?: () => void;
}

export interface InferenceResponse {
  text: string;
  modelUsed: string;
  projectAliasUsed: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  usageMeasured?: boolean;
  status?: "completed" | "partial";
  /** Provider evidence only; absent when Google did not return grounding metadata. */
  groundingMetadata?: GroundingMetadata;
}

export interface GroundingMetadata {
  webSearchQueries: string[];
  groundingChunks: Array<{ web: { uri: string; title: string } }>;
  groundingSupports: Array<{
    /** UTF-8 byte offsets in the public, concatenated response text, excluding thought parts. */
    segment: { startIndex: number; endIndex: number; text: string };
    groundingChunkIndices: number[];
  }>;
  /** Provider attribution content. Treat as untrusted HTML; never insert into the application DOM. */
  searchEntryPoint?: { renderedContent: string };
}
