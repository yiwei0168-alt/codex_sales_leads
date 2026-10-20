import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
const m=vi.hoisted(()=>({source:vi.fn(),baseline:vi.fn(),candidate:vi.fn(),identity:vi.fn(),freeze:vi.fn(),inspect:vi.fn(),collector:vi.fn(),runtime:vi.fn()}));
vi.mock('./skill-prospective-source',()=>({prepareSkillProspectiveSource:m.source}));
vi.mock('./skill-acceptance-baseline',()=>({prepareSkillAcceptanceBaseline:m.baseline}));
vi.mock('./skill-runtime-candidate-audit',()=>({auditSkillRuntimeCandidate:m.runtime}));
vi.mock('./skill-candidate-audit',()=>({auditDurableSkillCandidate:m.candidate}));
vi.mock('./skill-runtime-identity',()=>({prepareSkillExecutionIdentity:m.identity}));
vi.mock('./skill-acceptance-freeze',()=>({requireSkillAcceptanceFreeze:m.freeze,inspectLockedSkillAcceptanceFreeze:m.inspect}));
vi.mock('./skill-model-journal',()=>({assertSkillCollector:m.collector}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
import {prepareSkillProspectiveObservation,collectSkillProspectiveAcceptance} from './skill-prospective-collector';

const owner='11111111-1111-4111-8111-111111111111',skill='22222222-2222-4222-8222-222222222222';
const freeze='33333333-3333-4333-8333-333333333333',job='44444444-4444-4444-8444-444444444444';
const evaluation='55555555-5555-4555-8555-555555555555',run='66666666-6666-4666-8666-666666666666';
const h=digest('hash'),baseReceipt=digest('base-receipt'),candidateReceipt=digest('candidate-receipt');
const identity={runtimeHash:h,promptHash:h,toolSchemaHash:h,modelConfigHash:h,scopeHash:h};
const plan=()=>({protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill,version:1,contentHash:h,sourceHash:h},identity,
 frozenAt:'2026-10-16T01:00:00.000Z',expiresAt:'2026-10-16T02:00:00.000Z',
 cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:h,sourceHash:h,
  provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
const reference={caseId:'shadow',jobId:job,evaluationId:evaluation};
const input=()=>({freezeId:freeze,plan:plan(),reference});
const source=()=>({projectionHash:digest('source-projection'),projection:{runId:run,inputHash:h,sourceHash:h,
 capturedAt:'2026-10-16T01:01:00.000Z',taskStartedAt:'2026-10-16T01:02:00.000Z',taskCompletedAt:'2026-10-16T01:03:00.000Z'}});
const baseline=()=>({projectionHash:digest('baseline-projection'),projection:{inputHash:h,modelConfigHash:h,
 answerHash:digest('baseline-answer'),evidenceHash:h,modelReceiptHashes:[baseReceipt],
 requests:[{requestedModel:'openai/gpt-6-luna',response:{model:'openai/gpt-6-luna',provider:'synthetic'},toolSchemaHash:h}]}});
const candidate=()=>({projectionHash:digest('candidate-projection'),projection:{freezeId:freeze,candidateSkillUsed:true,
 sourceKind:'synthetic-fixture',taskInputHash:h,modelConfigHash:h,capturedAt:'2026-10-16T01:04:00.000Z',completedAt:'2026-10-16T01:05:00.000Z',
 answerHash:digest('candidate-answer'),evidenceHash:h,modelAttemptReceipts:[{id:'receipt',hash:candidateReceipt}],
 selectedModels:[{step:0,requestedModel:'openai/gpt-6-luna',model:'openai/gpt-6-luna',provider:'synthetic',receiptHash:candidateReceipt,toolSchemaHash:h}]}});
beforeEach(()=>{vi.resetAllMocks();m.source.mockResolvedValue(source());m.baseline.mockResolvedValue(baseline());m.candidate.mockResolvedValue(candidate());
 m.identity.mockResolvedValue(identity);m.freeze.mockResolvedValue({});m.inspect.mockResolvedValue('active');});
it('derives both observed arms and keeps prospective capture timing and source category',async()=>{
 const out=await prepareSkillProspectiveObservation({userId:owner},input());
 expect(out).toMatchObject({sourceKind:'synthetic-fixture',automaticActivation:false,observation:{provenance:'prospective-task',
  capturedAt:source().projection.capturedAt,taskStartedAt:source().projection.taskStartedAt,
  baseline:{answerHash:baseline().projection.answerHash},candidate:{answerHash:candidate().projection.answerHash}}});
 expect(m.baseline).toHaveBeenCalledTimes(2);expect(m.candidate).toHaveBeenCalledTimes(2);expect(m.source).toHaveBeenCalledTimes(2);
});
it.each([{freezeId:job},{candidateSkillUsed:false},{taskInputHash:digest('changed')},{modelConfigHash:digest('changed')},
 {capturedAt:'2026-10-16T01:02:00.000Z'},{completedAt:'2026-10-16T02:00:00.000Z'},
 {completedAt:'invalid'},{completedAt:'2026-10-16T01:03:00.000Z'}])('rejects candidate binding or timing drift %j',async change=>{
 m.candidate.mockResolvedValue({...candidate(),projection:{...candidate().projection,...change}});
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow();
});
it('rejects current runtime drift and a baseline bound to another input',async()=>{
 m.identity.mockResolvedValue({...identity,runtimeHash:digest('changed')});
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow('runtime');
 m.identity.mockResolvedValue(identity);m.baseline.mockResolvedValue({...baseline(),projection:{...baseline().projection,inputHash:digest('changed')}});
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow('input');
});
it.each(['source','baseline','candidate'] as const)('rejects a changed %s journal on final recheck',async key=>{
 const value=key==='source'?source():key==='baseline'?baseline():candidate();
 m[key].mockResolvedValueOnce(value).mockResolvedValueOnce({...value,projectionHash:digest('changed')});
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow('changed during');
});
it('rejects missing route receipts and final freeze revocation',async()=>{
 m.candidate.mockResolvedValue({...candidate(),projection:{...candidate().projection,modelAttemptReceipts:[]}});
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow();
 m.candidate.mockResolvedValue(candidate());m.freeze.mockRejectedValue(new Error('freeze revoked'));
 await expect(prepareSkillProspectiveObservation({userId:owner},input())).rejects.toThrow('revoked');
});
it('refuses caller-supplied observations and duplicate references before collection',async()=>{
 const transaction=vi.fn();const selected={freezeId:freeze,plan:plan(),cases:[reference]};
 await expect(collectSkillProspectiveAcceptance({userId:owner},{...selected,observations:[]},transaction)).rejects.toThrow();
 await expect(collectSkillProspectiveAcceptance({userId:owner},{...selected,cases:[reference,reference]},transaction)).rejects.toThrow('binding');
 await expect(collectSkillProspectiveAcceptance({userId:job},selected,transaction)).rejects.toThrow('owner');
 expect(transaction).not.toHaveBeenCalled();expect(m.source).not.toHaveBeenCalled();
});
it('stores only the derived artifact through the collector and verifies its readback',async()=>{
 let artifact:Record<string,unknown>|undefined;
 const query=vi.fn(async(sql:string,args:unknown[])=>{
  if(sql.startsWith('insert')){artifact={sourceKind:args[3],plan:JSON.parse(args[4] as string),observations:JSON.parse(args[5] as string),rawReceipts:JSON.parse(args[6] as string)};return {rows:[]};}
  return {rows:[{id:run,source_kind:artifact!.sourceKind,plan:artifact!.plan,observations:artifact!.observations,raw_receipts:artifact!.rawReceipts}]};
 });
 const transaction=vi.fn(async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query}));
 const out=await collectSkillProspectiveAcceptance({userId:owner},{freezeId:freeze,plan:plan(),cases:[reference]},transaction as never);
 expect(out).toMatchObject({bundleId:run,collectedCases:1,automaticActivation:false,collectorProvenanceVerified:false});
 expect(artifact).toMatchObject({sourceKind:'synthetic-fixture',rawReceipts:{collector:{runtimeIdentityVerified:false}}});
 expect(out.artifactHash).toBe(digest(artifact));expect(m.collector).toHaveBeenCalledOnce();
});
it('refuses an inactive freeze inside the persistence transaction before insert',async()=>{
 m.inspect.mockResolvedValue('revoked');const query=vi.fn();
 const transaction=async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query});
 await expect(collectSkillProspectiveAcceptance({userId:owner},{freezeId:freeze,plan:plan(),cases:[reference]},transaction as never)).rejects.toThrow('before persistence');
 expect(query).not.toHaveBeenCalled();
});

it('routes task-marked prospective material through independent runtime audit twice',async()=>{
 const taskId='77777777-7777-4777-8777-777777777777';
 m.runtime.mockResolvedValue({...candidate(),projection:{...candidate().projection,toolReceipts:[{id:taskId,hash:h}],completedTaskHash:h}});
 const result=await prepareSkillProspectiveObservation({userId:owner},{...input(),reference:{...reference,taskId}});
 expect(m.runtime).toHaveBeenCalledTimes(2);expect(m.candidate).not.toHaveBeenCalled();
 expect(m.runtime.mock.calls[0][1]).toMatchObject({taskId,prospectiveJobId:job,runId:run,freezeId:freeze});
 expect(result).toMatchObject({reference:{taskId},runtimeTaskHash:h,runtimeToolReceipts:[{id:taskId,hash:h}]});
});
it('never reverts task-marked prospective material to legacy on audit rejection',async()=>{
 m.runtime.mockRejectedValue(new Error('Runtime capture binding changed'));
 await expect(prepareSkillProspectiveObservation({userId:owner},{...input(),reference:{...reference,taskId:run}})).rejects.toThrow('capture binding changed');
 expect(m.candidate).not.toHaveBeenCalled();
});
