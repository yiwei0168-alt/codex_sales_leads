import {expect,it} from 'vitest';
import {skillCandidateExecutionPolicy} from './skill-candidate-execution-policy';
import {compareSkillRuntimeExecutionPolicy} from './skill-runtime-policy-comparison';

it('separates fallback receipt count from the quota on graph decisions',()=>{
 const {comparison}=compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(1),{modelDecisionCount:1,modelAttemptReceiptCount:3});
 expect(comparison).toMatchObject({modelDecisionCount:1,modelAttemptReceiptCount:3,modelDecisionQuotaRespected:true,
  graphLimitsMatch:true,ordinaryLifecycleEquivalent:false,qualificationGranted:false});
 expect(comparison.differences).toContain('stricter-trial-model-decision-limit');
});
it('does not infer lifecycle equivalence from live reads or a matching shared graph',()=>{
 const {comparison}=compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(64),{
  modelDecisionCount:2,modelAttemptReceiptCount:2,readExecution:'registered-live-read-v1'});
 expect(comparison.differences).toEqual(['frozen-source-rejection-versus-live-replanning','stricter-trial-model-decision-limit']);
 expect(comparison.ordinaryLifecycleEquivalent).toBe(false);
 expect(comparison).not.toHaveProperty('productionAgentEquivalent');
});
it('binds declared quota and observed receipt counts independently',()=>{
 const usage={modelDecisionCount:1,modelAttemptReceiptCount:1};
 const first=compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(3),usage).comparisonHash;
 expect(compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(4),usage).comparisonHash).not.toBe(first);
 expect(compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(3),{...usage,modelAttemptReceiptCount:2}).comparisonHash).not.toBe(first);
 expect(compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(3),usage).comparisonHash).toBe(first);
});
it.each([
 {modelDecisionCount:4,modelAttemptReceiptCount:4},
 {modelDecisionCount:2,modelAttemptReceiptCount:1},
 {modelDecisionCount:0,modelAttemptReceiptCount:0},
 {modelDecisionCount:1.5,modelAttemptReceiptCount:2},
])('rejects invalid completed usage %j',usage=>{
 expect(()=>compareSkillRuntimeExecutionPolicy(skillCandidateExecutionPolicy(3),usage)).toThrow();
});
it('rejects missing or altered declared graph policy without filling defaults',()=>{
 const usage={modelDecisionCount:1,modelAttemptReceiptCount:1};
 expect(()=>compareSkillRuntimeExecutionPolicy(undefined,usage)).toThrow();
 expect(()=>compareSkillRuntimeExecutionPolicy({...skillCandidateExecutionPolicy(3),graphRecursionLimit:256},usage)).toThrow();
});
