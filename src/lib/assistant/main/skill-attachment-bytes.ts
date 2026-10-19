import type {PoolClient} from 'pg';
import {z} from 'zod';
import {inspectKnowledgeAssetBytes} from '@/lib/knowledge/document-repository';
import {knowledgeAssetHasReadOnlyMount} from '@/lib/knowledge/read-only-mount';
import {skillAcceptanceRunIds,skillAcceptanceAttachmentIds} from './skill-acceptance-run-locks';
import {digest} from './contracts';

/** Requires retained task/knowledge metadata locks. This is a point-in-time
 * byte check, not a filesystem lease or permission to activate a Skill. */
export async function revalidateLockedSkillAttachmentBytes(client:PoolClient,userId:string,artifact:Parameters<typeof skillAcceptanceRunIds>[0]){
 z.uuid().parse(userId);const runs=skillAcceptanceRunIds(artifact);
 const tasks=await client.query<{input:unknown}>(`select input from agent_run where user_id=$1 and id=any($2::uuid[]) order by id`,[userId,runs]);
 if(tasks.rows.length!==runs.length)throw new Error('Acceptance attachment task unavailable');
 const ids=skillAcceptanceAttachmentIds(tasks.rows);
 const checked=await revalidateLockedKnowledgeAssetBytes(client,userId,ids);
 return {attachmentBytesRevalidated:true as const,attachmentBytesCount:checked.count,attachmentBytesManifestHash:checked.manifestHash,
  attachmentReadOnlyMountVerified:checked.readOnlyMountVerified};
}
/** Internal account-bound metadata must be protected by knowledge admission. */
export async function revalidateLockedKnowledgeAssetBytes(client:PoolClient,userId:string,assetIds:string[]){
 z.uuid().parse(userId);const ids=[...new Set(z.array(z.uuid()).max(10000).parse(assetIds))].sort();
 const manifest:Array<{id:string;storage_key:string;source_sha256:string;byte_size:string}>=[];
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
   try{
    const inspected=await inspectKnowledgeAssetBytes(asset.storage_key,asset.source_sha256);
    if(inspected.byteSize!==size)throw new Error('Acceptance attachment bytes changed');
   }catch(error){
    if(error instanceof Error&&/^Knowledge asset (changed during registration|no longer matches approved hash|is not a valid file)$/.test(error.message))
     throw new Error('Acceptance attachment bytes changed',{cause:error});
    throw error;
   }
   manifest.push(asset);
   if(!await knowledgeAssetHasReadOnlyMount(asset.storage_key))readOnlyMountVerified=false;
  }
 }
 return {count:ids.length,manifestHash:digest(manifest),readOnlyMountVerified};
}
