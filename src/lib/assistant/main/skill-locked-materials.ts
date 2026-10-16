import type {PoolClient} from 'pg';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {readSkillAcceptanceReviewCase} from './skill-acceptance-review';
import {evaluateLockedSkillAcceptancePolicy} from './skill-locked-acceptance-policy';
import {lockSkillAcceptanceRunJournals} from './skill-acceptance-run-locks';

/** Rebuild every planned case under retained evidence locks. Only hashes leave this
 * function. Source revocation rows are not yet locked through the final update. */
export async function revalidateLockedSkillAcceptanceMaterials(client:PoolClient,context:{userId:string},bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
  const before=await readLockedSkillAcceptanceEvidence(client,context,bundleId),hashes:Array<{caseId:string;observationHash:string;materialHash:string}>=[];
  const journalLocks=await lockSkillAcceptanceRunJournals(client,context.userId,before.artifact);
  for(const item of before.artifact.plan.cases){
   const observation=before.artifact.observations.find(row=>row.caseId===item.id);
   if(!observation)throw new Error('Locked material observation missing');
   const material=await readSkillAcceptanceReviewCase(context,{bundleId,caseId:item.id});
   if(material.bundleId!==bundleId||material.caseId!==item.id||material.artifactHash!==before.artifactHash
    ||material.observationHash!==digest(observation)||material.sourceKind!==before.artifact.sourceKind
    ||material.freezeStatus.state!=='active'||material.freezeStatus.freezeId!==before.freezeStatus.freezeId
    ||!material.canPass.baseline||!material.canPass.candidate
    ||digest(material.baseline)!==observation.baseline.answerHash||digest(material.candidate)!==observation.candidate.answerHash)
    throw new Error('Locked material binding or completed arms changed');
   hashes.push({caseId:item.id,observationHash:material.observationHash,materialHash:digest(material)});
  }
  const after=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(after.artifactHash!==before.artifactHash||after.latestReviewHash!==before.latestReviewHash||digest(after.currentPin)!==digest(before.currentPin))
   throw new Error('Locked evidence changed during material reconstruction');
  return {...journalLocks,knowledgeSourcesLocked:after.knowledgeSourcesLocked,decisionMemorySourcesLocked:after.decisionMemorySourcesLocked,artifactHash:after.artifactHash,latestReviewHash:after.latestReviewHash,materials:hashes,materialsHash:digest(hashes),
   sourcePayloadsRevalidated:true as const,sourceRevocationsLocked:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
 });
}
/** Complete read-side preparation, not an activation grant: mutable source
 * revocations and production provenance still need final transaction validation. */
export async function evaluateLockedSkillAcceptanceReadiness(client:PoolClient,context:{userId:string},bundleId:string){
 return withBoundTenantTransaction(client,context.userId,async()=>{
  const materials=await revalidateLockedSkillAcceptanceMaterials(client,context,bundleId);
  const policy=await evaluateLockedSkillAcceptancePolicy(client,context,bundleId);
  if(materials.artifactHash!==policy.artifactHash||materials.latestReviewHash!==policy.latestReviewHash)
   throw new Error('Locked material and policy snapshots differ');
  return {...policy,knowledgeSourcesLocked:materials.knowledgeSourcesLocked,decisionMemorySourcesLocked:materials.decisionMemorySourcesLocked,timelineSourcesLocked:materials.timelineSourcesLocked,timelineCustomerCount:materials.timelineCustomerCount,mailReadSourcesLocked:materials.mailReadSourcesLocked,mailCount:materials.mailCount,attachmentMetadataLocked:materials.attachmentMetadataLocked,attachmentCount:materials.attachmentCount,taskOriginsLocked:materials.taskOriginsLocked,taskJournalsLocked:materials.taskJournalsLocked,runCount:materials.runCount,materials:materials.materials,materialsHash:materials.materialsHash,sourcePayloadsRevalidated:true as const,
   sourceRevocationsLocked:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
 });
}
