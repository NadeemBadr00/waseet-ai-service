import type { FastifyPluginAsync } from "fastify";
import { AvatarChatInputSchema } from "./avatar.types.js";
import { AvatarSpeechService } from "./avatar-speech.service.js";
import { clientSignal } from "../../runtime/routes.js";

export const avatarRoutes: FastifyPluginAsync = async (fastify) => {
  // AI2-04: AI Avatar Assistant
  fastify.post("/v1/ai/avatar/chat", async (request, reply) => {
    const input = AvatarChatInputSchema.parse(request.body);
    const client = clientSignal(request, reply);
    try { const data = await AvatarSpeechService.chatWithAvatar(input, client.signal); return reply.header("Cache-Control", "private, no-store").send({ success: true, data }); } finally { client.dispose(); }
  });
};
