import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {createConfiguredSkillTransportRequest} from './skill-model-transport-request';
import type {SkillCandidateCollector,SkillCandidateRequest} from './skill-candidate-model';

const mocks=vi.hoisted(()=>{
 const native=vi.fn();vi.stubGlobal('fetch',native);
 return {native,rpc:vi.fn(),freeze:vi.fn(),registry:undefined as unknown};
});
vi.mock('./model',async importOriginal=>({...await importOriginal<typeof import('./model')>(),requestModeModel:mocks.rpc}));
vi.mock('@/providers/openrouter',async importOriginal=>({...await importOriginal<typeof import('@/providers/openrouter')>(),getOpenRouterConfig:()=>({baseUrl:'https://openrouter.ai/api/v1'})}));
vi.mock('@/lib/network/model-transport',()=>({modelRoutedTransport:(transport:typeof fetch)=>transport}));
vi.mock('./skill-acceptance-freeze',()=>({requireSkillAcceptanceFreeze:mocks.freeze}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>mocks.registry}));
const pair=generateKeyPairSync('ed25519'),ownerId='11111111-1111-4111-8111-111111111111';
const frozen={freezeId:'33333333-3333-4333-8333-333333333333',plan:{pin:{ownerId},identity:{toolSchemaHash:digest(modelFunctions)},
 frozenAt:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z'}} as NonNullable<SkillCandidateCollector['frozen']>;
const input={evaluationId:'22222222-2222-4222-8222-222222222222',arm:'candidate' as const,snapshotHash:digest('snapshot'),frozen};
const request={messages:[{role:'user',content:'Synthetic'}],profile:modeModelConfig('quick').profile!,step:0,index:0,signal:new AbortController().signal} as Parameters<SkillCandidateRequest>[0];
const endpoint='https://openrouter.ai/api/v1/chat/completions';
let directory:string,originalArgv:string[];
function response(status=200,url=endpoint){const result=new Response(status===204?null:'{}',{status});Object.defineProperty(result,'url',{value:url});return result;}
beforeEach(async()=>{
 originalArgv=process.execArgv;process.execArgv=[];vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T01:00:00.000Z'));
 vi.stubEnv('NODE_ENV','production');for(const key of ['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_USE_SYSTEM_CA','NODE_TLS_REJECT_UNAUTHORIZED'])vi.stubEnv(key,'');
 directory=await mkdtemp(join(tmpdir(),'skill-transport-test-'));const path=join(directory,'ephemeral.pem');
 await writeFile(path,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 vi.stubEnv('SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE',path);vi.stubEnv('SKILL_MODEL_TRANSPORT_KEY_ID','test-key');
 vi.stubEnv('SKILL_RUNNER_COLLECTOR_ID','test-collector');vi.stubEnv('SKILL_RUNNER_DEPLOYMENT_SHA256',digest('deployment'));
 mocks.registry={protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'test-key',collectorId:'test-collector',deploymentHash:digest('deployment'),
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,purposes:['model-transport'],notBefore:'2026-10-15T00:00:00.000Z',expiresAt:frozen.plan.expiresAt}]};
 mocks.native.mockReset().mockResolvedValue(response());mocks.freeze.mockReset();mocks.rpc.mockReset();
 mocks.rpc.mockImplementation(async(messages,profile,index,transport)=>{
  const route=profile.routes[index],body={model:route.model,messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  await transport(endpoint,{method:'POST',redirect:'error',body:JSON.stringify(body),headers:{Authorization:'Bearer TEST_ONLY'}});
  return {message:{role:'assistant',content:'Synthetic reply'},requestManifest:modelRequestManifest(body,{model:route.model,provider:'fixture',id:'fixture-generation'})};
 });
});
afterEach(async()=>{process.execArgv=originalArgv;vi.useRealTimers();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
it('signs only after the model adapter invokes the guarded transport',async()=>{
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input),output=await run(request);
 expect(output.transportReceipt).toMatchObject({statement:{status:200,ownerId,step:0,routeIndex:0}});
 expect(mocks.native).toHaveBeenCalledTimes(1);expect(mocks.freeze).toHaveBeenCalledTimes(3);
 expect(JSON.stringify(output.transportReceipt)).not.toContain('TEST_ONLY');
});
it.each([201,204,500])('does not sign actual HTTP %s responses',async status=>{
 mocks.native.mockResolvedValue(response(status));
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);
 await expect(run(request)).rejects.toThrow('request or trust changed');
});
it('rejects a response from another origin',async()=>{
 mocks.native.mockResolvedValue(response(200,'https://example.com/redirect'));
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);await expect(run(request)).rejects.toThrow('origin changed');
});
it('rejects fabricated output without an observed transport request',async()=>{
 mocks.rpc.mockResolvedValue({message:{role:'assistant',content:'Fabricated'},requestManifest:{}});
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);await expect(run(request)).rejects.toThrow('request or trust changed');
 expect(mocks.native).not.toHaveBeenCalled();
});
it('rejects process injection settings before loading a key or calling the model',async()=>{
 vi.stubEnv('NODE_OPTIONS','--require injected.cjs');
 await expect(createConfiguredSkillTransportRequest({userId:ownerId},input)).rejects.toThrow('Controlled production');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rechecks freeze validity after transport before signing',async()=>{
 mocks.freeze.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Freeze revoked'));
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);await expect(run(request)).rejects.toThrow('Freeze revoked');
});
it('rejects key revocation during the model call',async()=>{
 mocks.native.mockImplementation(async()=>{
  (mocks.registry as {keys:Array<{enabled:boolean}>}).keys[0].enabled=false;return response();
 });
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);await expect(run(request)).rejects.toThrow('enrollment unavailable');
});
it('rejects an injected request destination without sending network traffic',async()=>{
 mocks.rpc.mockImplementation(async(_messages,_profile,_index,transport)=>transport('https://example.com',{method:'POST',redirect:'error',body:'{}'}));
 const run=await createConfiguredSkillTransportRequest({userId:ownerId},input);await expect(run(request)).rejects.toThrow('request boundary');
 expect(mocks.native).not.toHaveBeenCalled();
});
