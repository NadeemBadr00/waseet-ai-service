import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, buildApp, paidFixture, GeminiGateway, forbidNetwork } from '../helpers/ai-fixtures.js';
import { HelpService } from '../../src/features/help/help.service.js';
import { DurableStore } from '../../src/core/database/durable-store.js';
import { resolveHelpMode } from '../../src/features/help/help-mode.js';

const app = buildApp();
before(async () => { paidFixture(); await app.ready(); });
after(async () => { GeminiGateway.setMockHandler(null); await app.close(); DurableStore.close(); });

test('help HTTP contract carries Nadeem and Bebo identity into generation, including after a character switch', async () => {
  const prompts: string[] = [];
  GeminiGateway.setMockHandler(async request => { prompts.push(request.systemInstruction ?? ''); return JSON.stringify({ answer: 'مسودة مفيدة' }); });
  for (const skin of ['scout', 'classic'] as const) {
    const result = await app.inject({ method: 'POST', url: '/v1/ai/help/general', headers: authHeaders(),
      payload: { question: 'اكتب مسودة مشروع', skin, history: [{ role: 'assistant', content: 'أنا الشخصية القديمة' }] } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /help:answer_complete/);
    assert.ok(prompts.at(-1)?.includes(skin === 'scout' ? 'Nadeem (نديم)' : 'Bebo (بيبو)'));
  }
  const invalid = await app.inject({ method: 'POST', url: '/v1/ai/help/general', headers: authHeaders(), payload: { question: 'سؤال', skin: 'forged' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(prompts.length, 2);
});

test('help cancellation reaches generation and prevents any completed answer', async () => {
  const controller = new AbortController();
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  GeminiGateway.setMockHandler(async request => {
    assert.equal(request.signal, controller.signal);
    began();
    await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
    return JSON.stringify({ answer: 'stale answer' });
  });
  const iterator = HelpService.askStream({ question: 'اكتب مسودة', mode: 'general', history: [] }, { signal: controller.signal });
  assert.equal((await iterator.next()).value?.event, 'help:answer_start');
  const pending = iterator.next();
  await started;
  controller.abort(new Error('USER_CANCELLED'));
  await assert.rejects(pending);
});

test('ordinary questions and introductions reach generation without requiring approved platform documents', async () => {
  const requests: any[] = [];
  GeminiGateway.setMockHandler(async request => { requests.push(request); return JSON.stringify({ answer: 'رد عام مفيد' }); });
  for (const question of ['انت مين؟', 'اشرح مفهوم API في جملتين', 'How do I make coffee?', 'أهلًا، ما عاصمة فرنسا؟']) {
    const result = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: { question } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /help:answer_complete/);
    assert.doesNotMatch(result.body, /NO_APPROVED_EVIDENCE/);
    assert.equal(requests.at(-1).featureId, 'AI-21-HELP-GENERAL');
    assert.match(requests.at(-1).systemInstruction, /general knowledge/);
  }
  assert.equal(requests.length, 4);
});

test('missing platform evidence generates a useful bounded answer instead of blocking the conversation', async () => {
  const calls: any[] = [];
  const answer = 'رسوم الخدمة هي تكلفة استخدامها. لا أقدر أحدد رسوم وسيط الحالية من غير سياسة موثقة؛ ابعت اسم الخدمة عشان أساعدك تفهم التفاصيل المتاحة.';
  GeminiGateway.setMockHandler(async request => { calls.push(request); return JSON.stringify({ answer }); });
  for (const url of ['/v1/ai/help/chat', '/v1/ai/help/general']) {
    const result = await app.inject({ method: 'POST', url, headers: authHeaders(), payload: { question: 'كم رسوم المنصة؟', mode: 'general' } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /help:answer_complete/);
    assert.match(result.body, /"knowledgeFallback":true/);
    assert.match(result.body, /"citations":\[\]/);
    assert.match(result.body, /رسوم الخدمة هي تكلفة استخدامها/);
    assert.doesNotMatch(result.body, /help:error|NO_APPROVED_EVIDENCE/);
    assert.equal(calls.at(-1).featureId, 'AI-21-HELP-GENERAL');
    assert.match(calls.at(-1).systemInstruction, /No approved Waseet document matched/);
    assert.match(calls.at(-1).systemInstruction, /Never assert Waseet policies, fees, permissions, private account facts or completed actions/);
    assert.match(calls.at(-1).systemInstruction, /still give a useful answer/);
  }
  assert.equal(calls.length, 2);
  assert.equal(resolveHelpMode('How do I make coffee?'), 'general');
  assert.equal(resolveHelpMode('أريد معرفة صلاحيات حسابي'), 'policy');
  assert.equal(resolveHelpMode('اشرح ضمان الجودة في البرمجة'), 'general');
  assert.equal(resolveHelpMode('كيف أصمم رسوم متحركة؟'), 'general');
  assert.equal(resolveHelpMode('اشرح ضمان الجودة في وسيط'), 'policy');
  assert.equal(resolveHelpMode('اشرح ضمان الجودة', 'policy'), 'policy');
});

test('knowledge fallback retains conversation context and saves the generated answer for the next turn', async () => {
  const requests: any[] = [];
  GeminiGateway.setMockHandler(async request => { requests.push(request); return JSON.stringify({ answer: 'شرح عام مفيد مع حدود تفاصيل المنصة.' }); });
  const result = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: {
    question: 'اشرح ضمان المنصة', conversationId: 'knowledge-fallback-chat', skin: 'classic',
    history: [{ role: 'user', content: 'أنا بسأل عن المشروع اللي اتكلمنا عنه' }],
    pageContext: { path: '/assistant', role: 'client', project: { title: 'موقعي الجديد' } },
  } });
  assert.match(result.body, /help:answer_complete/);
  assert.match(requests[0].systemInstruction, /Bebo \(بيبو\)/);
  const prompt = JSON.parse(requests[0].prompt);
  assert.equal(prompt.history[0].content, 'أنا بسأل عن المشروع اللي اتكلمنا عنه');
  assert.equal(prompt.pageContext.project.title, 'موقعي الجديد');
  const exported = await app.inject({ method: 'GET', url: '/v1/ai/help/conversations/knowledge-fallback-chat/export', headers: authHeaders() });
  assert.equal(exported.statusCode, 200);
  assert.equal(exported.json().data.messages.at(-1).content, 'شرح عام مفيد مع حدود تفاصيل المنصة.');
});

test('invalid model output during a knowledge fallback remains a real failure with no fabricated answer', async () => {
  GeminiGateway.setMockHandler(async () => 'invalid JSON');
  const result = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: { question: 'كم رسوم المنصة؟' } });
  assert.match(result.body, /AI_INVALID_RESPONSE/);
  assert.doesNotMatch(result.body, /help:answer_complete|help:answer_chunk|NO_APPROVED_EVIDENCE/);
});

