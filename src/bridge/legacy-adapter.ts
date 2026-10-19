import type { FastifyPluginAsync } from "fastify";
import { legacyClientAdapterRoutes } from "./legacy-client-adapter.js";
import { legacyProviderAdapterRoutes } from "./legacy-provider-adapter.js";

export const legacyAdapterRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(legacyClientAdapterRoutes);
  await fastify.register(legacyProviderAdapterRoutes);
};
