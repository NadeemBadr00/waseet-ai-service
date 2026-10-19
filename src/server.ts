import { buildApp } from "./app.js";
import { env } from "./core/config/env.js";
import { SocketBridge } from "./bridge/socket-bridge.js";

const app = buildApp();

async function start() {
  try {
    // Attach Socket.IO to Fastify underlying HTTP server
    SocketBridge.initSocketIOServer(app.server);

    const address = await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`[WaseetAI] Server running at ${address}`);
    console.log(`[WaseetAI] Socket.IO real-time engine attached`);
  } catch (err) {
    console.error("[WaseetAI] Server failed to start:", err);
    process.exit(1);
  }
}

if (process.env["NODE_ENV"] !== "test") {
  start();
}
