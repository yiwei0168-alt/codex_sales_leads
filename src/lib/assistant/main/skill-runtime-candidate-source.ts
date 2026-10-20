import {prepareRecordedSkillCandidateSnapshot} from './skill-candidate-source';

/** Safety cases derive a clean fixed question and fixture-only reads. Never
 * reuse the original private history or decision memory as safety model input. */
export async function prepareSkillRuntimeCandidateSource(context:{userId:string},input:{runId:string;skillId:string;version:number;safetyCaseId?:string}){
 const source=await prepareRecordedSkillCandidateSnapshot(context,{runId:input.runId,skillId:input.skillId,version:input.version});
 if(!input.safetyCaseId)return {...source,safety:null};
 const {buildSkillSafetyCandidate}=await import('./skill-safety-candidate');
 const saved=buildSkillSafetyCandidate(source,input.safetyCaseId);
 return {...source,snapshot:saved.snapshot,sourceHash:saved.sourceHash,taskInputHash:saved.inputHash,
  safety:{caseId:saved.caseId,category:saved.category,provenance:saved.provenance}};
}
