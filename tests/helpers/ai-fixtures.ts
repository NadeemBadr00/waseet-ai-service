import { mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
process.env.NODE_ENV = "test";
process.env.WASEET_AI_STATE_DIR = mkdtempSync(resolve(tmpdir(), "waseet-contract-tests-"));
process.env.WASEET_AI_CLIENT_ID = "test-client";
process.env.WASEET_AI_CLIENT_SECRET = "test-client-secret-32-characters-long";
process.env.WASEET_AI_TOKEN_SIGNING_SECRET = "test-signing-secret-32-characters-long";
process.env.WASEET_AI_ENVIRONMENT = "dev";
delete process.env.WASEET_AI_ALLOW_PAID;
export const { ProjectPoolManager } = await import("../../src/router/project-pool.manager.js");
export const { SmartRouter } = await import("../../src/router/smart-router.js");
export const { GeminiGateway } = await import("../../src/router/gemini-gateway.js");
export const { MODEL_CAPABILITIES } = await import("../../src/router/model-registry.js");
export const { TenantAuthService } = await import("../../src/core/auth/tenant-auth.service.js");
export const { buildApp } = await import("../../src/app.js");
export const { TtsService } = await import("../../src/features/tts/tts.service.js");
export const fixtureProject = (alias: string, projectId = alias) => ({ alias, projectId, apiKey: "test-fixture-key", tier: "FREE" as const, enabled: true, freeConfirmed: true, maxRpm: 100, maxTpm: 1000000, supportedModels: Object.keys(MODEL_CAPABILITIES) });
export function freeFixture() { delete process.env.WASEET_AI_ALLOW_PAID; ProjectPoolManager.setProjectsForTesting([fixtureProject("a"), fixtureProject("b"), fixtureProject("c")]); ProjectPoolManager.resetCooldowns(); }
export function paidFixture() { process.env.WASEET_AI_ALLOW_PAID = "true"; process.env.WASEET_AI_PAID_DAILY_REQUEST_BUDGET = "1000"; ProjectPoolManager.setProjectsForTesting([{ ...fixtureProject("paid-fixture"), tier: "PAID" }]); ProjectPoolManager.resetCooldowns(); }
export function authHeaders(userId = "fixture-user", role: "client" | "provider" | "system" | "admin" = "client") { const issued = TenantAuthService.issue({ clientId: "test-client", clientSecret: process.env.WASEET_AI_CLIENT_SECRET, environment: "dev", actor: { userId, role } }); return { authorization: `Bearer ${issued.token}` }; }
export const forbidNetwork = async (): Promise<Response> => { throw new Error("UNMOCKED_NETWORK_FORBIDDEN"); };
globalThis.fetch = forbidNetwork;
export const textSuccess = () => Response.json({ candidates: [{ content: { parts: [{ text: "A fixture answer." }] }, finishReason: "STOP" }] });
export const wavFixture = Buffer.alloc(100); wavFixture.write("RIFF"); wavFixture.write("WAVE", 8);
export const audioSuccess = () => Response.json({ status: "completed", steps: [{ content: [{ type: "audio", data: wavFixture.toString("base64"), mime_type: "audio/wav" }] }] });
