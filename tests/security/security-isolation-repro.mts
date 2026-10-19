import fs from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { env } from '../../src/core/config/env.ts';
import { SocketBridge } from '../../src/bridge/socket-bridge.ts';
import { GeminiGateway } from '../../src/router/gemini-gateway.ts';
import { SmartRouter } from '../../src/router/smart-router.ts';
import { ProjectPoolManager } from '../../src/router/project-pool.manager.ts';
import { FirestoreService } from '../../src/core/database/firestore.ts';
import { HelpService } from '../../src/features/help/help.service.ts';
import { io } from 'socket.io-client';

globalThis.fetch = async () => { throw new Error('Outbound fetch blocked in review'); };
env.WASEET_AI_CLIENT_SECRET = 'review-only-configured-secret';
const source = await fs.readFile(new URL('../../src/app.ts', import.meta.url), 'utf8');
const builtinToken = source.match(/dev:\s*"([^"]+)"/)?.[1];
if (!builtinToken) throw new Error('Expected source fixture missing');
const app = buildApp();
const authResult = await app.inject({method:'GET',url:'/v1/knowledge/documents/doc-escrow-01/status',headers:{authorization:`Bearer ${builtinToken}`}});
const issueResult = await app.inject({method:'POST',url:'/v1/auth/token',payload:{clientId:env.WASEET_AI_CLIENT_ID,clientSecret:builtinToken,environment:'dev'}});
const firstIssued = issueResult.json();
const issueAgain = await app.inject({method:'POST',url:'/v1/auth/token',payload:{clientId:env.WASEET_AI_CLIENT_ID,clientSecret:builtinToken,environment:'dev'}});

GeminiGateway.setMockHandler(async () => 'synthetic review response');
const server = SocketBridge.initSocketIOServer(app.server);
const address = await app.listen({host:'127.0.0.1',port:0});
const socket = io(address,{transports:['websocket'],query:{userId:'another-user'},reconnection:false});
const socketEvent = await new Promise<string>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Socket review timeout')),3000);
  socket.on('connect',()=>socket.emit('ai:generate_description',{title:'synthetic review title'}));
  socket.on('ai:description_complete',()=>{clearTimeout(timer);resolve('ai:description_complete');});
  socket.on('connect_error',reject);
});
socket.disconnect();
await new Promise<void>(resolve=>server.close(()=>resolve()));
await app.close();

FirestoreService.clear();
await FirestoreService.upsertKnowledge({documentId:'private-review-doc',version:'1',title:'review-marker',locale:'ar',content:'review-marker admin-only synthetic policy',status:'APPROVED',audience:'admin',createdAt:new Date().toISOString()});
let capturedClassification='';
let capturedAdminDoc=false;
GeminiGateway.setMockHandler(async request=>{capturedClassification=request.classification;capturedAdminDoc=request.prompt.includes('admin-only');return 'synthetic answer';});
for await(const item of HelpService.askStream({question:'review-marker',history:[]})) {}
GeminiGateway.setMockHandler(null);

ProjectPoolManager.resetCooldowns();
let attemptedFree=0,attemptedPaid=0,routerOutcome='';
try {
  await SmartRouter.executeWithFailover('LIGHT','PUBLIC_APPROVED',async project=>{
    if(project.tier==='PAID'){attemptedPaid++;return 'synthetic paid success';}
    attemptedFree++;throw {status:429,message:'synthetic rate limit'};
  });
  routerOutcome='success';
} catch(error) {routerOutcome=(error as Error).message;}
ProjectPoolManager.resetCooldowns();
console.log(JSON.stringify({
  hardcodedBearerAcceptedWithDifferentConfiguredSecret:authResult.statusCode,
  tokenEndpointReturnsSameReusableToken:firstIssued.token===issueAgain.json().token,
  tokenExpiryAdvertised:firstIssued.expiresIn,
  unauthenticatedSocketResult:socketEvent,
  helpIncludedAdminOnlyDocument:capturedAdminDoc,
  helpClassification:capturedClassification,
  defaultRouterAttempts:{attemptedFree,attemptedPaid,outcome:routerOutcome},
  outboundProviderRequests:0
},null,2));
