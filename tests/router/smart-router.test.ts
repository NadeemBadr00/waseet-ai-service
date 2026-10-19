import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ProjectPoolManager, SmartRouter, freeFixture, paidFixture } from "../helpers/ai-fixtures.js";
beforeEach(freeFixture);
test("synthetic public routing uses explicitly confirmed free configuration", () => { assert.equal(SmartRouter.selectNextProject("LIGHT", "SYNTHETIC")?.project.tier, "FREE"); assert.equal(SmartRouter.selectNextProject("HEAVY", "SENSITIVE"), null); });
test("private routing requires an explicit enabled paid budget; no automatic paid fallback", () => { paidFixture(); assert.equal(SmartRouter.selectNextProject("HEAVY", "SENSITIVE")?.project.tier, "PAID"); delete process.env.WASEET_AI_ALLOW_PAID; assert.equal(SmartRouter.selectNextProject("HEAVY", "SENSITIVE"), null); });
test("vendor cooldown respects frozen model order and never resets on another request's success", () => { ProjectPoolManager.recordRateLimit("a", "gemini-2.5-flash-lite", 60000); ProjectPoolManager.recordSuccess("a", "gemini-2.5-flash-lite"); assert.equal(ProjectPoolManager.isProjectAvailable("a", "gemini-2.5-flash-lite"), false); assert.equal(SmartRouter.selectNextProject("LIGHT", "SYNTHETIC")?.project.alias, "b"); });
