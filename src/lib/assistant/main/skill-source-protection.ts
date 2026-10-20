import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from './contracts';
import {withBoundTenantTransaction} from '@/lib/rag/db';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const proof=z.object({ownerId:z.uuid(),bundleId:z.uuid(),freezeId:z.uuid(),artifactHash:sha,latestReviewHash:sha,
 sourceKind:z.literal('production-runner-pending-verification'),trustRegistryLocked:z.literal(true),
 currentRuntimeIdentityHash:sha,frozenRuntimeIdentityHash:sha,
 taskOriginsLocked:z.literal(true),taskJournalsLocked:z.literal(true),runCount:z.number().int().positive(),
 knowledgeSourcesLocked:z.literal(true),decisionMemorySourcesLocked:z.literal(true),skillCatalogSourcesLocked:z.literal(true),
 pinnedMethodSourcesLocked:z.literal(true),prospectiveCaptureSourcesLocked:z.literal(true),timelineSourcesLocked:z.literal(true),
 mailReadSourcesLocked:z.literal(true),attachmentMetadataLocked:z.literal(true),
 sourcePayloadsRevalidated:z.literal(true),decisionMemorySnapshotRevalidated:z.literal(true),
 memoryReceiptSourcesRevalidated:z.literal(true),privateReceiptSourcesRevalidated:z.literal(true),memoryTimeFenceRevalidated:z.literal(true),
 canonicalOriginalCoverageRequired:z.literal(true),canonicalOriginalCoverageRevalidated:z.literal(true),canonicalOriginalCoverageHash:sha,
 activationSourcesRevalidated:z.literal(true),acceptanceLedgerRevalidated:z.literal(true),acceptanceLedgerHash:sha,
 methodExperienceTimesRevalidated:z.literal(true),acceptanceTimeCheckedAt:z.iso.datetime(),acceptanceValidBefore:z.iso.datetime(),
});
/** Internal composition over retained readers. Readiness is not sealing: only
 * the database activation fence may establish sourceRevocationsLocked. */
export async function prepareSkillSourceProtection(client:PoolClient,input:unknown){
 const blocked=(reason:string)=>({sourceRevocationGuardsReady:false as const,sourceRevocationsLocked:false as const,sourceProtectionBlockers:[reason]});
 const parsed=proof.safeParse(input);if(!parsed.success)return blocked('source-reader-proof-incomplete');
 const value=parsed.data;
 if(value.currentRuntimeIdentityHash!==value.frozenRuntimeIdentityHash)return blocked('source-runtime-identity-changed');
 if(Date.parse(value.acceptanceTimeCheckedAt)>=Date.parse(value.acceptanceValidBefore))return blocked('source-time-window-invalid');
 return withBoundTenantTransaction(client,value.ownerId,async()=>{
  const available=(await client.query<{available:boolean}>("select to_regprocedure('public.skill_activation_sources_ready(uuid,uuid,text)') is not null available")).rows[0]?.available;
  if(available!==true)return blocked('source-protection-schema-unavailable');
  const row=(await client.query<{ready:boolean;transaction_id:string}>(
   'select pg_current_xact_id()::text transaction_id,skill_activation_sources_ready($1,$2,$3) ready',
   [value.bundleId,value.freezeId,value.artifactHash])).rows[0];
  if(row?.ready!==true||typeof row.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(row.transaction_id))return blocked('source-guards-or-retained-locks-unavailable');
  return {sourceRevocationGuardsReady:true as const,sourceRevocationsLocked:false as const,sourceProtectionBlockers:[] as string[],
   sourceProtectionTransactionId:row.transaction_id,sourceProtectionHash:digest({protocol:'skill-source-protection-ready-v1',...value,transactionId:row.transaction_id})};
 });
}
