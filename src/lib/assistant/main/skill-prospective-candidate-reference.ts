import {z} from 'zod';
import {auditDurableSkillCandidate} from './skill-candidate-audit';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillProspectiveReferenceSchema=z.object({caseId:z.string().min(1).max(200),jobId:z.uuid(),evaluationId:z.uuid(),taskId:z.uuid().optional()}).strict();
export const storedProspectiveReferenceSchema=skillProspectiveReferenceSchema.extend({runId:z.uuid(),
 sourceProjectionHash:sha,baselineProjectionHash:sha,candidateProjectionHash:sha}).strict();

/** A task marker selects server reconstruction and never legacy fallback.
 * Pre-task capture is independently verified by the caller and task admission. */
export async function auditProspectiveSkillCandidate(context:{userId:string},input:{reference:z.infer<typeof skillProspectiveReferenceSchema>;
 runId:string;skillId:string;version:number;freezeId:string;plan:unknown}){
 const {reference}=input,pin={runId:input.runId,skillId:input.skillId,version:input.version,evaluationId:reference.evaluationId,arm:'candidate' as const};
 if(reference.taskId){
  const {auditSkillRuntimeCandidate}=await import('./skill-runtime-candidate-audit');
  return {...await auditSkillRuntimeCandidate(context,{...pin,taskId:reference.taskId,prospectiveJobId:reference.jobId,
   freezeId:input.freezeId,caseId:reference.caseId},input.plan),candidateProtocol:'runtime' as const};
 }
 return {...await auditDurableSkillCandidate(context,pin),candidateProtocol:'legacy' as const};
}
