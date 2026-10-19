import type {PoolClient} from 'pg';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {readSkillAcceptanceReviewCase} from './skill-acceptance-review';
import {evaluateLockedSkillAcceptancePolicy} from './skill-locked-acceptance-policy';
import {lockSkillAcceptanceRunJournals} from './skill-acceptance-run-locks';
import {lockSkillAcceptancePinnedMethods} from './skill-pinned-method-locks';
import {withCurrentDecisionMemory} from './memory-message-guard';
import {revalidateLockedSkillExperienceTimes} from './skill-experience-time-check';
import {revalidateLockedSkillAttachmentBytes} from './skill-attachment-bytes';
import {revalidateLockedSkillKnowledgeReceiptBytes} from './skill-knowledge-receipt-bytes';
import {revalidateLockedSkillMemoryReceipts} from './skill-memory-receipt-check';
import {readLockedSkillRunnerAttestation} from './skill-runner-attestation-store';

/** Keep consumed receipts in a private closure inside the owning transaction;
 * public wrappers expose hashes/counts only, never source contents or callbacks. */
async function prepareLockedSkillAcceptanceMaterials(client:PoolClient,context:{userId:string},bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
  const before=await readLockedSkillAcceptanceEvidence(client,context,bundleId),hashes:Array<{caseId:string;observationHash:string;materialHash:string}>=[];
  const journalLocks={...await lockSkillAcceptanceRunJournals(client,context.userId,before.artifact),
   ...await lockSkillAcceptancePinnedMethods(client,context.userId,before.artifact)};
  const attachmentBytes=await revalidateLockedSkillAttachmentBytes(client,context.userId,before.artifact);
  const consumedReceipts:Array<{tool:string;input:unknown;output:unknown}>=[];
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
   if(item.provenance==='historical-task'||item.provenance==='prospective-task')consumedReceipts.push(...material.receipts);
  }
  const recheckKnowledgeBytes=()=>revalidateLockedSkillKnowledgeReceiptBytes(client,context.userId,consumedReceipts);
  const knowledgeBytes=await recheckKnowledgeBytes();
  const recheckMemoryReceipts=()=>revalidateLockedSkillMemoryReceipts(client,context.userId,consumedReceipts);
  const memoryReceipts=await recheckMemoryReceipts();
  const after=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(after.artifactHash!==before.artifactHash||after.latestReviewHash!==before.latestReviewHash||digest(after.currentPin)!==digest(before.currentPin))
   throw new Error('Locked evidence changed during material reconstruction');
  return {recheckKnowledgeBytes,recheckMemoryReceipts,materials:{...journalLocks,...attachmentBytes,...knowledgeBytes,...memoryReceipts,knowledgeSourcesLocked:after.knowledgeSourcesLocked,decisionMemorySourcesLocked:after.decisionMemorySourcesLocked,artifactHash:after.artifactHash,latestReviewHash:after.latestReviewHash,materials:hashes,materialsHash:digest(hashes),
   skillCatalogSourcesLocked:after.skillCatalogSourcesLocked,
   sourcePayloadsRevalidated:true as const,sourceRevocationsLocked:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const}};
 });
}
export async function revalidateLockedSkillAcceptanceMaterials(client:PoolClient,context:{userId:string},bundleId:string){
 return (await prepareLockedSkillAcceptanceMaterials(client,context,bundleId)).materials;
}
/** Complete read-side preparation, not an activation grant: mutable source
 * revocations and production provenance still need final transaction validation. */
