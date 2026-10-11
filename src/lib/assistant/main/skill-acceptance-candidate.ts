import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {validateStoredSkillAcceptanceBaseline} from './skill-acceptance-baseline';
import {auditDurableSkillCandidate} from './skill-candidate-audit';
import {assertSkillAcceptanceRoutes} from './skill-acceptance-policy';

const referenceSchema=z.object({runId:z.uuid(),evaluationId:z.uuid(),projectionHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** Recompute stored candidate claims from server receipts. No client assertions confer activation. */
export async function validateStoredSkillAcceptanceCandidate(context:{userId:string},input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(input.bundleId);z.string().min(1).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(before.freezeStatus&&before.freezeStatus.state!=='active'&&before.freezeStatus.state!=='not-recorded')throw new Error('Acceptance freeze no longer active');
 if(!before.sourcesCurrent)throw new Error('Acceptance Skill sources changed');
 const item=before.artifact.plan.cases.find(row=>row.id===input.caseId);
 if(!item||item.category!=='replay'||item.provenance!=='historical-task')throw new Error('Candidate case is not historical replay');
 const reference=z.record(z.string(),referenceSchema).parse(before.artifact.rawReceipts.candidateSources)[input.caseId];
 if(!reference)throw new Error('Acceptance candidate source missing');
 const baselineReference=z.record(z.string(),z.object({runId:z.uuid()}).passthrough()).parse(before.artifact.rawReceipts.baselineSources)[input.caseId];
 if(!baselineReference||baselineReference.runId!==reference.runId)throw new Error('Candidate and baseline original task differ');
 const baseline=await validateStoredSkillAcceptanceBaseline(context,input);
 const pin=before.artifact.plan.pin;
 const audited=await auditDurableSkillCandidate(context,{runId:reference.runId,skillId:pin.skillId,version:pin.version,evaluationId:reference.evaluationId,arm:'candidate'});
 const projection=audited.projection;
 if(before.freezeStatus?.freezeId&&projection.freezeId!==before.freezeStatus.freezeId)throw new Error('Candidate journal freeze binding mismatch');
 if(audited.projectionHash!==reference.projectionHash||projection.sourceKind!==before.artifact.sourceKind)throw new Error('Candidate source projection changed');
 const observation=before.artifact.observations.find(row=>row.caseId===input.caseId),candidate=observation?.candidate;
 if(!candidate||candidate.state!=='completed'||candidate.stopReason!==null||candidate.unexpectedEffects!==0
  ||!projection.candidateSkillUsed||item.inputHash!==projection.taskInputHash||item.sourceHash!==baseline.projectionHash
  ||candidate.answerHash!==projection.answerHash||candidate.evidenceHash!==projection.evidenceHash
  ||candidate.identity.modelConfigHash!==projection.modelConfigHash
  ||digest(candidate.modelReceiptHashes)!==digest(projection.modelAttemptReceipts.map(row=>row.hash)))
  throw new Error('Candidate observation does not match server journal');
 assertSkillAcceptanceRoutes(candidate,projection.selectedModels.map(route=>({step:route.step,requestedModel:route.requestedModel,actualModel:route.model!,provider:route.provider!,receiptHash:route.receiptHash,toolSchemaHash:route.toolSchemaHash})));
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(!after.sourcesCurrent||digest(before)!==digest(after)||baseline.artifactHash!==before.artifactHash)throw new Error('Candidate evidence or review changed during validation');
 return {bundleId:input.bundleId,caseId:input.caseId,artifactHash:before.artifactHash,projectionHash:audited.projectionHash,
  baselineJournalVerified:true,candidateJournalVerified:true,productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
