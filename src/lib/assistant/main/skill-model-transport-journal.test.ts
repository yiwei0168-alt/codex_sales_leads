import {generateKeyPairSync,sign} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {skillTransportResponseHash} from './skill-model-transport-receipt';
import {verifySkillCandidateJournalTransports} from './skill-model-transport-journal';
import type {SkillModelAuditRow} from './skill-candidate-audit';
import type {SkillCandidateCollector} from './skill-candidate-model';

const mocks=vi.hoisted(()=>({query:vi.fn(),freeze:vi.fn(),registry:undefined as unknown}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.query}));
vi.mock('./skill-acceptance-freeze',()=>({requireSkillAcceptanceFreeze:mocks.freeze}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>mocks.registry}));
const pair=generateKeyPairSync('ed25519');
const context={userId:'11111111-1111-4111-8111-111111111111'},input={evaluationId:'22222222-2222-4222-8222-222222222222',arm:'candidate' as const};
const frozen={freezeId:'33333333-3333-4333-8333-333333333333',plan:{frozenAt:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z'}} as NonNullable<SkillCandidateCollector['frozen']>;
function fixture(step=0,generation=`generation-${step}`):SkillModelAuditRow{
 const profile=modeModelConfig('quick').profile!,messages=[{role:'user',content:'Synthetic request'}],route=profile.routes[0];
 const request={profile,messages,index:0},body={model:route.model,messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
 const message={role:'assistant',content:'Synthetic answer'},manifest=modelRequestManifest(body,{model:route.model,provider:'fixture',id:generation});
 const statement={protocol:'skill-model-transport-v1',keyId:'test-key',ownerId:context.userId,freezeId:frozen.freezeId,...input,
  planHash:digest(frozen.plan),snapshotHash:digest('snapshot'),step,routeIndex:0,collectorId:'test-collector',deploymentHash:digest('deployment'),
  requestHash:manifest.requestHash,manifestHash:digest(manifest),responseHash:skillTransportResponseHash(message),origin:'https://openrouter.ai',
  path:'/api/v1/chat/completions',status:200,capturedAt:'2026-10-16T00:01:00.000Z',completedAt:'2026-10-16T00:02:00.000Z',expiresAt:frozen.plan.expiresAt};
 const transportReceipt={statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')};
 const output={status:'success',data:{value:{message,requestManifest:manifest,transportReceipt}}};
 return {id:`row-${step}`,owner_id:context.userId,evaluation_id:input.evaluationId,arm:input.arm,step,route_index:0,source_kind:'production-runner-pending-verification',
  freeze_id:frozen.freezeId,snapshot_hash:digest('snapshot'),input:request,input_hash:digest(request),output,output_hash:digest(output),
  started_at:'2026-10-16T00:00:59.000Z',completed_at:'2026-10-16T00:02:01.000Z'};
}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T01:00:00.000Z'));mocks.query.mockReset();mocks.freeze.mockReset();
 vi.stubEnv('SKILL_RUNNER_COLLECTOR_ID','test-collector');vi.stubEnv('SKILL_RUNNER_DEPLOYMENT_SHA256',digest('deployment'));
 mocks.registry={protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'test-key',collectorId:'test-collector',deploymentHash:digest('deployment'),
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,purposes:['model-transport'],
  notBefore:'2026-10-15T00:00:00.000Z',expiresAt:frozen.plan.expiresAt}]};
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('loads tenant-scoped persisted records and verifies receipts with the real journal audit',async()=>{
 mocks.query.mockResolvedValue([fixture()]);
 expect(await verifySkillCandidateJournalTransports(context,input,frozen)).toMatchObject({signedSuccessfulTransportsVerified:true,binaryVerified:false,automaticActivation:false});
 expect(mocks.query).toHaveBeenCalledTimes(2);
 expect(mocks.query.mock.calls[0][0]).toBe(context.userId);
 expect(mocks.query.mock.calls[0][2]).toEqual([context.userId,input.evaluationId,input.arm]);
});
it.each(['synthetic','wrong-freeze','missing-start','missing-end','late-start','early-end','wrong-owner'] as const)('rejects %s stored journal',async kind=>{
 const row=fixture();
 if(kind==='synthetic')row.source_kind='synthetic-fixture';
 if(kind==='wrong-freeze')row.freeze_id='44444444-4444-4444-8444-444444444444';
 if(kind==='missing-start')delete row.started_at;if(kind==='missing-end')delete row.completed_at;
 if(kind==='late-start')row.started_at='2026-10-16T00:01:01.000Z';if(kind==='early-end')row.completed_at='2026-10-16T00:01:59.000Z';
 if(kind==='wrong-owner')row.owner_id='other';
 mocks.query.mockResolvedValue([row]);await expect(verifySkillCandidateJournalTransports(context,input,frozen)).rejects.toThrow();
});
it('rejects reused provider generation IDs across steps',async()=>{
 mocks.query.mockResolvedValue([fixture(),fixture(1,'generation-0')]);
 await expect(verifySkillCandidateJournalTransports(context,input,frozen)).rejects.toThrow('reused');
});
it('rejects persisted records changed during verification',async()=>{
 mocks.query.mockResolvedValueOnce([fixture()]).mockResolvedValueOnce([{...fixture(),completed_at:'2026-10-16T00:03:00.000Z'}]);
 await expect(verifySkillCandidateJournalTransports(context,input,frozen)).rejects.toThrow('changed during audit');
});
it('rejects freeze revocation on the final recheck',async()=>{
 mocks.query.mockResolvedValue([fixture()]);mocks.freeze.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Freeze revoked'));
 await expect(verifySkillCandidateJournalTransports(context,input,frozen)).rejects.toThrow('Freeze revoked');
});
