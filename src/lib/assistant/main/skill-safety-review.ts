import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {assertSkillAcceptanceRoutes} from './skill-acceptance-policy';
import {auditSkillSafetyArm} from './skill-safety-audit';
import {skillSafetyReferenceSchema} from './skill-safety-collector';

/** Rebuild both answers from the frozen, account-owned model journal before review. */
export async function readSkillSafetyReviewCase(context:{userId:string},input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(input.bundleId);z.string().min(1).max(200).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(before.freezeStatus.state!=='active'||!before.freezeStatus.freezeId||!before.sourcesCurrent)throw new Error('Safety review freeze or source changed');
 const item=before.artifact.plan.cases.find(row=>row.id===input.caseId);
 if(!item||item.provenance!=='safety-fixture'||!['negative','injection','permissions'].includes(item.category))throw new Error('Safety case unavailable');
 const source=z.object({...skillSafetyReferenceSchema.shape,baselineProjectionHash:z.string().regex(/^[a-f0-9]{64}$/),candidateProjectionHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(
  z.record(z.string(),z.unknown()).parse(before.artifact.rawReceipts.safetySources)[item.id]);
 if(source.caseId!==item.id)throw new Error('Safety reference changed');
 const frozen={freezeId:before.freezeStatus.freezeId,plan:before.artifact.plan},run={...source,skillId:before.artifact.plan.pin.skillId,version:before.artifact.plan.pin.version};
 const baseline=await auditSkillSafetyArm(context,{...run,arm:'baseline'},frozen);
 const candidate=await auditSkillSafetyArm(context,{...run,arm:'candidate'},frozen);
 const observation=before.artifact.observations.find(row=>row.caseId===item.id);
 if(!observation||baseline.projectionHash!==source.baselineProjectionHash||candidate.projectionHash!==source.candidateProjectionHash
  ||baseline.projection.sourceKind!==before.artifact.sourceKind||candidate.projection.sourceKind!==before.artifact.sourceKind
  ||baseline.material.question!==candidate.material.question)throw new Error('Safety source projection changed');
 for(const [side,audited] of [['baseline',baseline],['candidate',candidate]] as const){
  const actual=audited.projection,saved=observation[side];
  if(saved.state!==actual.state||saved.stopReason!==actual.stopReason||saved.answerHash!==actual.answerHash||saved.evidenceHash!==actual.evidenceHash
   ||saved.unexpectedEffects!==actual.unexpectedEffects||digest(saved.modelReceiptHashes)!==digest(actual.modelReceiptHashes)
   ||saved.identity.modelConfigHash!==actual.modelConfigHash)throw new Error('Safety observation differs from model journal');
  assertSkillAcceptanceRoutes(saved,actual.routes);
 }
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(digest(before)!==digest(after)||!after.sourcesCurrent||after.freezeStatus.state!=='active')throw new Error('Safety review state changed');
 const canPass=(side:'baseline'|'candidate')=>observation[side].state==='completed'&&observation[side].stopReason===null&&observation[side].unexpectedEffects===0;
 const receipts=[...baseline.material.receipts,...candidate.material.receipts];
 return {bundleId:input.bundleId,caseId:item.id,artifactHash:before.artifactHash,observationHash:digest(observation),
  question:baseline.material.question,baseline:baseline.material.answer,candidate:candidate.material.answer,
  receipts:receipts.filter((row,index)=>receipts.findIndex(other=>digest(other)===digest(row))===index),
  canPass:{baseline:canPass('baseline'),candidate:canPass('candidate')},sourceKind:before.artifact.sourceKind,
  freezeStatus:before.freezeStatus,judgment:before.judgments.find(row=>row.caseId===item.id)??null,
  automaticActivation:false,productionAgentEquivalent:false};
}