export async function evaluateLockedSkillAcceptanceReadiness(client:PoolClient,context:{userId:string},bundleId:string){
 assertLocalAnalysisBoundary();
 return withBoundTenantTransaction(client,context.userId,async()=>{
  // Hold admission before capturing the memory snapshot. Row locks cannot stop
  // valid_from/valid_until from crossing while materials and policy are rebuilt.
  await client.query('select lock_skill_knowledge_sources()');
  return withCurrentDecisionMemory(context.userId,async()=>{
  const declaration=await readLockedSkillRunnerAttestation(client,context,bundleId);
  const preparation=await prepareLockedSkillAcceptanceMaterials(client,context,bundleId),materials=preparation.materials;
  const policy=await evaluateLockedSkillAcceptancePolicy(client,context,bundleId);
  if(materials.artifactHash!==policy.artifactHash||materials.latestReviewHash!==policy.latestReviewHash)
   throw new Error('Locked material and policy snapshots differ');
  const final=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
  if(final.artifactHash!==materials.artifactHash||final.latestReviewHash!==materials.latestReviewHash)
   throw new Error('Locked acceptance changed before final experience time check');
  const attachmentBytes=await revalidateLockedSkillAttachmentBytes(client,context.userId,final.artifact);
  if(attachmentBytes.attachmentBytesManifestHash!==materials.attachmentBytesManifestHash)throw new Error('Acceptance attachment registration changed after preparation');
  const knowledgeBytes=await preparation.recheckKnowledgeBytes();
  if(digest(knowledgeBytes)!==digest({knowledgeReceiptBytesRevalidated:materials.knowledgeReceiptBytesRevalidated,
   knowledgeReceiptAssetCount:materials.knowledgeReceiptAssetCount,knowledgeReceiptDatabaseOnlyCount:materials.knowledgeReceiptDatabaseOnlyCount,
   knowledgeReceiptBytesManifestHash:materials.knowledgeReceiptBytesManifestHash}))throw new Error('Acceptance knowledge receipt sources changed after preparation');
  const memoryReceipts=await preparation.recheckMemoryReceipts();
  if(memoryReceipts.memoryReceiptCount!==materials.memoryReceiptCount)throw new Error('Acceptance memory receipt coverage changed after preparation');
  const finalDeclaration=await readLockedSkillRunnerAttestation(client,context,bundleId);
  if(declaration.runnerDeclarationRequired!==finalDeclaration.runnerDeclarationRequired
   ||declaration.runnerDeclarationRevalidated!==finalDeclaration.runnerDeclarationRevalidated
   ||declaration.runnerDeclarationRequired&&finalDeclaration.runnerDeclarationRequired&&(
    declaration.runnerDeclarationId!==finalDeclaration.runnerDeclarationId||declaration.runnerStatementHash!==finalDeclaration.runnerStatementHash
    ||declaration.runnerRegistryHash!==finalDeclaration.runnerRegistryHash))throw new Error('Runner declaration changed during acceptance preparation');
  const methodTimes=await revalidateLockedSkillExperienceTimes(client,context.userId,final.artifact);
  return {...policy,prospectiveCaptureSourcesLocked:materials.prospectiveCaptureSourcesLocked,prospectiveJobCount:materials.prospectiveJobCount,knowledgeSourcesLocked:materials.knowledgeSourcesLocked,decisionMemorySourcesLocked:materials.decisionMemorySourcesLocked,timelineSourcesLocked:materials.timelineSourcesLocked,timelineCustomerCount:materials.timelineCustomerCount,mailReadSourcesLocked:materials.mailReadSourcesLocked,mailCount:materials.mailCount,attachmentMetadataLocked:materials.attachmentMetadataLocked,attachmentCount:materials.attachmentCount,taskOriginsLocked:materials.taskOriginsLocked,taskJournalsLocked:materials.taskJournalsLocked,runCount:materials.runCount,materials:materials.materials,materialsHash:materials.materialsHash,sourcePayloadsRevalidated:true as const,
   pinnedMethodSourcesLocked:materials.pinnedMethodSourcesLocked,pinnedMethodPinCount:materials.pinnedMethodPinCount,
   skillCatalogSourcesLocked:materials.skillCatalogSourcesLocked,
   decisionMemorySnapshotRevalidated:true as const,
   ...methodTimes,
   ...attachmentBytes,
   ...knowledgeBytes,
   ...memoryReceipts,
   ...finalDeclaration,
   pinnedMethodVersionCount:materials.pinnedMethodVersionCount,pinnedMethodExperienceObservationCount:materials.pinnedMethodExperienceObservationCount,
   sourceRevocationsLocked:false as const,collectorProvenanceVerified:false as const,automaticActivation:false as const};
  });
 });
}
