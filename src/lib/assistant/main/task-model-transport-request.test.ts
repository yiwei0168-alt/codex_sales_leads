import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {createConfiguredTaskModeRequest,taskTransportSigningConfigured} from './task-model-transport-request';
import {verifyConfiguredTaskTransportReceipt} from './task-model-transport-receipt';
import {verifyConfiguredTaskTransportFailure} from './task-model-transport-failure-receipt';
import {modeTransportFailure} from './mode-transport-failure';
import {OpenRouterRequestError} from '@/providers/openrouter-batch';
import {ModelWaitError} from './model-stream';
const m=vi.hoisted(()=>{const native=vi.fn();vi.stubGlobal('fetch',native);return {native,rpc:vi.fn(),query:vi.fn(),spend:undefined as unknown,registry:undefined as unknown};});
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query:m.query})}));
vi.mock('@/lib/billing/context',()=>({currentSpendContext:()=>m.spend}));
vi.mock('@/providers/openrouter',()=>({getOpenRouterConfig:()=>({baseUrl:'https://openrouter.ai/api/v1'})}));
vi.mock('undici',()=>({fetch:(...args:unknown[])=>m.native(...args),ProxyAgent:class {constructor(public url:string){}}}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>m.registry}));
vi.mock('./model',async original=>({...await original<typeof import('./model')>(),requestModeModel:m.rpc}));
const pair=generateKeyPairSync('ed25519'),context={userId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222'};
const input={callId:'33333333-3333-4333-8333-333333333333',callKey:'mode-model:0:0:0'};
const request={messages:[{role:'user' as const,content:'Synthetic original request'}],profile:modeModelConfig('quick').profile!,index:0};
const row=()=>({input:request,input_hash:digest(request),task_created_at:'2026-10-17T00:00:00.000Z',call_started_at:'2026-10-17T00:59:00.000Z'});
const endpoint='https://openrouter.ai/api/v1/chat/completions';let directory:string,originalArgv:string[];
function response(status=200){const value=new Response(status===204?null:'{}',{status});Object.defineProperty(value,'url',{value:endpoint});return value;}
beforeEach(async()=>{
 originalArgv=process.execArgv;process.execArgv=[];vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17T01:00:00.000Z'));
 vi.stubEnv('NODE_ENV','production');for(const key of ['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_USE_SYSTEM_CA','NODE_TLS_REJECT_UNAUTHORIZED'])vi.stubEnv(key,'');
 vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:18080');
 directory=await mkdtemp(join(tmpdir(),'original-task-transport-'));const path=join(directory,'ephemeral.pem');
 await writeFile(path,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 vi.stubEnv('TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE',path);vi.stubEnv('TASK_MODEL_TRANSPORT_KEY_ID','test-task');
 vi.stubEnv('TASK_MODEL_TRANSPORT_COLLECTOR_ID','synthetic-web');vi.stubEnv('TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256',digest('deployment'));
 m.registry={protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'test-task',collectorId:'synthetic-web',deploymentHash:digest('deployment'),
  enabled:true,purposes:['task-model-transport'],publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),
  notBefore:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-18T00:00:00.000Z'}]};
 m.spend={userId:context.userId,operationId:context.runId,stage:'main-agent'};m.query.mockReset().mockImplementation(async()=>({rows:[row()]}));
 m.native.mockReset().mockResolvedValue(response());m.rpc.mockReset().mockImplementation(async(messages,profile,index,transport)=>{
  const route=profile.routes[index],body={model:route.model,messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  await transport(endpoint,{method:'POST',redirect:'error',body:JSON.stringify(body),headers:{Authorization:'Bearer TEST_ONLY'}});
  return {message:{role:'assistant',content:'Synthetic response'},requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:'synthetic-generation'})};
 });
});
afterEach(async()=>{process.execArgv=originalArgv;vi.useRealTimers();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
it('binds the owned started call to one observed request and an independently verifiable signature',async()=>{
 const run=await createConfiguredTaskModeRequest(context,input),output=await run(request.messages,request.profile,request.index);
 const s=output.transportReceipt.statement;
 expect(s).toMatchObject({ownerId:context.userId,runId:context.runId,callId:input.callId,inputHash:digest(request),status:200});
 expect(m.query.mock.calls[0][1]).toEqual([input.callId,context.userId,context.runId,input.callKey]);
 const {ownerId,runId,callId,callKey,inputHash,collectorId,deploymentHash}=s;
 expect(await verifyConfiguredTaskTransportReceipt(output.transportReceipt,{binding:{ownerId,runId,callId,callKey,inputHash,collectorId,deploymentHash},
  manifest:output.requestManifest,message:output.message,taskCreatedAt:row().task_created_at,callStartedAt:row().call_started_at,callCompletedAt:s.completedAt})).toMatchObject({taskTransportSignatureVerified:true,automaticActivation:false});
 expect(JSON.stringify(output.transportReceipt)).not.toContain('TEST_ONLY');
 await expect(run(request.messages,request.profile,request.index)).rejects.toThrow('already invoked');expect(m.native).toHaveBeenCalledTimes(1);
});
it('rejects missing owned calls before the model is invoked',async()=>{
 m.query.mockResolvedValue({rows:[]});await expect(createConfiguredTaskModeRequest(context,input)).rejects.toThrow('stored call');expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects different request inputs before network',async()=>{
 const run=await createConfiguredTaskModeRequest(context,input);await expect(run([{role:'user',content:'Changed'}],request.profile,0)).rejects.toThrow('input changed');expect(m.native).not.toHaveBeenCalled();
});
it('rejects process injection and unowned billing scopes',async()=>{
 vi.stubEnv('NODE_OPTIONS','--require injected.cjs');await expect(createConfiguredTaskModeRequest(context,input)).rejects.toThrow('Controlled production');
 vi.stubEnv('NODE_OPTIONS','');m.spend=undefined;await expect(createConfiguredTaskModeRequest(context,input)).rejects.toThrow('paid-call scope');expect(m.native).not.toHaveBeenCalled();
});
it.each([201,204,500])('does not sign actual HTTP %s',async status=>{
 m.native.mockResolvedValue(response(status));const run=await createConfiguredTaskModeRequest(context,input);await expect(run(request.messages,request.profile,0)).rejects.toThrow('request or trust changed');
});
it('rejects a fabricated response without a network observation',async()=>{
 m.rpc.mockResolvedValue({message:{role:'assistant',content:'fabricated'},requestManifest:{}});
 const run=await createConfiguredTaskModeRequest(context,input);await expect(run(request.messages,request.profile,0)).rejects.toThrow('request or trust changed');
});
it('rejects enrollment removal or database mutation during the call',async()=>{
 const run=await createConfiguredTaskModeRequest(context,input);
 m.native.mockImplementation(async()=>{(m.registry as {keys:Array<{enabled:boolean}>}).keys[0].enabled=false;return response();});
 await expect(run(request.messages,request.profile,0)).rejects.toThrow('enrollment');
});
it('rejects call changes after transport',async()=>{
 const run=await createConfiguredTaskModeRequest(context,input);
 m.native.mockImplementation(async()=>{m.query.mockResolvedValue({rows:[]});return response();});
 await expect(run(request.messages,request.profile,0)).rejects.toThrow('stored call');
});
it('treats partial configuration as configured so it cannot silently fall back to unsigned mode',()=>{
 expect(taskTransportSigningConfigured()).toBe(true);for(const key of ['TASK_MODEL_TRANSPORT_KEY_ID','TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE','TASK_MODEL_TRANSPORT_COLLECTOR_ID','TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256'])vi.stubEnv(key,'');
 expect(taskTransportSigningConfigured()).toBe(false);vi.stubEnv('TASK_MODEL_TRANSPORT_KEY_ID','partial');expect(taskTransportSigningConfigured()).toBe(true);
});
it.each(['http','connection','timeout'] as const)('signs an observed retryable %s failure and verifies against the stored request',async kind=>{
 const original=m.rpc.getMockImplementation()!,error=kind==='http'?new OpenRouterRequestError(503,'provider-unavailable'):kind==='timeout'?new ModelWaitError('total'):Object.assign(new Error('synthetic connection'),{code:'ECONNREFUSED'});
 if(kind==='http')m.native.mockResolvedValue(response(503));
 if(kind==='connection')m.native.mockRejectedValue(error);
 m.rpc.mockImplementation(async(...args)=>{await original(...args);throw error;});
 const run=await createConfiguredTaskModeRequest(context,input);await expect(run(request.messages,request.profile,0)).rejects.toBe(error);
 const envelope=modeTransportFailure(error) as {statement:Record<string,unknown>;signature:string};
 expect(envelope.statement.protocol).toBe('task-model-transport-failure-v1');
 const binding={ownerId:context.userId,runId:context.runId,...input,inputHash:digest(request),collectorId:'synthetic-web',deploymentHash:digest('deployment')};
 const expected={binding,request,reason:kind==='http'?'http-503':kind==='timeout'?'timeout-total':'connection-failed',
  taskCreatedAt:row().task_created_at,callStartedAt:row().call_started_at,callCompletedAt:new Date().toISOString()};
 expect(await verifyConfiguredTaskTransportFailure(envelope,expected)).toMatchObject({taskTransportFailureSignatureVerified:true,completeTaskProvenanceVerified:false,automaticActivation:false});
 await expect(verifyConfiguredTaskTransportFailure(envelope,{...expected,reason:'http-500'})).rejects.toThrow('outcome');
 await expect(verifyConfiguredTaskTransportFailure(envelope,{...expected,binding:{...binding,runId:input.callId}})).rejects.toThrow('binding');
 await expect(verifyConfiguredTaskTransportFailure(envelope,{...expected,callCompletedAt:'2026-10-17T00:59:01.000Z'})).rejects.toThrow('time');
 await expect(verifyConfiguredTaskTransportFailure({...envelope,signature:'A'.repeat(86)},expected)).rejects.toThrow('signature');
 const registry=m.registry as {keys:Array<{purposes:string[];enabled:boolean}>};registry.keys[0].purposes=['model-transport'];
 await expect(verifyConfiguredTaskTransportFailure(envelope,expected)).rejects.toThrow('trust');
});
it.each(['unobserved','cancelled','revoked','changed-status','unknown'] as const)('keeps %s failures unsigned and preserves the original error',async kind=>{
 const original=m.rpc.getMockImplementation()!,error=kind==='unknown'?new Error('unknown'):new OpenRouterRequestError(503,'provider-unavailable');
 const controller=new AbortController();
 m.native.mockResolvedValue(response(kind==='changed-status'?200:503));
 m.rpc.mockImplementation(async(...args)=>{
  if(kind!=='unobserved')await original(...args);
  if(kind==='cancelled')controller.abort();
  if(kind==='revoked')(m.registry as {keys:Array<{enabled:boolean}>}).keys[0].enabled=false;
  throw error;
 });
 const run=await createConfiguredTaskModeRequest(context,input);await expect(run(request.messages,request.profile,0,controller.signal)).rejects.toBe(error);
 expect(modeTransportFailure(error)).toBeUndefined();
});
