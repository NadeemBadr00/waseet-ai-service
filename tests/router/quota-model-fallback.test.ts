import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ProjectPoolManager, SmartRouter, freeFixture } from "../helpers/ai-fixtures.js";
const { modelOperation } = await import("../../src/router/transport.js");
const { AiProviderError } = await import("../../src/router/smart-router.js");
beforeEach(freeFixture);

// When one model answers 429 on two keys in the same request, the remaining attempts move to the NEXT model (its own quota) instead of being spent on more keys of the exhausted one.
test("two quota refusals for a model switch the request to the next model", async () => {
  const [first, second] = SmartRouter.getCandidateModels("LIGHT", undefined, "low");
  const tried: string[] = [];
  const out = await modelOperation([first!, second!], "SYNTHETIC", async (_p, model) => {
    tried.push(model);
    if (model === first) throw new AiProviderError("AI_PROVIDER_HTTP_429", 429, 60000);
    return "ok";
  }, { maxAttempts: 8 });
  assert.equal(out.result, "ok");
  assert.equal(out.model, second);
  assert.equal(tried.filter(m => m === first).length, 2);
});

test("a single quota refusal still tries another key of the same model", async () => {
  const [first] = SmartRouter.getCandidateModels("LIGHT", undefined, "low");
  const tried: string[] = [];
  const out = await modelOperation([first!], "SYNTHETIC", async (project, model) => {
    tried.push(project.alias);
    if (tried.length === 1) throw new AiProviderError("AI_PROVIDER_HTTP_429", 429, 60000);
    return model;
  }, { maxAttempts: 8 });
  assert.equal(out.result, first);
  assert.equal(new Set(tried).size, 2);
});

// A pool with ONE key (the paid key) has nothing to switch to: a short vendor cooldown is waited out instead of failing the request.
test("a single-key pool waits out a short cooldown and then succeeds", async () => {
  const { fixtureProject } = await import("../helpers/ai-fixtures.js");
  ProjectPoolManager.setProjectsForTesting([fixtureProject("only")]);
  const [model] = SmartRouter.getCandidateModels("LIGHT", undefined, "low");
  let calls = 0;
  const started = Date.now();
  const out = await modelOperation([model!], "SYNTHETIC", async () => {
    calls++;
    if (calls === 1) { ProjectPoolManager.recordRateLimit("only", model!, 1200); throw new AiProviderError("AI_PROVIDER_HTTP_503", 503, 1200); }
    return "ok";
  }, { maxAttempts: 4 });
  assert.equal(out.result, "ok"); assert.equal(calls, 2); assert.ok(Date.now() - started >= 1000);
});
