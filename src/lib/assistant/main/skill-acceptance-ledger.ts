import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {lockSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {skillAcceptanceRunIds,lockRecordedTaskRunJournals} from './skill-acceptance-run-locks';

const limit=10000;
/** Lifecycle fingerprint only. Empty/unqualified fixture journals can be
 * fingerprinted; this never certifies model execution, capture timing or quality.
 * Source admission -> bundle/freeze -> original tasks -> capture metadata. */
export async function captureSkillAcceptanceLedger(client:PoolClient,userId:string,bundleId:string,artifactHash:string){
 z.uuid().parse(userId);z.uuid().parse(bundleId);z.string().regex(/^[a-f0-9]{64}$/).parse(artifactHash);
 return withBoundTenantTransaction(client,userId,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  await client.query("select pg_advisory_xact_lock(hashtextextended('skill-acceptance:'||$1::uuid::text,0))",[bundleId]);
  const row=(await client.query<{owner_id:string;skill_id:string;version:number;source_kind:string;plan:unknown;observations:unknown;raw_receipts:unknown;artifact_hash:string}>(
   'select owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash from agent_skill_acceptance_bundle where owner_id=$1 and id=$2',[userId,bundleId])).rows[0];
  if(!row||row.artifact_hash!==artifactHash)throw new Error('Acceptance ledger bundle unavailable');
  const artifact={sourceKind:row.source_kind,plan:row.plan,observations:row.observations,rawReceipts:row.raw_receipts};
  if(digest(artifact)!==artifactHash)throw new Error('Acceptance ledger artifact changed');
  const freezeId=z.object({collector:z.object({freezeId:z.uuid()}).passthrough()}).passthrough().parse(row.raw_receipts).collector.freezeId;
  await lockSkillAcceptanceFreeze(client,userId,freezeId);
  const runIds=skillAcceptanceRunIds(artifact as Parameters<typeof skillAcceptanceRunIds>[0]);
  await lockRecordedTaskRunJournals(client,userId,runIds,{successfulReadSourcesOnly:true});
  const selectCaptures=async()=>(await client.query<{id:string;run_id:string;capture:unknown;campaign:unknown}>(`select j.id,j.run_id,
   jsonb_build_object('id',j.id,'ownerId',j.owner_id,'runId',j.run_id,'campaignId',j.campaign_id,'start',j.start_context,'final',j.final_context,'capturedAt',j.created_at,'readyAt',j.ready_at) capture,
   jsonb_build_object('id',c.id,'ownerId',c.owner_id,'skillId',c.skill_id,'version',c.version,'contentHash',c.content_hash,'sourceHash',c.source_hash,'config',c.config,'enabled',c.enabled,'registeredAt',c.created_at,'expiresAt',c.expires_at) campaign
   from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.owner_id=j.owner_id and c.id=j.campaign_id
   where j.owner_id=$1 and j.run_id=any($2::uuid[]) and c.skill_id=$3 and c.version=$4 order by j.id limit 10001`,[userId,runIds,row.skill_id,row.version])).rows;
  const before=await selectCaptures();if(before.length>limit)throw new Error('Acceptance ledger capture limit exceeded');
  for(let offset=0;offset<before.length;offset+=100){
   const batch=before.slice(offset,offset+100);
   const locked=(await client.query<{n:number}>('select lock_skill_shadow_sources($1::uuid[],$2::uuid[]) n',[batch.map(value=>value.id),batch.map(value=>value.run_id)])).rows[0]?.n;
   if(locked!==batch.length)throw new Error('Acceptance ledger capture locks incomplete');
  }
  const captures=await selectCaptures();
  if(digest(before)!==digest(captures))throw new Error('Acceptance ledger captures changed while locking');
  const attempts=(await client.query<{attempt:unknown;outcome:unknown}>(`select to_jsonb(a) attempt,to_jsonb(o) outcome
   from agent_skill_model_attempt a left join agent_skill_model_outcome o on o.owner_id=a.owner_id and o.attempt_id=a.id
   where a.owner_id=$1 and a.freeze_id=$2 order by a.id limit 10001`,[userId,freezeId])).rows;
  if(attempts.length>limit)throw new Error('Acceptance ledger attempt limit exceeded');
  const declarationsAvailable=(await client.query<{available:boolean}>("select to_regclass('public.agent_skill_runner_attestation') is not null available")).rows[0]?.available;
  if(typeof declarationsAvailable!=='boolean'||row.source_kind==='production-runner-pending-verification'&&!declarationsAvailable)
   throw new Error('Acceptance ledger declaration schema unavailable');
  const declarations=declarationsAvailable?(await client.query('select to_jsonb(a) declaration from agent_skill_runner_attestation a where owner_id=$1 and bundle_id=$2 order by id limit 10001',[userId,bundleId])).rows:[];
  if(declarations.length>limit)throw new Error('Acceptance ledger declaration limit exceeded');
  return {acceptanceLedgerRevalidated:true as const,acceptanceLedgerHash:digest({protocol:'skill-acceptance-ledger-v1',artifactHash,freezeId,attempts,captures,declarationsAvailable,declarations}),
   acceptanceLedgerAttemptCount:attempts.length,acceptanceLedgerCaptureCount:captures.length,acceptanceLedgerDeclarationCount:declarations.length};
 });
}
