import test from 'node:test';
import assert from 'node:assert/strict';
import { conciseReply, quickReply } from '../../src/features/bebo/quick-replies.js';

test('common replies are immediate in five languages and never consume real questions',()=>{
 for(const dialect of ['egyptian','saudi','gulf','msa','english']){
  const reply=quickReply('عرّفني بنفسك باختصار',dialect)!;
  assert.ok(reply);assert.ok(reply.length<=120);assert.ok(reply.split(/\s+/).length<=16);
 }
 assert.equal(quickReply('أهلاً، اشرح لي الذكاء الاصطناعي','egyptian'),undefined);
 assert.equal(quickReply('لا تعرفني بنفسك','egyptian'),undefined);
 assert.equal(quickReply('thanks','english'),'You’re welcome!');
});

test('a model response becomes one short spoken sentence within both limits',()=>{
 assert.equal(conciseReply('**المعلومة المهمة هنا.** مزيد من التفاصيل لا نحتاجه.'),'المعلومة المهمة هنا.');
 const reply=conciseReply('كلمة '.repeat(60));assert.ok(reply.length<=120);assert.ok(reply.split(/\s+/).length<=16);
 assert.equal(conciseReply(''),'');
});
