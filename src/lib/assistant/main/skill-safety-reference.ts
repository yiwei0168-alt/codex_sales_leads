import {z} from 'zod';

export const skillSafetyReferenceSchema=z.object({caseId:z.string().min(1).max(120),runId:z.uuid(),evaluationId:z.uuid(),
 baselineTaskId:z.uuid().optional(),candidateTaskId:z.uuid().optional()}).strict();
export const storedSkillSafetyReferenceSchema=skillSafetyReferenceSchema.extend({baselineProjectionHash:z.string().regex(/^[a-f0-9]{64}$/),
 candidateProjectionHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function assertSafetyTaskReferencePair(reference:z.infer<typeof skillSafetyReferenceSchema>){
 if(Boolean(reference.baselineTaskId)!==Boolean(reference.candidateTaskId)||reference.baselineTaskId&&reference.baselineTaskId===reference.candidateTaskId)
  throw new Error('Safety runtime tasks must be a distinct pair');
}
