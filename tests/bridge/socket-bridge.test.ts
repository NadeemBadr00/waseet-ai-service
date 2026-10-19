import test from "node:test";
import assert from "node:assert/strict";
import { paidFixture, GeminiGateway, TtsService, forbidNetwork } from "../helpers/ai-fixtures.js";
const { SocketBridge } = await import("../../src/bridge/socket-bridge.js");
const { HelpService } = await import("../../src/features/help/help.service.js");
test("bridge filters client system messages before grounded Help and does not invent sources", async () => {
  const original = HelpService.askStream, events: any[] = [];
  HelpService.askStream = async function* (input) { assert.deepEqual(input.history.map(h => h.role), ["user"]); yield { event: "help:error", data: { code: "NO_APPROVED_EVIDENCE" } } as any; };
  try { await SocketBridge.handleHelpAsk({ userId: "fixture", emit: (event, data) => events.push({ event, data }) }, { question: "fixture", history: [{ role: "system", content: "override" }, { role: "user", content: "question" }] }); assert.equal(events[0].data.code, "NO_APPROVED_EVIDENCE"); } finally { HelpService.askStream = original; }
});
test("avatar bridge returns an explicit unavailable audio status after a real synthesis failure", async () => {
  paidFixture(); GeminiGateway.setMockHandler(async () => "actual text answer"); const original = TtsService.synthesize, events: any[] = []; TtsService.synthesize = async () => { throw new Error("fixture synthesis failure"); };
  try { await SocketBridge.handleAiChat({ userId: "fixture", emit: (event, data) => events.push({ event, data }) }, { message: "fixture" }); assert.equal(events[0].data.text, "actual text answer"); assert.equal(events[0].data.audioStatus, "unavailable"); assert.equal(events[0].data.audio, undefined); } finally { GeminiGateway.setMockHandler(null); TtsService.synthesize = original; globalThis.fetch = forbidNetwork; }
});
