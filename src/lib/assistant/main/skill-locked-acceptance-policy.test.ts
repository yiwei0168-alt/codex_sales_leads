import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {evaluateLockedSkillAcceptancePolicy} from './skill-locked-acceptance-policy';
const m=vi.hoisted(()=>({read:vi.fn(),identity:vi.fn(),query:vi.fn()}));
vi.mock('./skill-acceptance-store',()=>({readLockedSkillAcceptanceEvidence:m.read}));
vi.mock('./skill-runtime-identity',()=>({prepareSkillExecutionIdentity:m.identity}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
const owner='11111111-1111-4111-8111-111111111111',skill='22222222-2222-4222-8222-222222222222',
 run='33333333-3333-4333-8333-333333333333',bundleId='44444444-4444-4444-8444-444444444444';
const context={userId:owner},client={query:m.query} as unknown as PoolClient;
function fixture(){
 const identity={runtimeHash:digest('runtime'),promptHash:digest('prompt'),toolSchemaHash:digest('tools'),modelConfigHash:digest('config'),scopeHash:digest('scope')};
 const pin={ownerId:owner,skillId:skill,version:1,contentHash:digest('package'),sourceHash:digest('source')};
 const plan={protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z',
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:digest(category),sourceHash:digest(`source:${category}`),
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const arm={state:'completed',stopReason:null,answerHash:digest('answer'),evidenceHash:digest('evidence'),modelReceiptHashes:[digest('receipt')],
  requestedModel:'z-ai/glm-5.3',actualModel:'z-ai/glm-5.3',provider:'synthetic',identity,unexpectedEffects:0};
 const observations=plan.cases.map(item=>({caseId:item.id,planHash:digest(plan),pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
  capturedAt:'2026-10-16T00:01:00.000Z',taskStartedAt:'2026-10-16T00:02:00.000Z',completedAt:'2026-10-16T00:03:00.000Z',sourceCurrent:true,baseline:arm,candidate:arm}));
 const verdict={answer:true,citation:true,permission:true,injection:true};
 const judgments=observations.map(item=>({caseId:item.caseId,observationHash:digest(item),reviewerId:owner,kind:'human',revision:1,revoked:false,
  baseline:verdict,candidate:verdict,rationale:'Synthetic policy-only fixture; no stored approval.'}));
 const rawReceipts={baselineSources:{replay:{runId:run}},candidateSources:{replay:{runId:run}},
  safetySources:Object.fromEntries(['negative','injection','permissions'].map(id=>[id,{runId:run}])),prospectiveSources:{shadow:{runId:run}}};
 return {artifact:{plan,observations,rawReceipts},judgments,currentPin:pin,artifactHash:digest('artifact'),latestReviewHash:digest(judgments)};
}
let data:ReturnType<typeof fixture>;
beforeEach(()=>{vi.resetAllMocks();data=fixture();m.read.mockImplementation(async()=>structuredClone(data));m.identity.mockImplementation(async()=>data.artifact.plan.identity);
 m.query.mockResolvedValue({rows:[{checked_at:new Date('2026-10-16T01:00:00.000Z')}]});});
it('uses locked server evidence, reconstructed identities and the database clock without authorizing activation',async()=>{
 const out=await evaluateLockedSkillAcceptancePolicy(client,context,bundleId);
 expect(out).toMatchObject({policyPassed:true,lockedEvidencePolicyEvaluated:true,sourcePayloadsRevalidated:false,collectorProvenanceVerified:false,automaticActivation:false});
 expect(m.identity).toHaveBeenCalledExactlyOnceWith(context,{runId:run});expect(m.read).toHaveBeenCalledTimes(2);
 expect(m.query).toHaveBeenCalledWith('select clock_timestamp() as checked_at');
});
it.each(['revoked','development','missing'] as const)('rejects %s latest judgments in the real policy',async kind=>{
 if(kind==='revoked')data.judgments[0].revoked=true;if(kind==='development')data.judgments[0].kind='assistant-development';if(kind==='missing')data.judgments=[];
 expect((await evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).policyPassed).toBe(false);
});
it('detects server runtime drift instead of reusing the planned identity',async()=>{
 m.identity.mockResolvedValue({...data.artifact.plan.identity,runtimeHash:digest('changed')});
 expect((await evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).blockers).toContain('runtime-or-configuration-changed');
});
it('rejects historical arms referring to different runs',async()=>{
 data.artifact.rawReceipts.candidateSources.replay.runId=skill;
 await expect(evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).rejects.toThrow('arm sources differ');expect(m.identity).not.toHaveBeenCalled();
});
it('rejects cases with missing server source references',async()=>{
 delete data.artifact.rawReceipts.safetySources.negative;
 await expect(evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).rejects.toThrow();
});
it('checks each distinct source run identity',async()=>{
 data.artifact.rawReceipts.prospectiveSources.shadow.runId=skill;
 m.identity.mockResolvedValueOnce(data.artifact.plan.identity).mockResolvedValueOnce({...data.artifact.plan.identity,scopeHash:digest('different')});
 await expect(evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).rejects.toThrow('source identities differ');
});
it('rejects changed evidence on the final locked read',async()=>{
 m.read.mockResolvedValueOnce(data).mockResolvedValueOnce({...data,latestReviewHash:digest('changed')});
 await expect(evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).rejects.toThrow('evidence changed');
});
it('rejects an invalid database clock',async()=>{
 m.query.mockResolvedValue({rows:[{checked_at:new Date('invalid')}]});
 await expect(evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).rejects.toThrow('database clock');
});
it('uses current database time to reject expired plans',async()=>{
 m.query.mockResolvedValue({rows:[{checked_at:new Date('2026-10-18T00:00:00.000Z')}]});
 expect((await evaluateLockedSkillAcceptancePolicy(client,context,bundleId)).blockers).toContain('plan-outside-validity');
});
