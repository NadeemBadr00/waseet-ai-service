import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, buildApp, paidFixture, GeminiGateway } from '../helpers/ai-fixtures.js';
import { domainModel } from '../helpers/domain-fixtures.js';
import { DurableStore } from '../../src/core/database/durable-store.js';

const app = buildApp();
before(async () => { paidFixture(); GeminiGateway.setMockHandler(domainModel); await app.ready(); });
after(async () => { GeminiGateway.setMockHandler(null); await app.close(); DurableStore.close(); });
const inject = (method: 'GET' | 'POST', url: string, payload?: unknown, user = 'legacy-provider', role: 'client' | 'provider' | 'system' = 'provider') => app.inject({ method, url, headers: authHeaders(user, role), ...(payload === undefined ? {} : { payload: payload as any }) });

test('legacy endpoints reject bootstrap credentials as bearer access tokens', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/assessments/generate', headers: { authorization: 'Bearer ' + process.env.WASEET_AI_CLIENT_SECRET }, payload: { providerSpecialtyId: 'spec', specialtyName: 'تصميم' } });
  assert.equal(response.statusCode, 401);
});

test('legacy accreditation without readable content stays unverified and has no fabricated quality score', async () => {
  const response = await inject('POST', '/api/provider/accreditation/submit', { title: 'نموذج تصميم', technologiesUsed: [] });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.sample.status, 'UNVERIFIED');
  assert.equal(response.json().data.evaluation.aiScore, null);
});

test('legacy assessments use the authenticated owner, hide answer keys, reject another actor and submit idempotently', async () => {
  const response = await inject('POST', '/api/assessments/generate', { providerSpecialtyId: 'spec-design', specialtyName: 'تصميم', questionCount: 3 });
  assert.equal(response.statusCode, 200);
  const { attemptId, questions } = response.json().data;
  assert.equal(questions.length, 3);
  assert.ok(!JSON.stringify(questions).includes('correctOptionId'));
  const status = await inject('GET', `/api/assessments/${attemptId}/status`);
  assert.equal(status.json().data.status, 'IN_PROGRESS');
  assert.equal((await inject('GET', `/api/assessments/${attemptId}/status`, undefined, 'other-provider')).statusCode, 404);
  assert.equal((await inject('POST', `/api/assessments/${attemptId}/submit`, { submittedAnswers: { '1': 'a' } }, 'other-provider')).statusCode, 404);
  const submitted = await inject('POST', `/api/assessments/${attemptId}/submit`, { submittedAnswers: { '1': 'a', '2': 'a', '3': 'a' } });
  assert.equal(submitted.statusCode, 200);
  assert.equal(submitted.json().data.score, 100);
  const retry = await inject('POST', `/api/assessments/${attemptId}/submit`, { submittedAnswers: {} });
  assert.deepEqual(retry.json().data, submitted.json().data);
});

test('legacy statistics and fit without source records return no invented matches or probabilities', async () => {
  const statistics = await inject('GET', '/api/provider/statistics');
  assert.equal(statistics.statusCode, 200);
  assert.deepEqual(statistics.json().data.aiMatchingProjects, []);
  assert.equal(statistics.json().data.summary.aiRating, null);
  const fit = await inject('GET', '/api/assistant/analyze-project/missing');
  assert.equal(fit.statusCode, 200);
  assert.equal(fit.json().data.matchPercent, null);
  assert.equal(fit.json().data.suggestedBidPrice, null);
});

test('legacy profile metrics require actual complete counts and compute observed rates without AI quality scores', async () => {
  assert.equal((await inject('GET', '/api/provider/profile/public/missing')).statusCode, 422);
  const upsert = await inject('POST', '/v1/data/providers/upsert', { id: 'recorded-provider', data: { performanceMetrics: { totalProjectsCompleted: 10, onTimeProjectsCount: 8, repeatClientsCount: 2, totalClientsCount: 5, fiveStarReviewsCount: 3, totalReviewsCount: 4, disputedProjectsCount: 1 } } }, 'fixture-system', 'system');
  assert.equal(upsert.statusCode, 200);
  const response = await inject('GET', '/api/provider/profile/public/recorded-provider');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.onTimeDelivery, 80);
  assert.equal(response.json().data.clientSatisfaction, 75);
  assert.equal(response.json().data.executionQuality, null);
});

test('legacy bio uses supplied facts without inventing three years of experience', async () => {
  const response = await inject('POST', '/api/provider/profile/suggest-bio', { specialties: ['تصميم'] });
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().data.suggestedBio.includes('تصميم'));
  assert.doesNotMatch(response.json().data.suggestedBio, /3|ثلاث|سنوات/);
  assert.equal((await inject('POST', '/api/provider/profile/suggest-bio', {})).statusCode, 422);
  const skills = await inject('POST', '/api/provider/profile/suggest-skills', { specialtyName: 'تصميم' });
  assert.equal(skills.statusCode, 200);
  assert.ok(skills.json().data.suggestedSkills.length > 0);
});

test('legacy business audit remains advisory and bulk re-audit queues real work with owned status', async () => {
  const item = { modelId: 'offering-one', title: 'استشارات', description: 'تحديد المخرجات ومعايير القبول', pricing: { amount: 500, currency: 'SAR' } };
  const individual = await inject('POST', '/api/business-models/audit', item);
  assert.equal(individual.statusCode, 200);
  assert.equal(individual.json().data.isApproved, null);
  assert.equal(individual.json().data.status, 'REQUIRES_HUMAN_REVIEW');
  assert.equal((await inject('POST', '/api/business-models/re-audit-all', {})).statusCode, 400);
  const queued = await inject('POST', '/api/business-models/re-audit-all', { items: [item] });
  assert.equal(queued.statusCode, 202);
  assert.equal(queued.json().data.status, 'QUEUED');
  const id = queued.json().data.jobId;
  assert.equal((await inject('GET', `/v1/jobs/${id}`, undefined, 'other-provider')).statusCode, 404);
  let state: any;
  for (let count = 0; count < 30; count++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    state = (await inject('GET', `/v1/jobs/${id}`)).json().data;
    if (state.status === 'SUCCEEDED') break;
  }
  assert.equal(state.status, 'SUCCEEDED');
  assert.equal(state.processed, 1);
  assert.deepEqual(state.results.map((result: any) => result.status), ['REQUIRES_HUMAN_REVIEW']);
  assert.equal(state.results[0].isApproved, null);
});
