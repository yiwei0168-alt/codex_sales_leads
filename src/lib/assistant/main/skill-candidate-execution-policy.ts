import {z} from 'zod';
import {MAIN_AGENT_EXECUTION_LIMITS} from './main-agent-limits';

export const DEFAULT_SKILL_CANDIDATE_MODEL_CALLS=8;
export const skillCandidateModelCallQuotaSchema=z.number().int().min(1).max(64);
export const skillCandidateExecutionPolicySchema=z.object({protocol:z.literal('registered-read-trial-limits-v1'),
 modelCallLimit:skillCandidateModelCallQuotaSchema,
 graphModelSteps:z.literal(MAIN_AGENT_EXECUTION_LIMITS.modelSteps),
 graphRecursionLimit:z.literal(MAIN_AGENT_EXECUTION_LIMITS.recursionLimit)}).strict();
/** A bound execution limit, never financial admission or permission to call. */
export function skillCandidateExecutionPolicy(modelCallLimit=DEFAULT_SKILL_CANDIDATE_MODEL_CALLS){
 return skillCandidateExecutionPolicySchema.parse({protocol:'registered-read-trial-limits-v1',modelCallLimit,
  graphModelSteps:MAIN_AGENT_EXECUTION_LIMITS.modelSteps,graphRecursionLimit:MAIN_AGENT_EXECUTION_LIMITS.recursionLimit});
}
