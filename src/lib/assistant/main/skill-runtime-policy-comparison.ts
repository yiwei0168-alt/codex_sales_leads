import {z} from 'zod';
import {digest} from './contracts';
import {MAIN_AGENT_EXECUTION_LIMITS} from './main-agent-limits';
import {skillCandidateExecutionPolicySchema} from './skill-candidate-execution-policy';

const usageSchema=z.object({modelDecisionCount:z.number().int().positive(),
 modelAttemptReceiptCount:z.number().int().positive(),
 readExecution:z.literal('registered-live-read-v1').optional()}).strict();

/** Call after completed graph/journal reconstruction. Counts describe validated
 * receipts, not fresh provider calls, spending permission or answer quality.
 * A completed bounded trial does not establish the ordinary task lifecycle. */
export function compareSkillRuntimeExecutionPolicy(rawPolicy:unknown,rawUsage:z.input<typeof usageSchema>){
 const policy=skillCandidateExecutionPolicySchema.parse(rawPolicy),usage=usageSchema.parse(rawUsage);
 if(usage.modelDecisionCount>policy.modelCallLimit||usage.modelAttemptReceiptCount<usage.modelDecisionCount)
  throw new Error('Skill runtime execution policy usage mismatch');
 const differences=['frozen-source-rejection-versus-live-replanning'];
 if(policy.modelCallLimit<MAIN_AGENT_EXECUTION_LIMITS.modelSteps)differences.push('stricter-trial-model-decision-limit');
 if(!usage.readExecution)differences.push('saved-receipt-reads-versus-live-dispatch');
 const comparison={protocol:'skill-runtime-execution-policy-comparison-v1' as const,
  scope:'completed-frozen-read-trial' as const,
  ordinaryGraphLimits:MAIN_AGENT_EXECUTION_LIMITS,trialPolicy:policy,
  modelDecisionCount:usage.modelDecisionCount,modelAttemptReceiptCount:usage.modelAttemptReceiptCount,
  modelDecisionQuotaRespected:true as const,
  graphLimitsMatch:policy.graphModelSteps===MAIN_AGENT_EXECUTION_LIMITS.modelSteps
   &&policy.graphRecursionLimit===MAIN_AGENT_EXECUTION_LIMITS.recursionLimit,
  readExecution:usage.readExecution??'saved-receipt-read-v1',
  differences,ordinaryLifecycleEquivalent:false as const,qualificationGranted:false as const};
 return {comparison,comparisonHash:digest(comparison)};
}
