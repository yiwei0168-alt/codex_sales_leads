import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {readKnowledgeAssetSnapshot} from './document-repository';

/** Internal, explicit capture in the caller's bound tenant transaction. Public
 * actions must derive source IDs from owned server records. No backfill,
 * source promotion or activation permission is granted by this primitive. */
export async function captureImmutableKnowledgeAsset(client:PoolClient,userId:string,assetId:string){
 z.uuid().parse(userId);z.uuid().parse(assetId);
 return withBoundTenantTransaction(client,userId,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  const asset=(await client.query<{storage_key:string;source_sha256:string;byte_size:string}>(`select a.storage_key,a.source_sha256,a.byte_size::text
   from knowledge_asset a join knowledge_document d on d.id=a.document_id where a.id=$1 and a.registration_status='registered'
   and d.status='active' and (d.owner_id=$2 or d.visibility='shared')`,[assetId,userId])).rows[0];
  if(!asset)throw new Error('Immutable snapshot source unavailable');
  const source=await readKnowledgeAssetSnapshot(asset.storage_key,asset.source_sha256);
  if(!source.bytes||source.byteSize!==Number(asset.byte_size))throw new Error('Immutable snapshot source changed');
  const row=(await client.query<{id:string}>('select capture_immutable_asset_snapshot($1,$2,$3) id',[assetId,asset.source_sha256,source.bytes])).rows[0];
  if(!row?.id)throw new Error('Immutable snapshot capture failed');
  return {snapshotId:row.id,assetId,sourceSha256:source.sha256,byteSize:source.byteSize};
 });
}

/** Current RLS visibility plus complete byte verification. Snapshot existence
 * alone is never an acceptance or immutable-source qualification. */
export async function readImmutableKnowledgeAsset(client:PoolClient,userId:string,assetId:string,expectedSha256:string){
 z.uuid().parse(userId);z.uuid().parse(assetId);z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSha256);
 return withBoundTenantTransaction(client,userId,async()=>{
  const row=(await client.query<{id:string;source_sha256:string;byte_size:string;body:Buffer}>(`select id,source_sha256,byte_size::text,body
   from knowledge_asset_immutable_snapshot where asset_id=$1 and source_sha256=$2`,[assetId,expectedSha256])).rows[0];
  if(!row)return null;
  if(!Buffer.isBuffer(row.body)||row.body.length!==Number(row.byte_size)
   ||createHash('sha256').update(row.body).digest('hex')!==row.source_sha256)throw new Error('Immutable snapshot integrity mismatch');
  return {snapshotId:row.id,sourceSha256:row.source_sha256,byteSize:row.body.length,bytes:row.body};
 });
}

/** Compatibility for historical read-only acceptance clones. Absence means no
 * immutable evidence, never permission to qualify a filesystem-only source. */
export async function readAvailableImmutableKnowledgeAsset(client:PoolClient,userId:string,assetId:string,expectedSha256:string){
 return withBoundTenantTransaction(client,userId,async()=>{
  const available=(await client.query<{available:boolean}>("select to_regclass('public.knowledge_asset_immutable_snapshot') is not null available")).rows[0]?.available;
  return available?readImmutableKnowledgeAsset(client,userId,assetId,expectedSha256):null;
 });
}
