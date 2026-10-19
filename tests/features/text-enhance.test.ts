import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiGateway, paidFixture } from '../helpers/ai-fixtures.js';
import type { InferenceRequest } from '../../src/router/types.js';
const { TextEnhanceService } = await import('../../src/features/client-projects/text-enhance.service.js');

test('description enhancement preserves the supplied draft as data and requests complete selectable options using only its facts', async () => {
  paidFixture();
  const draft = 'أحتاج متجرًا يدعم إدارة المخزون خلال 14 يومًا، بميزانية 4500 دولار.\nلا تضف خدمة دفع خارجي.';
  const preview = 'الخيار الأول: مباشر وواضح\nوصف أول\nالخيار الثاني: احترافي\nوصف ثان\nالخيار الثالث: منظم بالتفاصيل\nوصف ثالث';
  let captured: InferenceRequest | undefined;
  GeminiGateway.setMockHandler(async request => { captured = request; return preview; });
  try {
    const chunks: string[] = [];
    for await (const item of TextEnhanceService.enhanceDescriptionStream(draft)) chunks.push(item.chunk);
    assert.equal(chunks.join(''), preview);
    assert.deepEqual(JSON.parse(captured!.prompt), { description: draft });
    assert.equal(captured!.classification, 'PERSONAL');
    assert.equal(captured!.featureId, 'AI-05-DESC-ENHANCE-STREAM');
    assert.match(captured!.systemInstruction!, /الحفاظ على جميع الأرقام والمواعيد والميزانية والمتطلبات/);
    assert.match(captured!.systemInstruction!, /لا تضف أرقامًا أو خصائص/);
    assert.match(captured!.systemInstruction!, /الخيار الثالث/);
    assert.equal(captured!.maxOutputTokens, 4096);
  } finally {
    GeminiGateway.setMockHandler(null);
  }
});
