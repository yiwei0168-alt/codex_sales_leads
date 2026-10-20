import {z} from 'zod';
import {auditDurableSkillCandidate} from './skill-candidate-audit';

export const historicalCandidateReferenceSchema=z.object({runId:z.uuid(),evaluationId:z.uuid(),
 projectionHash:z.string().regex(/^[a-f0-9]{64}$/),taskId:z.uuid().optional()}).strict();
export const historicalReplaySelectionSchema=historicalCandidateReferenceSchema.omit({projectionHash:true}).extend({caseId:z.string().min(1)}).strict();
type Reference=Omit<z.infer<typeof historicalCandidateReferenceSchema>,'projectionHash'>;

/** A task reference selects the new server reconstruction. It cannot fall back
 * to legacy replay when the task, freeze or new-protocol journal is unavailable. */
export async function auditHistoricalSkillCandidateSource(context:{userId:string},input:{reference:Reference;skillId:string;version:number;caseId:string;freezeId?:string;plan:unknown}){
 const {reference}=input;
 if(reference.taskId){
  if(!input.freezeId)throw new Error('Runtime candidate reference requires a recorded freeze');
  const {auditSkillRuntimeCandidate}=await import('./skill-runtime-candidate-audit');
  return {...await auditSkillRuntimeCandidate(context,{runId:reference.runId,evaluationId:reference.evaluationId,taskId:reference.taskId,
   skillId:input.skillId,version:input.version,caseId:input.caseId,freezeId:input.freezeId,arm:'candidate'},input.plan),candidateProtocol:'runtime' as const};
 }
 return {...await auditDurableSkillCandidate(context,{runId:reference.runId,evaluationId:reference.evaluationId,skillId:input.skillId,version:input.version,arm:'candidate'}),candidateProtocol:'legacy' as const};
}
