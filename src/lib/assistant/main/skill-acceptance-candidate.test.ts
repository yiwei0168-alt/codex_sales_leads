import {beforeEach,it,expect,vi} from 'vitest';
import {digest} from './contracts';
import {disableLocalAnalysisTracing} from './local-analysis-boundary';
import {validateStoredSkillAcceptanceCandidate} from './skill-acceptance-candidate';
const mocks=vi.hoisted(()=>({read:vi.fn(),baseline:vi.fn(),audit:vi.fn(),runtime:vi.fn()}));
vi.mock('./skill-acceptance-store',()=>({readSkillAcceptanceEvidence:mocks.read}));
vi.mock('./skill-acceptance-baseline',()=>({validateStoredSkillAcceptanceBaseline:mocks.baseline}));
vi.mock('./skill-candidate-audit',()=>({auditDurableSkillCandidate:mocks.audit}));
vi.mock('./skill-runtime-candidate-audit',()=>({auditSkillRuntimeCandidate:mocks.runtime}));
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',h=digest('fixture');
function fixture(){
 const candidate={state:'completed',stopReason:null,unexpectedEffects:0,answerHash:h,evidenceHash:h,modelReceiptHashes:[h],identity:{modelConfigHash:h,toolSchemaHash:h},requestedModel:'fixture/model',actualModel:'fixture/model',provider:'fixture'};
 return {sourcesCurrent:true,artifactHash:h,judgments:[],artifact:{sourceKind:'synthetic-fixture',plan:{pin:{skillId:id,version:1},cases:[{id:'case',category:'replay',provenance:'historical-task',inputHash:h,sourceHash:h}]},observations:[{caseId:'case',candidate}],rawReceipts:{baselineSources:{case:{runId:id}},candidateSources:{case:{runId:id,evaluationId:id,projectionHash:h}}}}};
}
function audit(){return {projectionHash:h,projection:{sourceKind:'synthetic-fixture',candidateSkillUsed:true,taskInputHash:h,modelConfigHash:h,answerHash:h,evidenceHash:h,modelAttemptReceipts:[{id,hash:h}],selectedModels:[{requestedModel:'fixture/model',model:'fixture/model',provider:'fixture',toolSchemaHash:h}]}};}
beforeEach(()=>{vi.resetAllMocks();disableLocalAnalysisTracing();mocks.read.mockResolvedValue(fixture());mocks.baseline.mockResolvedValue({projectionHash:h,artifactHash:h});mocks.audit.mockResolvedValue(audit());});
const run=()=>validateStoredSkillAcceptanceCandidate({userId:id},{bundleId:id,caseId:'case'});
it('binds a stored historical candidate to current baseline and reconstructed graph',async()=>{
 expect(await run()).toMatchObject({baselineJournalVerified:true,candidateJournalVerified:true,automaticActivation:false,collectorProvenanceVerified:false});
 expect(mocks.audit).toHaveBeenCalledWith({userId:id},{runId:id,skillId:id,version:1,evaluationId:id,arm:'candidate'});expect(mocks.read).toHaveBeenCalledTimes(2);
});
it.each(['source','task','projection','kind','unused','answer','evidence','receipts','config','route','tools','pending'])('rejects %s mismatch',async kind=>{
 const f=fixture(),a=audit();
 if(kind==='source')f.sourcesCurrent=false;if(kind==='task')f.artifact.rawReceipts.candidateSources.case.runId=other;
 if(kind==='projection')a.projectionHash=digest('changed');if(kind==='kind')a.projection.sourceKind='production-runner-pending-verification';
 if(kind==='unused')a.projection.candidateSkillUsed=false;if(kind==='answer')f.artifact.observations[0].candidate.answerHash=digest('changed');
 if(kind==='evidence')f.artifact.observations[0].candidate.evidenceHash=digest('changed');if(kind==='receipts')f.artifact.observations[0].candidate.modelReceiptHashes=[];
 if(kind==='config')a.projection.modelConfigHash=digest('changed');if(kind==='route')a.projection.selectedModels.push({...a.projection.selectedModels[0],model:'different/model'});
 if(kind==='tools')a.projection.selectedModels[0].toolSchemaHash=digest('changed');if(kind==='pending')f.artifact.observations[0].candidate.state='pending';
 mocks.read.mockResolvedValue(f);mocks.audit.mockResolvedValue(a);await expect(run()).rejects.toThrow();
});
it('rejects a judgment or artifact change during validation',async()=>{
 mocks.read.mockResolvedValueOnce(fixture()).mockResolvedValueOnce({...fixture(),judgments:[{revoked:true}]});await expect(run()).rejects.toThrow('review changed');
});
it('does not bypass baseline verification',async()=>{
 mocks.baseline.mockRejectedValue(new Error('baseline failed'));await expect(run()).rejects.toThrow('baseline failed');expect(mocks.audit).not.toHaveBeenCalled();
});

