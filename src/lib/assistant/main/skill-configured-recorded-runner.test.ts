import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {runConfiguredSkillRecordedCandidate} from './skill-configured-recorded-runner';
import type {SkillCandidateCollector} from './skill-candidate-model';
const m=vi.hoisted(()=>({freeze:vi.fn(),baseline:vi.fn(),identity:vi.fn(),prospective:vi.fn(),snapshot:vi.fn(),run:vi.fn(),
 factory:vi.fn(),verify:vi.fn(),original:vi.fn(),historicalCollect:vi.fn(),prospectiveCollect:vi.fn(),request:vi.fn(),enqueue:vi.fn(),inspect:vi.fn(),claim:vi.fn(),completed:vi.fn(),runtime:vi.fn(),audit:vi.fn()}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-acceptance-freeze',()=>({requireSkillAcceptanceFreeze:m.freeze}));
vi.mock('./skill-acceptance-baseline',()=>({prepareSkillAcceptanceBaseline:m.baseline}));
vi.mock('./skill-runtime-identity',()=>({prepareSkillExecutionIdentity:m.identity}));
vi.mock('./skill-prospective-source',()=>({prepareSkillProspectiveSource:m.prospective}));
vi.mock('./skill-candidate-source',()=>({prepareRecordedSkillCandidateSnapshot:m.snapshot,runDurableRecordedSkillCandidateArm:m.run}));
vi.mock('./skill-candidate-runtime-task',()=>({enqueueSkillCandidateRuntimeTask:m.enqueue,inspectSkillCandidateRuntimeTask:m.inspect,claimSkillCandidateRuntimeTask:m.claim,readCompletedSkillCandidateRuntimeTask:m.completed}));
vi.mock('./skill-runtime-candidate',()=>({runSkillRuntimeCandidate:m.runtime}));
vi.mock('./skill-runtime-candidate-audit',()=>({auditSkillRuntimeCandidate:m.audit}));
vi.mock('./skill-model-transport-request',()=>({createConfiguredSkillTransportRequest:m.factory}));
vi.mock('./skill-model-transport-journal',()=>({verifySkillCandidateJournalTransports:m.verify}));
vi.mock('./task-model-transport-journal',()=>({verifyOwnedTaskModelTransports:m.original}));
vi.mock('./skill-acceptance-collector',()=>({collectHistoricalSkillAcceptance:m.historicalCollect}));
vi.mock('./skill-prospective-collector',()=>({collectSkillProspectiveAcceptance:m.prospectiveCollect}));
const owner='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222',
 jobId='33333333-3333-4333-8333-333333333333',evaluationId='44444444-4444-4444-8444-444444444444';
const taskId='66666666-6666-4666-8666-666666666666',specHash=digest('spec');
const runtimeSnapshotHash=digest({protocol:'skill-runtime-candidate-v1',sourceHash:'snapshot',taskId,specHash});
const context={userId:owner},identity={runtimeHash:digest('runtime'),promptHash:digest('prompt'),toolSchemaHash:digest('tools'),
 modelConfigHash:digest('model-config'),scopeHash:digest('scope')};
const frozen={freezeId:'55555555-5555-4555-8555-555555555555',plan:{pin:{ownerId:owner,skillId:jobId,version:1,contentHash:'content',sourceHash:'skill-source'},
 identity,cases:[{id:'replay',category:'replay',provenance:'historical-task',inputHash:'task',sourceHash:'baseline'},
 {id:'shadow',category:'shadow',provenance:'prospective-task',inputHash:'task',sourceHash:'capture'}]}} as unknown as NonNullable<SkillCandidateCollector['frozen']>;
const transaction:SkillCandidateCollector['transaction']=async()=>{throw new Error('Unexpected database access in orchestration test');};
const historical={kind:'historical' as const,runId,caseId:'replay',evaluationId,maximumModelCalls:8};
const prospective={kind:'prospective' as const,jobId,caseId:'shadow',evaluationId,maximumModelCalls:8};
const snapshot=()=>({sourceHash:'snapshot',skillSourceHash:'skill-source',taskInputHash:'task',modelConfigHash:frozen.plan.identity.modelConfigHash,
 snapshot:{candidate:{value:{content_hash:'content'}}}});
beforeEach(()=>{
 vi.resetAllMocks();m.enqueue.mockResolvedValue({runId:taskId,specHash});m.inspect.mockResolvedValue({status:'queued',control:null});
 m.claim.mockResolvedValue({context:{...context,runId:taskId}});m.runtime.mockResolvedValue({status:'completed',stopReason:null,candidateSkillUsed:true,serverSnapshotHash:'snapshot',runtimeSnapshotHash,taskId,taskStatus:'completed'});m.identity.mockResolvedValue(identity);m.baseline.mockResolvedValue({projection:{inputHash:'task'},projectionHash:'baseline'});
 m.prospective.mockResolvedValue({projection:{runId},projectionHash:'prospective'});m.snapshot.mockImplementation(async()=>snapshot());
 m.factory.mockResolvedValue(m.request);m.run.mockResolvedValue({status:'completed',stopReason:null,candidateSkillUsed:true,serverSnapshotHash:'snapshot'});
 m.verify.mockResolvedValue({signedSuccessfulTransportsVerified:true,binaryVerified:false,automaticActivation:false});
 m.original.mockResolvedValue({journalHash:digest('original'),storedModeChainsVerified:true,completeTaskProvenanceVerified:false,automaticActivation:false});
 m.historicalCollect.mockResolvedValue({bundleId:'historical-bundle'});m.prospectiveCollect.mockResolvedValue({bundleId:'prospective-bundle'});
});
it.each([historical,prospective])('connects $kind candidate to configured transport, persisted verification and the correct collector',async input=>{
 const out=await runConfiguredSkillRecordedCandidate(context,input,frozen,transaction);
 expect(m.factory).toHaveBeenCalledWith(context,{evaluationId,arm:'candidate',snapshotHash:runtimeSnapshotHash,frozen});
 expect(m.runtime.mock.calls[0][2]).toEqual({evaluationId,sourceKind:'production-runner-pending-verification',transaction,request:m.request,frozen});
 expect(m.run).not.toHaveBeenCalled();
 expect(m.verify).toHaveBeenCalledWith(context,{evaluationId,arm:'candidate'},frozen);
 expect(m.original).toHaveBeenCalledTimes(3);expect(m.original).toHaveBeenCalledWith(context,{runId});
 expect(m.enqueue.mock.calls[0][1]).toMatchObject(input.kind==='historical'?{runId,caseId:'replay'}:{runId,caseId:'shadow',prospectiveJobId:jobId});
 expect(m.original.mock.invocationCallOrder[0]).toBeLessThan(m.factory.mock.invocationCallOrder[0]);
 expect(m.freeze).toHaveBeenCalledTimes(3);
 expect(out).toMatchObject({productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false});
 if(input.kind==='historical'){
  expect(m.historicalCollect).toHaveBeenCalledWith(context,{freezeId:frozen.freezeId,plan:frozen.plan,replays:[{caseId:'replay',runId,evaluationId,taskId}]},transaction);
  expect(m.prospectiveCollect).not.toHaveBeenCalled();
 }else{
  expect(m.prospectiveCollect).toHaveBeenCalledWith(context,{freezeId:frozen.freezeId,plan:frozen.plan,cases:[{caseId:'shadow',jobId,evaluationId,taskId}]},transaction);
  expect(m.historicalCollect).not.toHaveBeenCalled();
 }
 expect(m.verify.mock.invocationCallOrder[0]).toBeLessThan((input.kind==='historical'?m.historicalCollect:m.prospectiveCollect).mock.invocationCallOrder[0]);
});
it('rejects a historical run outside the frozen case before selecting transport',async()=>{
 m.baseline.mockResolvedValue({projection:{inputHash:'task'},projectionHash:'other'});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('historical source');expect(m.factory).not.toHaveBeenCalled();
});
it('rejects missing prospective capture before selecting transport',async()=>{
 m.prospective.mockRejectedValue(new Error('Capture unavailable'));
 await expect(runConfiguredSkillRecordedCandidate(context,prospective,frozen,transaction)).rejects.toThrow('Capture unavailable');expect(m.factory).not.toHaveBeenCalled();
});
it('rejects changed runtime identity before selecting transport',async()=>{
 m.identity.mockResolvedValue({runtimeHash:'changed'});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('identity changed');expect(m.factory).not.toHaveBeenCalled();
});
it.each([{status:'failed'},{stopReason:'limit'},{candidateSkillUsed:false},{serverSnapshotHash:'other'}])('does not collect an invalid candidate %j',async change=>{
 m.runtime.mockResolvedValue({status:'completed',stopReason:null,candidateSkillUsed:true,serverSnapshotHash:'snapshot',runtimeSnapshotHash,taskId,taskStatus:'completed',...change});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('incomplete or changed');expect(m.historicalCollect).not.toHaveBeenCalled();
});
it('rejects snapshot change after execution',async()=>{
 m.snapshot.mockResolvedValueOnce(snapshot()).mockResolvedValue({...snapshot(),sourceHash:'different'});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('source changed during execution');expect(m.verify).not.toHaveBeenCalled();
});
it('rejects source change during receipt verification before collecting',async()=>{
 m.snapshot.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot()).mockResolvedValue({...snapshot(),sourceHash:'different'});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('source changed during verification');expect(m.historicalCollect).not.toHaveBeenCalled();
});
it('propagates invalid persisted signatures without collecting',async()=>{
 m.verify.mockRejectedValue(new Error('Signature invalid'));
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('Signature invalid');expect(m.historicalCollect).not.toHaveBeenCalled();
});
it('rejects caller model callbacks and unbounded requests',async()=>{
 for(const input of [{...historical,request:()=>{}},{...historical,maximumModelCalls:65}])
  await expect(runConfiguredSkillRecordedCandidate(context,input,frozen,transaction)).rejects.toThrow();
 expect(m.factory).not.toHaveBeenCalled();
});
it.each([historical,prospective])('rejects unsigned original $kind tasks before candidate transport admission',async input=>{
 m.original.mockRejectedValue(new Error('Original signature missing'));
 await expect(runConfiguredSkillRecordedCandidate(context,input,frozen,transaction)).rejects.toThrow('Original signature missing');
 expect(m.factory).not.toHaveBeenCalled();expect(m.run).not.toHaveBeenCalled();expect(m.historicalCollect).not.toHaveBeenCalled();expect(m.prospectiveCollect).not.toHaveBeenCalled();
});
it('rejects original transport changes after execution without collecting',async()=>{
 m.original.mockResolvedValueOnce({journalHash:'before'}).mockResolvedValue({journalHash:'after'});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('source changed during execution');
 expect(m.verify).not.toHaveBeenCalled();expect(m.historicalCollect).not.toHaveBeenCalled();
});
it('rejects original key revocation during candidate verification',async()=>{
 m.original.mockResolvedValueOnce({journalHash:'same'}).mockResolvedValueOnce({journalHash:'same'}).mockRejectedValueOnce(new Error('Original trust revoked'));
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('Original trust revoked');expect(m.historicalCollect).not.toHaveBeenCalled();
});

it('preflights configured transport before claiming a live task',async()=>{
 m.factory.mockRejectedValue(new Error('Transport unavailable'));
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('Transport unavailable');
 expect(m.claim).not.toHaveBeenCalled();expect(m.runtime).not.toHaveBeenCalled();
});
it('reuses an audited completed task without a new model adapter or claim',async()=>{
 const completed={taskId,reply:'Saved reply'};m.completed.mockResolvedValue(completed);m.inspect.mockResolvedValue({status:'completed',control:null});
 m.audit.mockResolvedValue({projection:{runtimeSnapshotHash,completedTaskHash:digest(completed),candidateSkillUsed:true,selectedModels:[{}]}});
 const result=await runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction);
 expect(result).toMatchObject({reply:'Saved reply',reusedCompletedTask:true});
 expect(m.factory).not.toHaveBeenCalled();expect(m.claim).not.toHaveBeenCalled();expect(m.runtime).not.toHaveBeenCalled();
 expect(m.verify).toHaveBeenCalled();expect(m.historicalCollect).toHaveBeenCalled();
});
it('rejects changed completed task metadata without rerunning',async()=>{
 m.inspect.mockResolvedValue({status:'completed',control:null});m.completed.mockResolvedValue({reply:'changed'});
 m.audit.mockResolvedValue({projection:{runtimeSnapshotHash,completedTaskHash:digest('old')}});
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('completed runtime task changed');
 expect(m.factory).not.toHaveBeenCalled();expect(m.historicalCollect).not.toHaveBeenCalled();
});
it.each([{status:'partial',control:null},{status:'queued',control:'cancel'}])('refuses controlled or incomplete tasks %j',async state=>{
 m.inspect.mockResolvedValue(state);
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('requires reconciliation');
 expect(m.claim).not.toHaveBeenCalled();expect(m.factory).not.toHaveBeenCalled();
});
it('never falls back to legacy execution after a runtime failure',async()=>{
 m.runtime.mockRejectedValue(new Error('Runtime journal changed'));
 await expect(runConfiguredSkillRecordedCandidate(context,historical,frozen,transaction)).rejects.toThrow('Runtime journal changed');
 expect(m.run).not.toHaveBeenCalled();expect(m.historicalCollect).not.toHaveBeenCalled();
});
