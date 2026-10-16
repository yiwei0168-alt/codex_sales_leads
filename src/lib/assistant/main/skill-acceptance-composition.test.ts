import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from './skill-acceptance-policy';
const m=vi.hoisted(()=>({read:vi.fn(),material:vi.fn(),collector:vi.fn(),freeze:vi.fn(),query:vi.fn()}));
vi.mock('./skill-acceptance-store',()=>({readSkillAcceptanceEvidence:m.read}));
vi.mock('./skill-acceptance-review',()=>({readSkillAcceptanceReviewCase:m.material}));
vi.mock('./skill-model-journal',()=>({assertSkillCollector:m.collector}));
vi.mock('./skill-acceptance-freeze',()=>({inspectLockedSkillAcceptanceFreeze:m.freeze}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
import {composeSkillAcceptanceEvidence} from './skill-acceptance-composition';
const owner='11111111-1111-4111-8111-111111111111',skill='22222222-2222-4222-8222-222222222222',freezeId='33333333-3333-4333-8333-333333333333';
const ids=['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
function fixture(){
 const h=digest('synthetic'),pin={ownerId:owner,skillId:skill,version:1,contentHash:h,sourceHash:h};
 const identity={runtimeHash:h,promptHash:h,toolSchemaHash:h,modelConfigHash:h,scopeHash:h};
 const plan=skillAcceptancePlanSchema.parse({protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:'2026-10-16T00:00:00Z',expiresAt:'2026-10-16T02:00:00Z',
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:h,sourceHash:h,provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
 const arm={state:'completed',stopReason:null,answerHash:h,evidenceHash:h,modelReceiptHashes:[h],requestedModel:'synthetic',actualModel:'synthetic',provider:'synthetic',identity,unexpectedEffects:0};
 return [['replay'],['negative','injection','permissions'],['shadow']].map((cases,index)=>{
  const observations=plan.cases.filter(item=>cases.includes(item.id)).map(item=>skillAcceptanceObservationSchema.parse({caseId:item.id,planHash:digest(plan),pin,inputHash:h,sourceHash:h,provenance:item.provenance,
   capturedAt:'2026-10-16T00:01:00Z',completedAt:'2026-10-16T00:03:00Z',taskStartedAt:item.id==='shadow'?'2026-10-16T00:02:00Z':null,sourceCurrent:true,baseline:arm,candidate:arm}));
  const refs=Object.fromEntries(cases.map(id=>[id,{syntheticReference:id}]));
  const artifact={sourceKind:'synthetic-fixture' as string,plan:structuredClone(plan),observations,rawReceipts:{baselineSources:refs,candidateSources:refs,safetySources:refs,prospectiveSources:refs,collector:{freezeId,runtimeIdentityVerified:true,automaticActivation:true}}};
  return {id:ids[index],artifact,artifactHash:digest(artifact),sourcesCurrent:true,freezeStatus:{state:'active',freezeId},judgments:[] as Array<{revision:number}>,automaticActivation:false};
 });
}
let bundles:ReturnType<typeof fixture>,stored:Record<string,unknown>|undefined;
const context={userId:owner};
const transaction=async<T>(_owner:string,work:(client:never)=>Promise<T>)=>work({query:m.query} as never);
beforeEach(()=>{
 vi.clearAllMocks();bundles=fixture();stored=undefined;
 m.collector.mockResolvedValue(undefined);m.freeze.mockResolvedValue('active');
 m.read.mockImplementation(async(_context,id)=>{const row=bundles.find(row=>row.id===id);if(!row)throw Error('unavailable');return structuredClone(row);});
 m.material.mockImplementation(async(_context,input)=>{const row=bundles.find(row=>row.id===input.bundleId)!;return {artifactHash:row.artifactHash,observationHash:digest(row.artifact.observations.find(item=>item.caseId===input.caseId)),sourceKind:row.artifact.sourceKind};});
 m.query.mockImplementation(async(sql:string,args:unknown[])=>{
  if(sql.startsWith('insert')){stored={id:'77777777-7777-4777-8777-777777777777',source_kind:args[3],plan:JSON.parse(args[4] as string),observations:JSON.parse(args[5] as string),raw_receipts:JSON.parse(args[6] as string)};return {rows:[]};}
  if(sql.includes('where id=$1')){const row=bundles.find(row=>row.id===args[0])!;return {rows:[{source_kind:row.artifact.sourceKind,plan:row.artifact.plan,observations:row.artifact.observations,raw_receipts:row.artifact.rawReceipts,artifact_hash:row.artifactHash}]};}
  return {rows:stored?[stored]:[]};
 });
});
it('composes all planned cases in plan order without inheriting review or activation trust',async()=>{
 bundles[0].judgments.push({revision:99});
 const result=await composeSkillAcceptanceEvidence(context,{bundleIds:[...ids].reverse()},transaction);
 expect(result).toMatchObject({collectedCases:5,requiresNewHumanReview:true,automaticActivation:false,collectorProvenanceVerified:false});
 expect((stored!.observations as Array<{caseId:string}>).map(row=>row.caseId)).toEqual(['replay','negative','injection','permissions','shadow']);
 const receipts=stored!.raw_receipts as Record<string,unknown>;
 expect(receipts).not.toHaveProperty('judgments');expect(receipts).not.toHaveProperty('attestation');
 expect(receipts.collector).toMatchObject({runtimeIdentityVerified:false,freezeId});expect(m.material).toHaveBeenCalledTimes(5);
 const hash=result.artifactHash;expect((await composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).artifactHash).toBe(hash);
});
it('preserves pending source classification without granting production authenticity',async()=>{
 for(const row of bundles){row.artifact.sourceKind='production-runner-pending-verification';row.artifactHash=digest(row.artifact);}
 const result=await composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction);
 expect(stored!.source_kind).toBe('production-runner-pending-verification');expect(result.productionAgentEquivalent).toBe(false);
});
it.each(['source','plan','freeze','inactive','revoked-source'] as const)('rejects component %s drift',async kind=>{
 if(kind==='source')bundles[1].artifact.sourceKind='production-runner-pending-verification';
 if(kind==='plan')bundles[1].artifact.plan.identity.runtimeHash=digest('changed');
 if(kind==='freeze')bundles[1].freezeStatus.freezeId=skill;
 if(kind==='inactive')bundles[1].freezeStatus.state='revoked';
 if(kind==='revoked-source')bundles[1].sourcesCurrent=false;
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('changed');expect(stored).toBeUndefined();
});
it('rejects missing cases, overlapping cases and duplicate bundle selection',async()=>{
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids.slice(0,2)},transaction)).rejects.toThrow('missing');
 bundles[1].artifact.observations.push(bundles[0].artifact.observations[0]);
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('duplicate');
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:[ids[0],ids[0]]},transaction)).rejects.toThrow();expect(stored).toBeUndefined();
});
it('rejects stale rebuilt material, missing references, changed state and inactive write-time freeze',async()=>{
 m.material.mockResolvedValueOnce({artifactHash:digest('wrong')});await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('material');
 delete (bundles[0].artifact.rawReceipts.baselineSources as Record<string,unknown>).replay;
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('reference');
 bundles=fixture();m.read.mockImplementationOnce(async()=>({...bundles[0],judgments:[{revision:1}]}));
 await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('during preparation');
 m.freeze.mockResolvedValue('revoked');await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('inactive');expect(stored).toBeUndefined();
});
it('requires the dedicated collector and detects transaction source corruption',async()=>{
 m.collector.mockRejectedValueOnce(Error('restricted collector'));await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('collector');
 m.query.mockResolvedValueOnce({rows:[]});await expect(composeSkillAcceptanceEvidence(context,{bundleIds:ids},transaction)).rejects.toThrow('stored source');expect(stored).toBeUndefined();
});
