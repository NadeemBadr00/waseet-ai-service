import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { paidFixture, freeFixture, fixtureProject, ProjectPoolManager, forbidNetwork } from "../helpers/ai-fixtures.js";
import { capabilities } from "../../src/runtime/routes.js";
import type { ProjectManifest } from "../../src/router/types.js";

beforeEach(() => { paidFixture(); delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; globalThis.fetch = forbidNetwork; });
afterEach(() => { delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; globalThis.fetch = forbidNetwork; });
const paid = (patch: Partial<ProjectManifest> = {}): ProjectManifest => ({ ...fixtureProject("paid-search"), tier: "PAID", supportedModels: ["gemini-2.5-flash"], ...patch });

test("web search capability needs the exact server flag even when paid text routing exists", () => {
  assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "SERVER_DISABLED" });
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "TRUE";
  assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "SERVER_DISABLED" });
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true";
  assert.deepEqual(capabilities().webSearch, { available: true, provider: "google" });
  assert.equal(capabilities().inferenceVerified, false);
});

test("free-only text models and disabled or invalid paid budgets cannot advertise private web search", () => {
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true";
  freeFixture(); assert.ok(capabilities().models.some(model => model.modalities.includes("TEXT")));
  assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "PRIVATE_ROUTE_UNAVAILABLE" });
  paidFixture(); delete process.env.WASEET_AI_ALLOW_PAID;
  assert.equal(capabilities().webSearch.available, false);
  process.env.WASEET_AI_ALLOW_PAID = "true"; process.env.WASEET_AI_PAID_DAILY_REQUEST_BUDGET = "0";
  assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "PRIVATE_ROUTE_UNAVAILABLE" });
});

test("paid search availability requires an enabled credential and an approved TEXT model", () => {
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true";
  for (const project of [paid({ enabled: false }), paid({ apiKey: "" }), paid({ supportedModels: ["gemini-embedding-2"] }), paid({ supportedModels: ["unapproved-text"] })]) {
    ProjectPoolManager.setProjectsForTesting([project]);
    assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "PRIVATE_ROUTE_UNAVAILABLE" });
  }
  ProjectPoolManager.setProjectsForTesting([paid()]);
  assert.deepEqual(capabilities().webSearch, { available: true, provider: "google" });
});

test("cooldown and blocked paid credentials cannot make search appear available through a free project", () => {
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = "true";
  ProjectPoolManager.setProjectsForTesting([paid(), fixtureProject("free-search")]);
  ProjectPoolManager.recordRateLimit("paid-search", "gemini-2.5-flash", 60000);
  assert.ok(capabilities().models.some(model => model.id === "gemini-2.5-flash"));
  assert.deepEqual(capabilities().webSearch, { available: false, provider: "google", reason: "PRIVATE_ROUTE_UNAVAILABLE" });
  ProjectPoolManager.resetCooldowns(); ProjectPoolManager.blockAuthentication("paid-search");
  assert.equal(capabilities().webSearch.available, false);
  ProjectPoolManager.resetCooldowns(); assert.equal(capabilities().webSearch.available, true);
});