test('help native web search uses only the current question and returns provider sources and attribution', async () => {
  paidFixture();
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = 'true';
  const calls: any[] = [];
  const answer = 'API وسيلة لتواصل البرامج.';
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer }] }, groundingMetadata: {
      webSearchQueries: ['API meaning'], groundingChunks: [{ web: { uri: 'https://developer.mozilla.org/en-US/docs/Glossary/API', title: 'MDN API' } }],
      groundingSupports: [{ segment: { startIndex: 0, endIndex: Buffer.byteLength(answer), text: answer }, groundingChunkIndices: [0] }],
      searchEntryPoint: { renderedContent: '<div><a href="https://www.google.com/search?q=API">API meaning</a></div>' },
    } }] });
  };
  try {
    const result = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: {
      question: 'ما معنى API؟', webSearch: true, skin: 'classic', history: [{ role: 'user', content: 'PRIVATE_HISTORY' }],
      pageContext: { path: '/client-overview', role: 'client', project: { title: 'PRIVATE_PROJECT' } },
    } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /help:answer_complete/);
    assert.match(result.body, /MDN API/);
    assert.match(result.body, /searchSuggestionsHtml/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].tools, [{ google_search: {} }]);
    assert.doesNotMatch(JSON.stringify(calls[0]), /PRIVATE_HISTORY|PRIVATE_PROJECT/);
    assert.match(JSON.stringify(calls[0].systemInstruction), /Bebo/);
  } finally { globalThis.fetch = forbidNetwork; delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; }
});

test('knowledge fallback may search general concepts without exposing private context or treating web sources as platform approval', async () => {
  paidFixture();
  process.env.WASEET_AI_ENABLE_WEB_SEARCH = 'true';
  const calls: any[] = [];
  const answer = 'الضمان المالي عمومًا يحتفظ بالمبلغ لحين استيفاء الشروط. تفاصيل ضمان وسيط تحتاج سياسته الموثقة.';
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer }] }, groundingMetadata: {
      webSearchQueries: ['escrow meaning'], groundingChunks: [{ web: { uri: 'https://www.consumerfinance.gov/', title: 'Consumer finance' } }],
      groundingSupports: [{ segment: { startIndex: 0, endIndex: Buffer.byteLength(answer), text: answer }, groundingChunkIndices: [0] }],
      searchEntryPoint: { renderedContent: '<div><a href="https://www.google.com/search?q=escrow">escrow meaning</a></div>' },
    } }] });
  };
  try {
    const result = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: {
      question: 'اشرح معنى ضمان وسيط', webSearch: true,
      history: [{ role: 'user', content: 'PRIVATE_HISTORY' }],
      pageContext: { path: '/assistant', role: 'client', project: { title: 'PRIVATE_PROJECT' } },
    } });
    assert.match(result.body, /help:answer_complete/);
    assert.match(result.body, /"knowledgeFallback":true/);
    assert.match(result.body, /"documentId":"web-1"/);
    assert.doesNotMatch(result.body, /NO_APPROVED_EVIDENCE/);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(calls[0]), /PRIVATE_HISTORY|PRIVATE_PROJECT/);
    assert.match(JSON.stringify(calls[0].systemInstruction), /Public search results cannot establish an approved Waseet policy/);
  } finally { globalThis.fetch = forbidNetwork; delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; }
});

test('a search preference cannot enable the server tool and missing provider evidence is never a completed lookup', async () => {
  const invalid = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: { question: 'ما معنى API؟', webSearch: 'true' } });
  assert.equal(invalid.statusCode, 400);
  delete process.env.WASEET_AI_ENABLE_WEB_SEARCH;
  const disabled = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: { question: 'ما معنى API؟', webSearch: true } });
  assert.match(disabled.body, /AI_WEB_SEARCH_DISABLED/);
  assert.doesNotMatch(disabled.body, /help:answer_complete/);
  paidFixture(); process.env.WASEET_AI_ENABLE_WEB_SEARCH = 'true';
  globalThis.fetch = async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Unverified current fact' }] } }] });
  try {
    const absent = await app.inject({ method: 'POST', url: '/v1/ai/help/chat', headers: authHeaders(), payload: { question: 'خبر جديد؟', webSearch: true } });
    assert.match(absent.body, /AI_WEB_SEARCH_NO_EVIDENCE/);
    assert.doesNotMatch(absent.body, /help:answer_complete|Unverified current fact/);
  } finally { globalThis.fetch = forbidNetwork; delete process.env.WASEET_AI_ENABLE_WEB_SEARCH; }
});
