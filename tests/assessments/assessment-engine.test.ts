import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { paidFixture, GeminiGateway, authHeaders, buildApp } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";
const { FirestoreService } = await import("../../src/core/database/firestore.js");
const { AssessmentEngineService } = await import("../../src/features/assessments/assessment-engine.service.js");
const { OnboardingQuizService } = await import("../../src/features/assessments/onboarding-quiz.service.js");
const { tenantStorage } = await import("../../src/core/auth/tenant-context.js");
const { DurableStore } = await import("../../src/core/database/durable-store.js");
const input = { providerSpecialtyId:"graphic-design",specialtyName:"تصميم جرافيك",questionCount:20,timeLimitMinutes:15 };
describe("Owned durable assessments and deterministic grading",()=>{
  beforeEach(()=>{paidFixture();FirestoreService.clear();GeminiGateway.setMockHandler(domainModel);});
  after(()=>{GeminiGateway.setMockHandler(null);DurableStore.close();});
  test("exact discipline-specific count and private answer keys stay out of public payload",async()=>{
    const result=await AssessmentEngineService.generateAssessment(input,"user1");assert.equal(result.questions.length,20);assert.equal(result.generationSource,"GEMINI");
    assert.equal(new Set(result.questions.map(q=>q.textAr)).size,20);for(const item of result.questions){assert.match(item.textAr,/تصميم جرافيك/);assert.equal(item.options.length,4);assert.equal((item as any).correctOptionId,undefined);}
    const attempt=await FirestoreService.getAttempt(result.attemptId);assert.equal(attempt?.userId,"user1");assert.ok(await FirestoreService.getAnswerKey(result.attemptId));
  });
  test("50 questions use bounded structured batches without repetition",async()=>{
    const result=await AssessmentEngineService.generateAssessment({...input,questionCount:50},"user1");assert.equal(result.questions.length,50);assert.equal(new Set(result.questions.map(q=>q.textAr)).size,50);
  });
  test("correct answers score100 and repeated finalization returns immutable result",async()=>{
    const result=await AssessmentEngineService.generateAssessment(input,"user1"),key=await FirestoreService.getAnswerKey(result.attemptId);assert.ok(key);
    const first=await AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:key.answers},"user1");
    assert.equal(first.score,100);assert.equal(first.isPassed,true);
    const repeated=await AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:{}},"user1");assert.deepEqual(repeated,first);
  });
  test("wrong valid options score50; unknown questions/options rejected before finalization",async()=>{
    const result=await AssessmentEngineService.generateAssessment(input,"user1"),key=await FirestoreService.getAnswerKey(result.attemptId);assert.ok(key);
    await assert.rejects(()=>AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:{"999":"a"}},"user1"),{code:"ASSESSMENT_ANSWER_INVALID"});
    await assert.rejects(()=>AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:{"1":"wrong-opt"}},"user1"),{code:"ASSESSMENT_ANSWER_INVALID"});
    const answers=Object.fromEntries(Object.keys(key.answers).map((id,index)=>[id,index<10?"a":"b"]));
    const graded=await AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:answers},"user1");assert.equal(graded.score,50);assert.equal(graded.isPassed,false);
  });
  test("expiry and ownership enforce both status and submit; persisted keys survive close/reopen",async()=>{
    const result=await AssessmentEngineService.generateAssessment(input,"user1");DurableStore.close();assert.ok(await FirestoreService.getAnswerKey(result.attemptId));
    await assert.rejects(()=>AssessmentEngineService.getAttemptStatus(result.attemptId,"user2"),{code:"NOT_FOUND"});
    await assert.rejects(()=>AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:{}},"user2"),{code:"NOT_FOUND"});
    const attempt=await FirestoreService.getAttempt(result.attemptId);assert.ok(attempt);attempt.expiresAt=new Date(Date.now()-1000).toISOString();await FirestoreService.saveAttempt(attempt);
    assert.equal((await AssessmentEngineService.getAttemptStatus(result.attemptId,"user1")).status,"EXPIRED");await assert.rejects(()=>AssessmentEngineService.submitAssessment(result.attemptId,{submittedAnswers:{}},"user1"),{code:"ASSESSMENT_EXPIRED"});
  });
  test("malformed/duplicate questions fail instead of generic programming fallback",async()=>{
    GeminiGateway.setMockHandler(async()=>JSON.stringify({questions:[]}));await assert.rejects(()=>AssessmentEngineService.generateAssessment(input,"user1"),{code:"AI_INVALID_RESPONSE"});
    GeminiGateway.setMockHandler(async req=>{const result=JSON.parse(await domainModel(req));result.questions[1].textAr=result.questions[0].textAr;return JSON.stringify(result);});
    await assert.rejects(()=>AssessmentEngineService.generateAssessment(input,"user1"),{code:"AI_INVALID_ASSESSMENT"});
  });
  test("onboarding persists, rejects unknown answers, remains ungraded while incomplete and replays idempotently",async()=>{
    const result=await OnboardingQuizService.initQuiz("user1");
    assert.equal((await OnboardingQuizService.getResult(result.attemptId,"user1")).status,"IN_PROGRESS");
    await assert.rejects(()=>OnboardingQuizService.recordAnswer(result.attemptId,{questionId:"invented",answerIndex:0},"user1"),{code:"INVALID_ANSWER"});
    await assert.rejects(()=>OnboardingQuizService.recordAnswer(result.attemptId,{questionId:"q_onboard_1",answerIndex:0},"user2"),{code:"NOT_FOUND"});
    for(const [index,answerIndex] of [0,1,0,2,0].entries()) await OnboardingQuizService.recordAnswer(result.attemptId,{questionId:"q_onboard_"+(index+1),answerIndex},"user1");
    DurableStore.close();const graded=await OnboardingQuizService.getResult(result.attemptId,"user1");assert.equal(graded.score,100);assert.equal(graded.correct,5);assert.deepEqual(await OnboardingQuizService.getResult(result.attemptId,"user1"),graded);
    await assert.rejects(()=>OnboardingQuizService.recordAnswer(result.attemptId,{questionId:"q_onboard_1",answerIndex:2},"user1"),{code:"QUIZ_FINALIZED"});
  });
  test("HTTP generation/status/submit keep answer keys private and prohibit other users",async()=>{
    const app=buildApp();try{
      const generated=await app.inject({method:"POST",url:"/v1/ai/assessments",headers:authHeaders("user1","provider"),payload:{...input,questionCount:3}});assert.equal(generated.statusCode,200);const body=generated.json().data;
      assert.doesNotMatch(generated.body,/correctOptionId|answers/);
      assert.equal((await app.inject({method:"GET",url:"/v1/ai/assessments/"+body.attemptId+"/status",headers:authHeaders("user2","provider")})).statusCode,404);
      const submit=await app.inject({method:"POST",url:"/v1/ai/assessments/"+body.attemptId+"/submit",headers:authHeaders("user1","provider"),payload:{submittedAnswers:{"1":"a","2":"a","3":"a"}}});assert.equal(submit.statusCode,200);assert.equal(submit.json().data.score,100);
    }finally{await app.close();}
  });
  test("request cancellation aborts provider work without synthetic completion",async()=>{
    GeminiGateway.setMockHandler(async()=>new Promise<string>(()=>{}));
    const controller=new AbortController();controller.abort(Object.assign(new Error("cancelled"),{code:"CANCELLED"}));
    await tenantStorage.run({clientId:"test-client",actor:{userId:"user1",role:"provider"},requestId:"cancel",signal:controller.signal},async()=>{await assert.rejects(()=>AssessmentEngineService.generateAssessment({...input,questionCount:1},"user1"));});
  });
});
