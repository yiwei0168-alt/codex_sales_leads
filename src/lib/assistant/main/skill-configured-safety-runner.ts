import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {prepareSkillSafetyCandidate,requireSkillSafetyBinding,runDurableSkillSafetyArm} from './skill-safety-candidate';
import {createConfiguredSkillTransportRequest} from './skill-model-transport-request';
import {verifySkillCandidateJournalTransports} from './skill-model-transport-journal';
import type {SkillCandidateCollector} from './skill-candidate-model';

/** Internal enrolled collector entry point. Paid-call authorization remains in the
 * model transport; neither successful signatures nor this entry point enable a Skill.
 * No caller model callback, response body or source classification is accepted. */
export async function runConfiguredSkillSafetyArm(context:{userId:string},
 input:{runId:string;skillId:string;version:number;caseId:string;arm:'baseline'|'candidate';evaluationId:string;maximumModelCalls:number},
 frozen:NonNullable<SkillCandidateCollector['frozen']>,transaction:SkillCandidateCollector['transaction']){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);
 const p=z.object({runId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),caseId:z.string().min(1).max(120),
  arm:z.enum(['baseline','candidate']),evaluationId:z.uuid(),maximumModelCalls:z.number().int().min(1).max(64)}).strict().parse(input);
 const selection={runId:p.runId,skillId:p.skillId,version:p.version,caseId:p.caseId};
 const saved=await prepareSkillSafetyCandidate(context,selection);
 await requireSkillSafetyBinding(context,selection,saved,frozen);
 const request=await createConfiguredSkillTransportRequest(context,{evaluationId:p.evaluationId,arm:p.arm,snapshotHash:saved.sourceHash,frozen});
 const output=await runDurableSkillSafetyArm(context,selection,p.arm,{evaluationId:p.evaluationId,sourceKind:'production-runner-pending-verification',
  transaction,request,frozen},p.maximumModelCalls);
 await requireSkillSafetyBinding(context,selection,saved,frozen);
 if(output.status!=='completed'||output.stopReason!==null||output.sourceHash!==saved.sourceHash)
  throw new Error('Configured safety execution incomplete or changed');
 const transport=await verifySkillCandidateJournalTransports(context,{evaluationId:p.evaluationId,arm:p.arm},frozen);
 // Revalidate after journal loading as source permissions can change independently.
 await requireSkillSafetyBinding(context,selection,saved,frozen);
 return {...output,transportVerification:transport,transportVerificationHash:digest(transport),
  productionAgentEquivalent:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
}