it.each(['revoked','expired','missing','changed'])('rejects a %s freeze before graph work',async state=>{
 mocks.read.mockResolvedValue({...fixture(),freezeStatus:{state,freezeId:id}});
 await expect(run()).rejects.toThrow('freeze no longer active');expect(mocks.audit).not.toHaveBeenCalled();
});
it('rejects a candidate journal from a different freeze',async()=>{
 mocks.read.mockResolvedValue({...fixture(),freezeStatus:{state:'active',freezeId:id}});
 mocks.audit.mockResolvedValue({...audit(),projection:{...audit().projection,freezeId:other}});
 await expect(run()).rejects.toThrow('freeze binding mismatch');
});
it('rejects revocation during validation',async()=>{
 mocks.read.mockResolvedValueOnce({...fixture(),freezeStatus:{state:'active',freezeId:id}}).mockResolvedValueOnce({...fixture(),freezeStatus:{state:'revoked',freezeId:id}});
 mocks.audit.mockResolvedValue({...audit(),projection:{...audit().projection,freezeId:id}});
 await expect(run()).rejects.toThrow('review changed');
});
it('rebuilds a stored task reference through the new audit without legacy fallback',async()=>{
 const f=fixture(),plan=f.artifact.plan;
 const runtime={...f,freezeStatus:{state:'active',freezeId:id},artifact:{...f.artifact,rawReceipts:{...f.artifact.rawReceipts,
  candidateSources:{case:{...f.artifact.rawReceipts.candidateSources.case,taskId:other}}}}};
 mocks.read.mockResolvedValue(runtime);
 mocks.runtime.mockResolvedValue({...audit(),projection:{...audit().projection,freezeId:id,completedTaskHash:h,toolReceipts:[{id:other,hash:h}]}});
 expect(await run()).toMatchObject({runtimeTaskHash:h,runtimeToolReceipts:[{id:other,hash:h}],automaticActivation:false});
 expect(mocks.audit).not.toHaveBeenCalled();
 expect(mocks.runtime).toHaveBeenCalledWith({userId:id},{runId:id,evaluationId:id,taskId:other,skillId:id,version:1,caseId:'case',freezeId:id,arm:'candidate'},plan);
 mocks.runtime.mockRejectedValue(new Error('runtime changed'));await expect(run()).rejects.toThrow('runtime changed');expect(mocks.audit).not.toHaveBeenCalled();
});
it('does not downgrade a task reference without a recorded freeze',async()=>{
 const f=fixture();mocks.read.mockResolvedValue({...f,artifact:{...f.artifact,rawReceipts:{...f.artifact.rawReceipts,
  candidateSources:{case:{...f.artifact.rawReceipts.candidateSources.case,taskId:other}}}}});
 await expect(run()).rejects.toThrow('requires a recorded freeze');expect(mocks.audit).not.toHaveBeenCalled();expect(mocks.runtime).not.toHaveBeenCalled();
});
