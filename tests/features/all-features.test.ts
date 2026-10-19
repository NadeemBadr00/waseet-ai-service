import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { authHeaders, buildApp, paidFixture, GeminiGateway, audioSuccess, forbidNetwork } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";
const { env } = await import("../../src/core/config/env.js");
const { DurableStore } = await import("../../src/core/database/durable-store.js");
describe("Waseet factual HTTP feature contracts", () => {
  const app = buildApp(); const headers = () => authHeaders("fixture-admin", "admin");
  before(async () => { paidFixture(); GeminiGateway.setMockHandler(domainModel); await app.ready(); });
  after(async () => { GeminiGateway.setMockHandler(null); globalThis.fetch = forbidNetwork; await app.close(); DurableStore.close(); });
  const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: headers(), payload: payload as any });
  test("health and signed expiring token exchange; raw bootstrap bearer rejected", async () => {
    assert.equal((await app.inject({ method:"GET",url:"/health" })).statusCode,200);
    const issued = await post("/v1/auth/token", { clientId: env.WASEET_AI_CLIENT_ID, clientSecret: env.WASEET_AI_CLIENT_SECRET, environment:"dev", actor:{userId:"fixture-admin",role:"admin"} });
    assert.equal(issued.statusCode,200); assert.equal(issued.json().expiresIn,900); assert.equal(issued.json().token.split(".").length,3);
    const raw = await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:"Bearer "+env.WASEET_AI_CLIENT_SECRET},payload:{title:"valid title"}});
    assert.equal(raw.statusCode,401);
  });
  test("description/text streams preserve SSE boundaries", async () => {
    for (const [url,payload] of [["/v1/ai/project-description/stream",{title:"تصميم شعار",category:"تصميم"}],["/v1/ai/text/suggest/stream",{title:"تصميم شعار"}],["/v1/ai/text/enhance/stream",{description:"تصميم شعار خلال 10 أيام"}]] as const) { const res=await post(url,payload);assert.equal(res.statusCode,200);assert.match(res.body,/event: text.delta/);assert.match(res.body,/generation.completed/); }
  });
  test("draft returns suggestions with unknown market budget/match; title validation has no success fallback", async () => {
    const res=await post("/v1/ai/request-draft",{title:"شعار",description:"تصميم شعار",specialtyName:"تصميم"});assert.equal(res.statusCode,200);assert.equal(res.json().data.recommendedMinBudget,null);assert.equal(res.json().data.aiMatchScoreEstimate,null);
    assert.equal((await post("/v1/ai/request-title-check",{title:"asdf",specialtyName:"تصميم"})).json().data.isMeaningful,false);
    assert.equal((await post("/v1/ai/request-draft",{})).statusCode,400);
  });
  test("milestones reconcile cents and analysis distinguishes editorial clarity from unavailable feasibility", async () => {
    const res=await post("/v1/ai/milestones",{title:"شعار",description:"تصميم وتسليم شعار",totalAmount:10.01,deliveryDays:10});assert.equal(res.statusCode,200);
    const rows=res.json().data.milestones;assert.equal(rows.reduce((n:number,row:any)=>n+row.percentage,0),100);assert.equal(rows.reduce((n:number,row:any)=>n+Math.round(row.amount*100),0),1001);
    const analysis=await post("/v1/ai/project-analysis",{title:"شعار",description:"تصميم شعار"});assert.equal(analysis.statusCode,200);assert.equal(analysis.json().data.feasibilityScore,null);assert.equal(analysis.json().data.marketFitRating,"Unknown");
  });
  test("portfolio is advisory and accreditation never verifies unread content or invents IDs", async () => {
    const portfolio=await post("/v1/ai/portfolio-review",{providerSpecialtyId:"design",samples:[{title:"نموذج شعار",description:"شعار لمشروع"}]});assert.equal(portfolio.statusCode,200);assert.equal(portfolio.json().data.scores.aiScore,null);assert.equal(portfolio.json().data.inspected,false);
    const accreditation=await post("/v1/ai/accreditation-review",{sampleId:"real-sample",title:"نموذج",githubUrl:"https://example.com/unapproved"});assert.equal(accreditation.statusCode,200);assert.equal(accreditation.json().data.sample.id,"real-sample");assert.equal(accreditation.json().data.sample.status,"UNVERIFIED");assert.equal(accreditation.json().data.evaluation.aiScore,null);
    assert.equal((await post("/v1/ai/accreditation-review",{title:"نموذج"})).statusCode,400);
  });
  test("proposal budget uses actual limits and unavailable matching/acceptance odds remain null", async () => {
    const proposal=await post("/v1/ai/proposals/suggest",{projectId:"p",currentTitle:"عرض",currentMessage:"نطاق مقترح",project:{budgetMin:1200,budgetMax:2500}});assert.equal(proposal.statusCode,200);assert.equal(proposal.json().data.priceAudit.recommendedMin,1200);assert.equal(proposal.json().data.priceAudit.priceTag,null);
    const audit=await post("/v1/ai/proposals/audit/stream",{providerId:"p",projectId:"j"});assert.equal(audit.statusCode,200);assert.match(audit.body,/"acceptanceOdds":null/);
    const enrich=await post("/v1/ai/proposals/enrich",{proposalId:"real-prop",projectId:"p",title:"عرض",message:"تفاصيل",totalPrice:200,deliveryDays:10});assert.equal(enrich.statusCode,200);assert.equal(enrich.json().data.aiMatchScore,null);assert.equal(enrich.json().data.scoreBasis,"PROPOSAL_QUALITY");
  });
  test("matching and marketplace never synthesize unavailable candidates", async () => {
    const match=await post("/v1/ai/matching/projects-for-provider",{provider:{skills:["React"]},candidates:[{id:"react",title:"React",isOpen:true},{id:"closed",title:"React",isOpen:false},{id:"python",title:"Python"}]});assert.equal(match.statusCode,200);assert.deepEqual(match.json().data.aiMatchingProjects.map((row:any)=>row.projectId),["react"]);assert.equal(match.json().data.aiMatchingProjects[0].aiMatchScore,null);
    const empty=await post("/v1/ai/matching/projects-for-provider",{providerId:"unknown"});assert.deepEqual(empty.json().data.aiMatchingProjects,[]);
    const fit=await post("/v1/ai/project-fit",{projectId:"unknown"});assert.equal(fit.json().data.matchPercent,null);
    const marketplace=await post("/v1/ai/marketplace/recommendations",{query:"React",candidates:[{id:"service1",title:"React",isPublished:true},{id:"hidden",title:"React",isPublished:false}]});assert.equal(marketplace.statusCode,200);assert.deepEqual(marketplace.json().data.items.map((row:any)=>row.id),["service1"]);
  });
  test("metrics compute real counts, undefined measures stay null; profile authoring uses facts", async () => {
    const metrics=await post("/v1/ai/profile/performance-summary",{providerId:"p",totalProjectsCompleted:10,onTimeProjectsCount:9,totalClientsCount:8,repeatClientsCount:4,totalReviewsCount:10,fiveStarReviewsCount:9});assert.equal(metrics.statusCode,200);assert.equal(metrics.json().data.onTimeDelivery,90);assert.equal(metrics.json().data.communication,null);assert.equal(metrics.json().data.repeatClientRate,50);
    const bio=await post("/v1/ai/profile/bio",{providerId:"p",specialties:["تصميم"],yearsOfExperience:4,maxLength:250});assert.equal(bio.statusCode,200);assert.match(bio.json().data.suggestedBio,/4/);
    const skills=await post("/v1/ai/profile/skills",{providerId:"p",specialtyName:"برمجة",existingSkills:["TypeScript"]});assert.equal(skills.statusCode,200);assert.deepEqual(skills.json().data.suggestedSkills,["اختبار البرمجيات"]);
  });
  test("health uses real stage progress; delivery quotes notes but never claims inspected execution", async () => {
    const health=await post("/v1/ai/project-health",{view:"client",projectId:"p",milestonesCompleted:2,totalMilestones:3,daysRemaining:5});assert.equal(health.statusCode,200);assert.equal(health.json().data.matchPercentage,67);assert.equal(health.json().data.confidence,null);
    const delivery=await post("/v1/ai/delivery-review",{view:"client",projectId:"p",stageId:"s",scopeAgreed:"واجهة الدخول",requirements:["واجهة الدخول"],submissionDetails:"أرسلت واجهة الدخول"});assert.equal(delivery.statusCode,200);assert.equal(delivery.json().data.met[0].source,"delivery-note");assert.equal(delivery.json().data.contentRead,false);assert.equal(delivery.json().data.execution.executed,false);
    const dispute=await post("/v1/ai/disputes/summary",{disputeId:"d",projectId:"p",clientClaim:"متأخر",providerClaim:"سلمت"});assert.equal(dispute.statusCode,200);assert.ok(dispute.json().data.recommendation);assert.doesNotMatch(dispute.json().data.recommendation,/70%|48/);
  });
  test("policy help falls back to useful general advice with no sources; generic Bebo supports drafting; owned history can export/delete", async () => {
    const policy=await post("/v1/ai/help/stream",{question:"رسوم المنصة؟"});assert.equal(policy.statusCode,200);assert.match(policy.body,/help:answer_complete/);assert.match(policy.body,/"knowledgeFallback":true/);assert.doesNotMatch(policy.body,/NO_APPROVED_EVIDENCE/);
    const general=await post("/v1/ai/help/general",{question:"اكتب مسودة طلب",conversationId:"draft-chat",profile:"auto"});assert.equal(general.statusCode,200);assert.match(general.body,/help:answer_complete/);
    const exported=await app.inject({method:"GET",url:"/v1/ai/help/conversations/draft-chat/export",headers:headers()});assert.equal(exported.statusCode,200);assert.equal(exported.json().data.messages.length,2);
    const other=await app.inject({method:"GET",url:"/v1/ai/help/conversations/draft-chat/export",headers:authHeaders("other-user")});assert.equal(other.statusCode,404);
    assert.equal((await app.inject({method:"DELETE",url:"/v1/ai/help/conversations/draft-chat",headers:headers()})).json().data.deleted,true);
  });
  test("business reviews require human decisions and durable jobs are owned", async () => {
    const item={modelId:"real-model",title:"عرض خدمة",description:"خدمة محددة",pricing:{amount:100,currency:"USD"}};
    const single=await post("/v1/ai/business-models/audit",item);assert.equal(single.statusCode,200);assert.equal(single.json().data.isApproved,null);
    const bulk=await post("/v1/ai/business-models/re-audit",{items:[item]});assert.equal(bulk.statusCode,202);const id=bulk.json().data.jobId;
    const job=await app.inject({method:"GET",url:"/v1/jobs/"+id,headers:headers()});assert.equal(job.statusCode,200);
    const other=await app.inject({method:"GET",url:"/v1/jobs/"+id,headers:authHeaders("other")});assert.equal(other.statusCode,404);
  });
  test("privileged ingestion persists actual catalog and knowledge approval metadata", async () => {
    assert.equal((await post("/v1/data/projects/upsert",{id:"actual-project",data:{title:"React",isOpen:true},sourceVersion:1})).statusCode,200);
    const body={documentId:"policy",title:"سياسة الأمان",content:"لا تشارك كلمة مرور حسابك.",status:"APPROVED",sourceVersion:1};
    assert.equal((await post("/v1/knowledge/documents/upsert",body)).statusCode,200);
    const answer=await post("/v1/ai/help/stream",{question:"سياسة الأمان وكلمة مرور"});assert.equal(answer.statusCode,200);assert.match(answer.body,/help:citations/);assert.match(answer.body,/"docId":"policy"/);
    const forbidden=await app.inject({method:"POST",url:"/v1/knowledge/documents/upsert",headers:authHeaders("reader","client"),payload:body});assert.equal(forbidden.statusCode,403);
  });
  test("avatar voice is genuine mocked WAV instead of a fabricated success", async () => {
    globalThis.fetch=audioSuccess;try {const result=await post("/v1/ai/avatar/chat",{message:"مساعدة عامة"});assert.equal(result.statusCode,200);assert.equal(Buffer.from(result.json().data.audio.base64Audio,"base64").toString("ascii",0,4),"RIFF");}finally{globalThis.fetch=forbidNetwork;}
  });
});
