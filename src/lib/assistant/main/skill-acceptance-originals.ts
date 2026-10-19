import type {PoolClient} from 'pg';
import {z} from 'zod';
import {tenantTransaction,withBoundTenantTransaction} from '@/lib/rag/db';
import {captureImmutableKnowledgeAsset,readImmutableKnowledgeAsset} from '@/lib/knowledge/immutable-asset-snapshot';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
import {lockSkillAcceptanceRunJournals,skillAcceptanceRunIds,skillAcceptanceAttachmentIds} from './skill-acceptance-run-locks';
import {resolveLockedSkillKnowledgeReceiptAssets} from './skill-knowledge-receipt-bytes';
import {digest} from './contracts';

const sha=z.string().regex(/^[a-f0-9]{64}$/),MAX_BYTES=52_428_800;
export const captureSkillAcceptanceOriginalsSchema=z.object({bundleId:z.uuid(),artifactHash:sha,sourceManifestHash:sha}).strict();
type Context={userId:string};
async function selectOriginals(client:PoolClient,context:Context,bundleId:string){
 const active=await client.query("select id from app_user where id=$1 and status='active' for share",[context.userId]);
 if(active.rows.length!==1)throw new Error('Original capture account unavailable');
 const evidence=await readLockedSkillAcceptanceEvidence(client,context,bundleId);
 await lockSkillAcceptanceRunJournals(client,context.userId,evidence.artifact);
 const runs=skillAcceptanceRunIds(evidence.artifact);
 const tasks=await client.query<{input:unknown}>('select input from agent_run where user_id=$1 and id=any($2::uuid[]) order by id',[context.userId,runs]);
 if(tasks.rows.length!==runs.length)throw new Error('Original capture tasks unavailable');
 const receipts=await client.query<{tool:string;output:unknown}>(`select tool_id as tool,output from agent_tool_call where user_id=$1 and run_id=any($2::uuid[])
  and effect='read' and status='completed' and output->>'status' in ('success','partial') order by id`,[context.userId,runs]);
 const knowledge=await resolveLockedSkillKnowledgeReceiptAssets(client,context.userId,receipts.rows);
 const ids=[...new Set([...skillAcceptanceAttachmentIds(tasks.rows),...knowledge.assetIds])].sort();
 if(ids.length>10_000)throw new Error('Original capture source count exceeded');
 const assets:Array<{id:string;title:string;sourceSha256:string;byteSize:number;captured:boolean}>=[];
 for(let offset=0;offset<ids.length;offset+=100){
  const batch=ids.slice(offset,offset+100);
  const rows=await client.query<{id:string;title:string;source_sha256:string;byte_size:string;captured:boolean}>(`select a.id,d.title,a.source_sha256,a.byte_size::text,
   exists(select 1 from knowledge_asset_immutable_snapshot s where s.asset_id=a.id and s.source_sha256=a.source_sha256 and s.byte_size=a.byte_size) captured
   from knowledge_asset a join knowledge_document d on d.id=a.document_id where a.id=any($1::uuid[]) and a.registration_status='registered'
   and d.status='active' and (d.owner_id=$2 or d.visibility='shared') order by a.id`,[batch,context.userId]);
  if(rows.rows.length!==batch.length||rows.rows.some((row,index)=>row.id!==batch[index]))throw new Error('Original capture source unavailable');
  for(const row of rows.rows)assets.push({id:row.id,title:row.title,sourceSha256:sha.parse(row.source_sha256),byteSize:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(Number(row.byte_size)),captured:row.captured});
 }
 const totalBytes=assets.reduce((sum,row)=>sum+row.byteSize,0);if(!Number.isSafeInteger(totalBytes))throw new Error('Original capture size invalid');
 const capturedCount=assets.filter(row=>row.captured).length;
 return {bundleId,artifactHash:evidence.artifactHash,
  sourceManifestHash:digest(assets.map(({id,sourceSha256,byteSize})=>({id,sourceSha256,byteSize}))),
  assetCount:assets.length,capturedCount,pendingCount:assets.length-capturedCount,totalBytes,
  unsupportedCount:assets.filter(row=>!row.captured&&row.byteSize>MAX_BYTES).length,
  assets,automaticActivation:false as const};
}

/** Explicit account action only. Attachments and successful task knowledge
 * receipts are selected from server-owned bundle/run records, never HTTP IDs.
 * Previews do not write or read file bytes; capture is atomic and idempotent. */
export async function previewSkillAcceptanceOriginals(context:Context,bundleId:string){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);z.uuid().parse(bundleId);
 return tenantTransaction(context.userId,client=>withBoundTenantTransaction(client,context.userId,()=>selectOriginals(client,context,bundleId)));
}
export async function captureSkillAcceptanceOriginals(context:Context,input:unknown){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);const p=captureSkillAcceptanceOriginalsSchema.parse(input);
 return tenantTransaction(context.userId,client=>withBoundTenantTransaction(client,context.userId,async()=>{
  const selected=await selectOriginals(client,context,p.bundleId);
  if(selected.artifactHash!==p.artifactHash||selected.sourceManifestHash!==p.sourceManifestHash)throw new Error('Original capture preview changed');
  if(selected.unsupportedCount)throw new Error('Original capture size unsupported');
  for(const asset of selected.assets){
   const existing=await readImmutableKnowledgeAsset(client,context.userId,asset.id,asset.sourceSha256);
   if(existing){if(existing.byteSize!==asset.byteSize)throw new Error('Original capture snapshot changed');}
   else await captureImmutableKnowledgeAsset(client,context.userId,asset.id);
  }
  const after=await selectOriginals(client,context,p.bundleId);
  if(after.artifactHash!==p.artifactHash||after.sourceManifestHash!==p.sourceManifestHash||after.capturedCount!==after.assetCount)
   throw new Error('Original capture source changed');
  return after;
 }));
}
