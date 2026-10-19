export function assertDurableStorage(): void {
  if (process.env.WASEET_AI_DISTRIBUTED === "true" || process.env.WASEET_AI_DISTRIBUTED_REPLICAS === "true" || (process.env.K_SERVICE && process.env.WASEET_AI_DURABLE_VOLUME !== "true")) throw Object.assign(new Error("A durable shared storage backend is required before running AI replicas or ephemeral Cloud Run instances."), { code: "AI_SHARED_STORE_REQUIRED", statusCode: 503 });
}
