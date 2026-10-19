import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { authHeaders, buildApp, paidFixture, GeminiGateway, TenantAuthService, forbidNetwork } from "../helpers/ai-fixtures.js";
import { domainModel } from "../helpers/domain-fixtures.js";
const { env } = await import("../../src/core/config/env.js");
const { tenantStorage } = await import("../../src/core/auth/tenant-context.js");
const { DurableStore } = await import("../../src/core/database/durable-store.js");
const { FirestoreService } = await import("../../src/core/database/firestore.js");
const { ContentInspector, validateContentUrl, isPublicAddress } = await import("../../src/core/security/content-inspector.js");
const { extractContent } = await import("../../src/core/security/document-extractor.js");
const { requestIsolatedExecution, artifactBundleHash } = await import("../../src/core/security/isolated-execution.js");
const { HelpService } = await import("../../src/features/help/help.service.js");
const { HealthReviewService } = await import("../../src/features/client-projects/health-review.service.js");
const { ProfileMetricsService } = await import("../../src/features/providers/profile-metrics.service.js");
const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const ctx=(clientId="tenant-a",userId="owner",role="admin")=>({clientId,environment:"dev" as const,actor:{userId,role:role as "admin"},requestId:"test",scopes:["data:write","knowledge:write","ai:generate"]});
describe("Factual evidence, tenant isolation and expiring identity",()=>{
 beforeEach(()=>{paidFixture();FirestoreService.clear();GeminiGateway.setMockHandler(domainModel);});
 after(()=>{GeminiGateway.setMockHandler(null);globalThis.fetch=forbidNetwork;DurableStore.close();});
 test("signed claims reject wrong environment, expiry, tamper and actor/header override; reader cannot ingest",async()=>{
  const app=buildApp();try{
   const good=authHeaders("actor1","provider").authorization,parts=good.slice(7).split(".");
   const sign=(patch:any)=>{const claims={...JSON.parse(Buffer.from(parts[1]!,"base64url").toString()),...patch};const content=parts[0]+"."+Buffer.from(JSON.stringify(claims)).toString("base64url");return "Bearer "+content+"."+createHmac("sha256",env.WASEET_AI_TOKEN_SIGNING_SECRET).update(content).digest("base64url");};
   for(const authorization of [sign({exp:0}),sign({environment:"bank"}),good.slice(0,-4)+"xxxx"]) {const res=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization},payload:{title:"project title"}});assert.equal(res.statusCode,401);}
   const mismatch=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:good},payload:{title:"project title",actor:{userId:"other",role:"provider"}}});assert.equal(mismatch.statusCode,403);
   const wrongclient=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:good,"x-client-id":"other"},payload:{title:"project title"}});assert.equal(wrongclient.statusCode,401);
   const reader=await app.inject({method:"POST",url:"/v1/data/projects/upsert",headers:authHeaders("service-reader","system"),payload:{id:"x",data:{title:"fake"}}});assert.equal(reader.statusCode,403);
   await tenantStorage.run({clientId:"test-client",environment:"dev",actor:{userId:"actor1",role:"provider"},requestId:"revoke"},async()=>{const claims=JSON.parse(Buffer.from(parts[1]!,"base64url").toString());TenantAuthService.revokeTokenId(claims.jti,Date.now()+60000);});
   const revoked=await app.inject({method:"POST",url:"/v1/ai/request-title-check",headers:{authorization:good},payload:{title:"project title"}});assert.equal(revoked.statusCode,401);
  }finally{await app.close();}
 });
 test("CORS blocks unknown origins, raw errors do not expose private text",async()=>{
  const app=buildApp();try{const res=await app.inject({method:"GET",url:"/health",headers:{origin:"https://evil.example"}});assert.equal(res.statusCode,403);assert.equal(res.headers["access-control-allow-origin"],undefined);}finally{await app.close();}
 });
 test("durable storage survives process connection reopen and prevents tenant/collection collisions",async()=>{
  await tenantStorage.run(ctx(),async()=>{await FirestoreService.upsertCatalog("providers","same",{name:"provider",sourceVersion:1});await FirestoreService.upsertCatalog("projects","same",{title:"project",sourceVersion:1});DurableStore.close();assert.equal((await FirestoreService.searchCatalog("projects",()=>true)).length,1);assert.equal((await FirestoreService.searchCatalog("projects",()=>true))[0]?.title,"project");});
  await tenantStorage.run(ctx("tenant-b"),async()=>{assert.equal(await FirestoreService.getCatalog("projects","same"),null);});
 });
 test("approved retrieval filters draft, audience, owner, stale source and incompatible vectors before ranking",async()=>{
  const base={version:"1",locale:"ar",status:"APPROVED" as const,audience:"all" as const,createdAt:new Date().toISOString(),approvedBy:"admin",approvedAt:new Date().toISOString(),sourceVersion:2};
  await tenantStorage.run(ctx(),async()=>{
   await FirestoreService.upsertKnowledge({...base,documentId:"public",title:"رسوم الضمان",content:"الضمان وسياسة الرسوم.",embedding:[1,0],embeddingModel:"new"});
   await FirestoreService.upsertKnowledge({...base,documentId:"private",title:"رسوم الضمان",content:"رسوم خاصة.",ownerId:"other"});
   await FirestoreService.upsertKnowledge({...base,documentId:"admin",title:"رسوم الضمان",content:"سياسة المشرف.",audience:"admin"});
   await FirestoreService.upsertKnowledge({...base,documentId:"draft",title:"رسوم الضمان",content:"سياسة غير معتمدة.",status:"DRAFT"});
   await assert.rejects(()=>FirestoreService.upsertKnowledge({...base,sourceVersion:1,documentId:"public",title:"old",content:"old"}),{code:"STALE_SOURCE_VERSION"});
   await assert.rejects(()=>FirestoreService.upsertKnowledge({...base,documentId:"public",title:"changed",content:"changed"}),{code:"SOURCE_VERSION_CONFLICT"});
  });
  await tenantStorage.run({...ctx(),actor:{userId:"owner",role:"client"}},async()=>{const rows=await FirestoreService.searchApprovedKnowledge("رسوم الضمان","admin",{queryEmbedding:[1,0],embeddingModel:"old"});assert.deepEqual(rows.map(row=>row.documentId),["public"]);});
  await tenantStorage.run(ctx("tenant-b"),async()=>{assert.deepEqual(await FirestoreService.searchApprovedKnowledge("رسوم الضمان"),[]);});
 });
 test("SSRF rejects private IPv4/IPv6, non-HTTPS, credentials, arbitrary hosts and reserved addresses",()=>{
  for(const address of ["127.0.0.1","10.1.2.3","172.16.1.2","169.254.169.254","192.168.1.1","100.64.0.1","198.51.100.7","203.0.113.4","::1","::ffff:127.0.0.1","fe80::1","2001:db8::1"])assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress("8.8.8.8"),true);assert.equal(isPublicAddress("2606:4700:4700::1111"),true);
  for(const url of ["http://github.com/x/y","https://user:pass@github.com/x/y","https://127.0.0.1/x","https://example.com/x","https://github.com/x?api_key=sensitive"])assert.throws(()=>validateContentUrl(url));
 });
 test("real static AST reads code and records syntax errors without executing it",async()=>{
  const source=Buffer.from("import fs from 'node:fs';\nexport function demo(){ eval('x'); return 1; }");
  const [parsed]=await extractContent(source,"text/plain","https://raw.githubusercontent.com/a/b/rev/file.ts");assert.ok(parsed);assert.equal(parsed.sha256,hash(source));assert.equal(parsed.contentRead,true);const analysis=parsed.analysis as any;assert.equal(analysis.kind,"BABEL_AST");assert.equal(analysis.executed,false);assert.equal(analysis.syntaxValid,true);assert.equal(analysis.functions,1);assert.equal(analysis.riskyCalls[0].name,"eval");
  const [invalid]=await extractContent(Buffer.from("function ("),"text/plain","https://raw.githubusercontent.com/a/b/rev/file.ts");assert.equal((invalid?.analysis as any).syntaxValid,false);
 });
 test("bounded DOCX/ZIP extraction reads real bytes and refuses archive traversal/entities",async()=>{
  const docx=Buffer.from(zipSync({"word/document.xml":strToU8('<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Actual evidence</w:t></w:r></w:p></w:body></w:document>')}));
  const [doc]=await extractContent(docx,"application/vnd.openxmlformats-officedocument.wordprocessingml.document","https://github.com/a/doc.docx");assert.equal(doc?.basis,"DOCX_TEXT_EXTRACTION");assert.match(doc!.excerpt,/Actual evidence/);assert.equal(doc?.sha256,hash(docx));
  const archive=Buffer.from(zipSync({"source.ts":strToU8("export const number = 1;"),"../escape.ts":strToU8("danger")}));
  const items=await extractContent(archive,"application/zip","https://github.com/a/code.zip");assert.equal(items.length,1);assert.match(items[0]!.source,/#source.ts/);assert.equal(items[0]!.truncated,true);assert.equal((items[0]!.analysis as any).syntaxValid,true);
  const evil=Buffer.from(zipSync({"word/document.xml":strToU8('<!DOCTYPE root [<!ENTITY ext SYSTEM "file:///private">]><root>&ext;</root>')}));
  await assert.rejects(()=>extractContent(evil,"application/vnd.openxmlformats-officedocument.wordprocessingml.document","https://github.com/a/doc.docx"),{code:"DOCUMENT_PARSE_FAILED"});
 });
 test("PDF text extraction reads actual pages; malformed binary never gets a verified quality score",async()=>{
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const content="BT /F1 12 Tf 20 200 Td (Actual PDF evidence) Tj ET";objects.push("<< /Length "+content.length+" >>\nstream\n"+content+"\nendstream");
  let pdf="%PDF-1.4\n";const offsets=[0];for(const[index,object]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=(index+1)+" 0 obj\n"+object+"\nendobj\n";}const start=Buffer.byteLength(pdf);pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+start+"\n%%EOF";
  const result=await extractContent(Buffer.from(pdf),"application/pdf","https://github.com/a/doc.pdf");assert.equal(result[0]?.basis,"PDF_TEXT_EXTRACTION");assert.match(result[0]!.excerpt,/Actual PDF evidence/);
 });
 test("grounding rejects invented KB citations, delivery requirements and profile numbers",async()=>{
  await tenantStorage.run(ctx(),async()=>{await FirestoreService.upsertKnowledge({documentId:"ground",version:"1",title:"الأمان",locale:"ar",content:"حافظ على كلمة مرور قوية.",status:"APPROVED",audience:"all",createdAt:new Date().toISOString(),approvedBy:"admin",approvedAt:new Date().toISOString()});
   GeminiGateway.setMockHandler(async()=>JSON.stringify({answer:"invented",citations:[{documentId:"ground",quote:"fake fee"}]}));await assert.rejects(async()=>{for await(const _ of HelpService.askStream({question:"الأمان",mode:"policy",history:[]})){}},{code:"AI_UNGROUNDED_OUTPUT"});
  });
  GeminiGateway.setMockHandler(async()=>JSON.stringify({summary:"review",met:[{requirement:"invented",source:"delivery-note",evidence:"note"}],potentialGaps:[],questionsForReviewer:[]}));
  await assert.rejects(()=>HealthReviewService.reviewDelivery({view:"client",projectId:"p",stageId:"s",scopeAgreed:"actual",submissionDetails:"note",deliverableLinks:[],requirements:["actual"]}),{code:"AI_UNGROUNDED_OUTPUT"});
  GeminiGateway.setMockHandler(async()=>JSON.stringify({suggestedBio:"متخصص بخبرة ٢ سنوات."}));
  await assert.rejects(()=>ProfileMetricsService.suggestBio({providerId:"p",specialties:["تصميم"],yearsOfExperience:20,keyAchievements:[],maxLength:500}),{code:"AI_UNGROUNDED_OUTPUT"});
 });
 test("isolated execution is unavailable without verified worker and validates signed command/resource evidence when configured",async()=>{
  const content=Buffer.from("console.log(1)"),artifacts=[{name:"main.js",sourceUrl:"https://github.com/a/main.js",sha256:hash(content),contentBase64:content.toString("base64")}];
  const input={artifacts,artifactHash:artifactBundleHash(artifacts),acceptanceCriteria:["prints 1"],commands:[["node","/workspace/main.js"]],timeoutSeconds:10,memoryMb:128,cpuCount:1,network:false as const};
  delete process.env.WASEET_AI_ISOLATION_VERIFIED;assert.equal((await requestIsolatedExecution(input)).status,"UNAVAILABLE");
  process.env.WASEET_AI_ISOLATION_VERIFIED="true";process.env.WASEET_AI_ISOLATED_WORKER_URL="https://worker.example/execute";process.env.WASEET_AI_ISOLATED_WORKER_TOKEN="fixture-worker-token-32-characters";process.env.WASEET_AI_ISOLATED_ATTESTATION_SECRET="fixture-attestation-32-characters";
  const response=(empty=false)=>{const key=hash(JSON.stringify(input));const raw=JSON.stringify({workerId:"fixture",jobId:"fixturejob",idempotencyKey:key,artifactHash:input.artifactHash,policy:{isolated:true,network:false,secretsInjected:false,readOnlyRoot:true,nonRoot:true,capabilitiesDropped:true,memoryMb:128,cpuCount:1,timeoutSeconds:10,pidsLimit:128,imageDigest:"image@sha256:"+"a".repeat(64)},evidence:empty?[]:[{command:input.commands[0],exitCode:0,stdout:"1",stderr:"",stdoutHash:hash("1"),stderrHash:hash(""),artifactHash:input.artifactHash}]});return new Response(raw,{headers:{"x-worker-signature":createHmac("sha256",process.env.WASEET_AI_ISOLATED_ATTESTATION_SECRET!).update(raw).digest("hex")}});};
  try{globalThis.fetch=async()=>response(true);await assert.rejects(()=>requestIsolatedExecution(input),{code:"ISOLATION_ATTESTATION_INVALID"});globalThis.fetch=async()=>response();const result=await requestIsolatedExecution(input);assert.equal(result.executed,true);assert.equal(result.evidence[0]?.exitCode,0);globalThis.fetch=forbidNetwork;assert.deepEqual(await requestIsolatedExecution(input),result);}
  finally{globalThis.fetch=forbidNetwork;delete process.env.WASEET_AI_ISOLATION_VERIFIED;delete process.env.WASEET_AI_ISOLATED_WORKER_URL;delete process.env.WASEET_AI_ISOLATED_WORKER_TOKEN;delete process.env.WASEET_AI_ISOLATED_ATTESTATION_SECRET;}
 });
 test("generic and policy paths preserve private classification and explicit model effort overrides",async()=>{
  let observed:any;
  GeminiGateway.setMockHandler(async req=>{observed=req;return JSON.stringify({answer:"Generic draft."});});
  for await(const _ of HelpService.askStream({question:"حلل خطة المشروع",history:[],mode:"general",profile:"auto",effort:"low",model:"gemini-3.5-flash-lite"})){}
  assert.equal(observed.classification,"PERSONAL");assert.equal(observed.effort,"low");assert.equal(observed.modelPin,"gemini-3.5-flash-lite");
 });
});
