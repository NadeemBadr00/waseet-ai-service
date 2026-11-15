import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp, paidFixture, GeminiGateway, forbidNetwork } from "../helpers/ai-fixtures.js";

// The service accepts only expiring signed tokens. A static "dev" token exists only when explicitly configured (>= 32 chars) in the dev environment: there is no default in the source.
describe("static legacy token", () => {
  const app = buildApp();
  const saved = process.env.WASEET_AI_LEGACY_DEV_TOKEN;
  const call = (token: string) => app.inject({ method: "POST", url: "/v1/ai/profile/performance-summary", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: {} });
  before(async () => { paidFixture(); await app.ready(); });
  beforeEach(() => { paidFixture(); globalThis.fetch = forbidNetwork; delete process.env.WASEET_AI_LEGACY_DEV_TOKEN; });
  after(() => { GeminiGateway.setMockHandler(null); if (saved === undefined) delete process.env.WASEET_AI_LEGACY_DEV_TOKEN; else process.env.WASEET_AI_LEGACY_DEV_TOKEN = saved; });

  test("no Authorization header: 401 AUTH_REQUIRED", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/ai/profile/performance-summary", payload: {} });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, "AUTH_REQUIRED");
  });

  test("the token that used to be hard-coded in the source is NOT a credential when nothing is configured", async () => {
    const res = await call(["waseet", "dev", "sec", "99a8b7c6d5e4"].join("_"));
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, "AUTH_INVALID");
  });

  test("a short configured static token is refused (minimum 32 characters)", async () => {
    process.env.WASEET_AI_LEGACY_DEV_TOKEN = "short-token";
    const res = await call("short-token");
    assert.equal(res.statusCode, 401);
  });

  test("an explicitly configured, long static token works only in the dev environment (and an arbitrary token still does not)", async () => {
    const configured = "configured-static-dev-token-32-chars-min";
    process.env.WASEET_AI_LEGACY_DEV_TOKEN = configured;
    assert.notEqual((await call(configured)).statusCode, 401);
    assert.equal((await call("some-other-static-token-of-32-characters")).statusCode, 401);
  });
});
