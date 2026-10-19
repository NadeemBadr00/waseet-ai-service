import type { FastifyReply } from "fastify";
import { featureError } from "../security/model-output.js";
export async function writeSse(reply: FastifyReply, event: string, data: unknown): Promise<void> {
  if (reply.raw.destroyed || reply.raw.writableEnded) throw featureError("CANCELLED", "Stream closed.", 499);
  if (reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { reply.raw.removeListener("drain", drain); reply.raw.removeListener("close", close); reply.raw.removeListener("error", close); };
    const drain = () => { cleanup(); resolve(); }, close = () => { cleanup(); reject(featureError("CANCELLED", "Stream disconnected.", 499)); };
    reply.raw.once("drain", drain); reply.raw.once("close", close); reply.raw.once("error", close);
  });
}
