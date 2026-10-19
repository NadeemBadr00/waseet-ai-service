import { z } from "zod";

export const HelpChatInputSchema = z.object({
  question: z.string().min(1).max(6000),
  skin: z.enum(["scout", "classic"]).default("scout"),
  mode: z.enum(["policy", "general"]).optional(),
  webSearch: z.boolean().optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(6000),
  })).max(20).default([]),
  conversationId: z.string().min(1).max(200).optional(),
  dialect: z.enum(["egyptian", "gulf", "saudi", "msa", "english"]).default("egyptian"),
  language: z.string().max(30).default("ar"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  profile: z.enum(["auto", "fast", "balanced", "deep"]).optional(),
  model: z.string().max(120).optional(),
  pageContext: z.object({ path: z.string().max(500), role: z.string().max(30), project: z.unknown().optional() }).optional(),
});

export type HelpChatInput = Omit<z.infer<typeof HelpChatInputSchema>, "dialect" | "language" | "skin"> & { dialect?: z.infer<typeof HelpChatInputSchema>["dialect"]; language?: string; skin?: "scout" | "classic" };

export interface HelpSourceCitation {
  documentId: string;
  title: string;
  version?: string;
  sourceUrl?: string;
  excerpt?: string;
  section?: string;
}

export interface HelpChatOutput {
  answer: string;
  citations: HelpSourceCitation[];
  humanSupportFallback: boolean;
}
