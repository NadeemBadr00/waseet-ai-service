import { z } from "zod";

export const AvatarChatInputSchema = z.object({
  message: z.string().min(1).max(8000),
  locale: z.string().max(30).default("ar"),
  includeBase64: z.boolean().default(true),
});

export type AvatarChatInput = z.infer<typeof AvatarChatInputSchema>;

export interface AvatarChatOutput {
  text: string;
  audio: {
    status: "available" | "unavailable" | "omitted";
    mimeType?: string;
    base64Audio?: string;
  };
}
