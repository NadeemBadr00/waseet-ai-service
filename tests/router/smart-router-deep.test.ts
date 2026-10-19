import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ProjectPoolManager, SmartRouter, freeFixture } from "../helpers/ai-fixtures.js";
beforeEach(freeFixture);
test("default router operation never exceeds three HTTP attempts", async () => { let calls = 0; await assert.rejects(SmartRouter.executeWithFailover("LIGHT", "SYNTHETIC", async () => { calls++; throw { status: 429 }; }), /ATTEMPTS_EXHAUSTED/); assert.equal(calls, 3); });
test("all model routes unavailable produce a truthful unavailable outcome", () => { for (const p of ProjectPoolManager.getProjects()) for (const model of SmartRouter.getCandidateModels("LIGHT")) ProjectPoolManager.recordRateLimit(p.alias, model); assert.equal(SmartRouter.selectNextProject("LIGHT", "SYNTHETIC"), null); });
test("404 capability failure tries another approved model while permanent auth errors stop", async () => { const models: string[] = []; const out = await SmartRouter.executeWithFailover("LIGHT", "SYNTHETIC", async (_p, model) => { models.push(model); if (models.length === 1) throw { status: 404 }; return "ok"; }); assert.equal(out.result, "ok"); assert.notEqual(models[0], models[1]); let calls = 0; await assert.rejects(SmartRouter.executeWithFailover("LIGHT", "SYNTHETIC", async () => { calls++; throw { status: 403 }; }), /AUTH_FAILED/); assert.equal(calls, 1); });
