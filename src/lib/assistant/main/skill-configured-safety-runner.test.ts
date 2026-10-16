import {beforeEach,expect,it,vi} from 'vitest';
import {runConfiguredSkillSafetyArm} from './skill-configured-safety-runner';
import type {SkillCandidateCollector} from './skill-candidate-model';
const m=vi.hoisted(()=>({prepare:vi.fn(),binding:vi.fn(),run:vi.fn(),factory:vi.fn(),verify:vi.fn(),request:vi.fn()}));
vi.mock('./local-analysis-boundary',()=>({assertLocalAnalysisBoundary:()=>{}}));
vi.mock('./skill-safety-candidate',()=>({prepareSkillSafetyCandidate:m.prepare,requireSkillSafetyBinding:m.binding,runDurableSkillSafetyArm:m.run}));
vi.mock('./skill-model-transport-request',()=>({createConfiguredSkillTransportRequest:m.factory}));
vi.mock('./skill-model-transport-journal',()=>({verifySkillCandidateJournalTransports:m.verify}));
const context={userId:'11111111-1111-4111-8111-111111111111'},input={runId:'22222222-2222-4222-8222-222222222222',
 skillId:'33333333-3333-4333-8333-333333333333',version:1,caseId:'safety-ambiguous',arm:'candidate' as const,
 evaluationId:'44444444-4444-4444-8444-444444444444',maximumModelCalls:8};
const frozen={freezeId:'55555555-5555-4555-8555-555555555555'} as NonNullable<SkillCandidateCollector['frozen']>;
const transaction:SkillCandidateCollector['transaction']=async()=>{throw new Error('Unexpected DB call in orchestration test');};
beforeEach(()=>{
 vi.resetAllMocks();m.prepare.mockResolvedValue({sourceHash:'snapshot'});m.factory.mockResolvedValue(m.request);
 m.run.mockResolvedValue({status:'completed',stopReason:null,sourceHash:'snapshot'});
 m.verify.mockResolvedValue({signedSuccessfulTransportsVerified:true,binaryVerified:false,automaticActivation:false});
});
it.each(['baseline','candidate'] as const)('connects configured transport to durable %s and verifies persisted receipts',async arm=>{
 const out=await runConfiguredSkillSafetyArm(context,{...input,arm},frozen,transaction);
 expect(m.factory).toHaveBeenCalledWith(context,{evaluationId:input.evaluationId,arm,snapshotHash:'snapshot',frozen});
 expect(m.run.mock.calls[0][3]).toEqual({evaluationId:input.evaluationId,sourceKind:'production-runner-pending-verification',transaction,request:m.request,frozen});
 expect(m.run.mock.calls[0][4]).toBe(8);expect(m.binding).toHaveBeenCalledTimes(3);
 expect(m.verify).toHaveBeenCalledWith(context,{evaluationId:input.evaluationId,arm},frozen);
 expect(out).toMatchObject({productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false});
});
it('checks frozen source binding before selecting a request implementation',async()=>{
 m.binding.mockRejectedValue(new Error('Source changed'));
 await expect(runConfiguredSkillSafetyArm(context,input,frozen,transaction)).rejects.toThrow('Source changed');expect(m.factory).not.toHaveBeenCalled();
});
it.each([0,65,1.5])('rejects invalid model call limit %s before any source reads',async maximumModelCalls=>{
 await expect(runConfiguredSkillSafetyArm(context,{...input,maximumModelCalls},frozen,transaction)).rejects.toThrow();expect(m.prepare).not.toHaveBeenCalled();
});
it.each([{status:'failed'},{stopReason:'limit'},{sourceHash:'changed'}])('rejects incomplete or changed execution %j',async change=>{
 m.run.mockResolvedValue({status:'completed',stopReason:null,sourceHash:'snapshot',...change});
 await expect(runConfiguredSkillSafetyArm(context,input,frozen,transaction)).rejects.toThrow('incomplete or changed');expect(m.verify).not.toHaveBeenCalled();
});
it('propagates persisted receipt verification failure',async()=>{
 m.verify.mockRejectedValue(new Error('Invalid signature'));
 await expect(runConfiguredSkillSafetyArm(context,input,frozen,transaction)).rejects.toThrow('Invalid signature');
});
it('rechecks source binding after persisted receipt verification',async()=>{
 m.binding.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Source revoked'));
 await expect(runConfiguredSkillSafetyArm(context,input,frozen,transaction)).rejects.toThrow('Source revoked');expect(m.verify).toHaveBeenCalledTimes(1);
});
it('does not accept a caller-supplied model callback',async()=>{
 await expect(runConfiguredSkillSafetyArm(context,{...input,request:()=>{}} as typeof input,frozen,transaction)).rejects.toThrow();
 expect(m.factory).not.toHaveBeenCalled();
});
