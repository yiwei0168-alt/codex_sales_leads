import type {PoolClient} from 'pg';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {z} from 'zod';
import {inspectKnowledgeAssetBytes,safeKnowledgeStorageKey} from '@/lib/knowledge/document-repository';
import {readAvailableImmutableKnowledgeAsset} from '@/lib/knowledge/immutable-asset-snapshot';
import {knowledgeAssetHasReadOnlyMount} from '@/lib/knowledge/read-only-mount';
import {skillAcceptanceRunIds,skillAcceptanceAttachmentIds} from './skill-acceptance-run-locks';
import {digest} from './contracts';

/** Requires retained task/knowledge metadata locks. Captured originals use the
 * same immutable bytes as downloads; uncaptured files remain point-in-time
 * checks, not a filesystem lease or permission to activate a Skill. */
export async function revalidateLockedSkillAttachmentBytes(client:PoolClient,userId:string,artifact:Parameters<typeof skillAcceptanceRunIds>[0]){
 z.uuid().parse(userId);const runs=skillAcceptanceRunIds(artifact);
 const tasks=await client.query<{input:unknown}>(`select input from agent_run where user_id=$1 and id=any($2::uuid[]) order by id`,[userId,runs]);
 if(tasks.rows.length!==runs.length)throw new Error('Acceptance attachment task unavailable');
 const ids=skillAcceptanceAttachmentIds(tasks.rows);
 const checked=await revalidateLockedKnowledgeAssetBytes(client,userId,ids);
 return {attachmentBytesRevalidated:true as const,attachmentBytesCount:checked.count,attachmentBytesManifestHash:checked.manifestHash,
  attachmentReadOnlyMountVerified:checked.readOnlyMountVerified,
  attachmentImmutableSnapshotCount:checked.immutableSnapshotCount,attachmentImmutableSnapshotManifestHash:checked.immutableSnapshotManifestHash};
}
/** Acquire source admission inside the caller's validated account transaction;
 * it remains held after this function returns, until that transaction ends. */
export async function revalidateLockedKnowledgeAssetBytes(client:PoolClient,userId:string,assetIds:string[]){
 z.uuid().parse(userId);const ids=[...new Set(z.array(z.uuid()).max(10000).parse(assetIds))].sort();
 return withBoundTenantTransaction(client,userId,async()=>{
 if(ids.length)await client.query('select lock_skill_knowledge_sources()');
 const manifest:Array<{id:string;storage_key:string;source_sha256:string;byte_size:string}>=[];
 const snapshots:Array<{assetId:string;snapshotId:string;sourceSha256:string;byteSize:number}>=[];
 let readOnlyMountVerified=true;
 for(let offset=0;offset<ids.length;offset+=100){
  const batch=ids.slice(offset,offset+100);
  const assets=await client.query<{id:string;storage_key:string;source_sha256:string;byte_size:string}>(`
   select a.id,a.storage_key,a.source_sha256,a.byte_size::text from knowledge_asset a
   join knowledge_document d on d.id=a.document_id where a.id=any($1::uuid[])
   and a.registration_status='registered' and d.status='active' and (d.owner_id=$2 or d.visibility='shared') order by a.id`,[batch,userId]);
  if(assets.rows.length!==batch.length||assets.rows.some((row,index)=>row.id!==batch[index]))throw new Error('Acceptance attachment unavailable');
  for(const asset of assets.rows){
   const size=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(Number(asset.byte_size));
   z.string().regex(/^[0-9a-f]{64}$/).parse(asset.source_sha256);
   safeKnowledgeStorageKey(asset.storage_key);
   const snapshot=await readAvailableImmutableKnowledgeAsset(client,userId,asset.id,asset.source_sha256);
   if(snapshot){
    if(snapshot.byteSize!==size)throw new Error('Acceptance attachment snapshot changed');
    snapshots.push({assetId:asset.id,snapshotId:snapshot.snapshotId,sourceSha256:snapshot.sourceSha256,byteSize:snapshot.byteSize});
    // This source is database-backed, not an observed filesystem mount.
    readOnlyMountVerified=false;
   }else{
    try{
     const inspected=await inspectKnowledgeAssetBytes(asset.storage_key,asset.source_sha256);
     if(inspected.byteSize!==size)throw new Error('Acceptance attachment bytes changed');
    }catch(error){
     if(error instanceof Error&&/^Knowledge asset (changed during registration|no longer matches approved hash|is not a valid file)$/.test(error.message))
      throw new Error('Acceptance attachment bytes changed',{cause:error});
     throw error;
    }
    if(!await knowledgeAssetHasReadOnlyMount(asset.storage_key))readOnlyMountVerified=false;
   }
   manifest.push(asset);
  }
 }
 return {count:ids.length,manifestHash:digest(manifest),readOnlyMountVerified,
  immutableSnapshotCount:snapshots.length,immutableSnapshotManifestHash:digest(snapshots)};
 });
}
