import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { HelpChatInputSchema } from "./help.types.js";
import { HelpService } from "./help.service.js";
import { writeSse } from "../../core/http/sse.js";
export const helpRoutes: FastifyPluginAsync = async fastify => {
  const stream = async (request: FastifyRequest, reply: FastifyReply, general = false) => {
    const input = HelpChatInputSchema.parse(request.body);
    const controller = new AbortController();
    const onClose = () => { if (!reply.raw.writableFinished) controller.abort(); };
    reply.raw.once("close", onClose);
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8"); reply.raw.setHeader("Cache-Control", "no-cache, no-transform"); reply.raw.setHeader("X-Accel-Buffering", "no");
    try { for await (const item of HelpService.askStream({ ...input, ...(general ? { mode: "general" as const } : {}) }, { signal: controller.signal })) await writeSse(reply, item.event, item.data); }
    catch (error) { if (!reply.raw.destroyed) reply.raw.write("event: help:error\ndata: " + JSON.stringify({ code: (error as {code?:string}).code ?? "AI_UNAVAILABLE", message: "تعذر إكمال الرد بأمان. حاول لاحقًا.", human_support_fallback: true }) + "\n\n"); }
    finally { reply.raw.removeListener("close", onClose); if (!reply.raw.destroyed) reply.raw.end(); }
  };
  fastify.post("/v1/ai/help/stream", (request, reply) => stream(request, reply));
  fastify.post("/v1/ai/help/chat", (request, reply) => stream(request, reply));
  fastify.post("/v1/ai/help/general", (request, reply) => stream(request, reply, true));
  fastify.get("/v1/ai/help/conversations/:id/export", async request => ({ success: true, data: HelpService.exportConversation(z.object({ id: z.string().min(1).max(200) }).parse(request.params).id) }));
  fastify.delete("/v1/ai/help/conversations/:id", async request => ({ success: true, data: { deleted: HelpService.deleteConversation(z.object({ id: z.string().min(1).max(200) }).parse(request.params).id) } }));
};
