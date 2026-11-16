import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiGateway, paidFixture } from '../helpers/ai-fixtures.js';
const { ProfileMetricsService } = await import('../../src/features/providers/profile-metrics.service.js');

// The Gemini response schema carries no maxItems / maxLength, so a model answer with MORE than 12 skills (or one long entry) used to be refused with a 503 for that specialty.
// Size limits are applied to the answer instead: trimmed, deduplicated, never refused.
const run = async (answer: unknown, existing: string[] = []) => {
  paidFixture();
  GeminiGateway.setMockHandler(async () => JSON.stringify(answer));
  try { return await ProfileMetricsService.suggestSkills({ specialtyName: 'المحاسبة', existingSkills: existing } as never); } finally { GeminiGateway.setMockHandler(null); }
};

test('more than 12 skills: the first 12 new ones are returned', async () => {
  const skills = Array.from({ length: 16 }, (_, i) => `مهارة ${i + 1}`);
  const out = await run({ suggestedSkills: skills });
  assert.equal(out.suggestedSkills.length, 12);
  assert.equal(out.suggestedSkills[0], 'مهارة 1');
});

test('an over-long entry is skipped, the rest are kept; known skills are removed', async () => {
  const out = await run({ suggestedSkills: ['x'.repeat(150), 'Excel', 'excel', 'SAP', 'Odoo'] }, ['SAP']);
  assert.deepEqual(out.suggestedSkills, ['Excel', 'Odoo']);
});

test('nothing new to suggest is a clear 422, not a generic 503', async () => {
  await assert.rejects(() => run({ suggestedSkills: ['SAP'] }, ['sap']), (e: { statusCode?: number; code?: string }) => e.statusCode === 422 && e.code === 'AI_NOT_ENOUGH_DATA');
});
