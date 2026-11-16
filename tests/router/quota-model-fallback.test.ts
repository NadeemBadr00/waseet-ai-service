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

// A 404 (this key cannot serve that model: gemini-2.5-* for a new key) is excluded for good; discovering it must not use up the request's attempts, otherwise a single 503 on the working
// model left nothing to retry with (maxAttempts 3 and two 404 models in front of it).
test("404 models do not consume attempts: a transient 503 on the good model is retried after the cooldown", async () => {
  ProjectPoolManager.setProjectsForTesting([(await import("../helpers/ai-fixtures.js")).fixtureProject("only")]);
  const [good, bad1, bad2] = SmartRouter.getCandidateModels("LIGHT", undefined, "low");
  let goodCalls = 0;
  const out = await modelOperation([good!, bad1!, bad2!], "SYNTHETIC", async (_p, model) => {
    if (model !== good) throw new AiProviderError("AI_PROVIDER_HTTP_404", 404);
    if (++goodCalls === 1) { ProjectPoolManager.recordRateLimit("only", model, 600); throw new AiProviderError("AI_PROVIDER_HTTP_503", 503, 600); }
    return "ok";
  }, { maxAttempts: 3 });
  assert.equal(out.result, "ok"); assert.equal(goodCalls, 2);
});
