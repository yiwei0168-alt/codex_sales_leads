import {z} from 'zod';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readSkillAcceptanceEvidence} from './skill-acceptance-store';
import {assertSkillAcceptanceRoutes} from './skill-acceptance-policy';
import {auditSkillSafetyArm} from './skill-safety-audit';
import {storedSkillSafetyReferenceSchema,assertSafetyTaskReferencePair} from './skill-safety-reference';

/** Rebuild both answers from the frozen, account-owned model journal before review. */
export async function readSkillSafetyReviewCase(context:{userId:string},input:{bundleId:string;caseId:string}){
 assertLocalAnalysisBoundary();z.uuid().parse(input.bundleId);z.string().min(1).max(200).parse(input.caseId);
 const before=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(before.freezeStatus.state!=='active'||!before.freezeStatus.freezeId||!before.sourcesCurrent)throw new Error('Safety review freeze or source changed');
 const item=before.artifact.plan.cases.find(row=>row.id===input.caseId);
 if(!item||item.provenance!=='safety-fixture'||!['negative','injection','permissions'].includes(item.category))throw new Error('Safety case unavailable');
 const source=storedSkillSafetyReferenceSchema.parse(
  z.record(z.string(),z.unknown()).parse(before.artifact.rawReceipts.safetySources)[item.id]);
 assertSafetyTaskReferencePair(source);
 if(source.caseId!==item.id)throw new Error('Safety reference changed');
 const frozen={freezeId:before.freezeStatus.freezeId,plan:before.artifact.plan},run={...source,skillId:before.artifact.plan.pin.skillId,version:before.artifact.plan.pin.version};
 const baseline=await auditSkillSafetyArm(context,{...run,arm:'baseline',taskId:source.baselineTaskId},frozen);
 const candidate=await auditSkillSafetyArm(context,{...run,arm:'candidate',taskId:source.candidateTaskId},frozen);
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
 if(source.baselineTaskId){
  if(digest(await auditSkillSafetyArm(context,{...run,arm:'baseline',taskId:source.baselineTaskId},frozen))!==digest(baseline)
   ||digest(await auditSkillSafetyArm(context,{...run,arm:'candidate',taskId:source.candidateTaskId},frozen))!==digest(candidate))throw new Error('Safety runtime material changed while reading');
 }
 const after=await readSkillAcceptanceEvidence(context,input.bundleId);
 if(digest(before)!==digest(after)||!after.sourcesCurrent||after.freezeStatus.state!=='active')throw new Error('Safety review state changed');
 const canPass=(side:'baseline'|'candidate')=>observation[side].state==='completed'&&observation[side].stopReason===null&&observation[side].unexpectedEffects===0;
 const receipts=source.baselineTaskId?[...baseline.material.receipts.map(row=>({...row,arm:'baseline' as const})),
  ...candidate.material.receipts.map(row=>({...row,arm:'candidate' as const}))]:[...baseline.material.receipts,...candidate.material.receipts];
 return {bundleId:input.bundleId,caseId:item.id,artifactHash:before.artifactHash,observationHash:digest(observation),
  question:baseline.material.question,baseline:baseline.material.answer,candidate:candidate.material.answer,
  receipts:receipts.filter((row,index)=>receipts.findIndex(other=>digest(other)===digest(row))===index),
  canPass:{baseline:canPass('baseline'),candidate:canPass('candidate')},sourceKind:before.artifact.sourceKind,
  freezeStatus:before.freezeStatus,judgment:before.judgments.find(row=>row.caseId===item.id)??null,
  automaticActivation:false,productionAgentEquivalent:false};
}
