import {createHash} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {safeKnowledgeStorageKey,assertResolvedInsideKnowledgeRoot} from '@/lib/knowledge/document-repository';
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
 return {attachmentBytesRevalidated:true as const,attachmentBytesCount:checked.count,attachmentBytesManifestHash:checked.manifestHash};
}
/** Internal account-bound metadata must be protected by knowledge admission. */
export async function revalidateLockedKnowledgeAssetBytes(client:PoolClient,userId:string,assetIds:string[]){
 z.uuid().parse(userId);const ids=[...new Set(z.array(z.uuid()).max(10000).parse(assetIds))].sort();
 const manifest:Array<{id:string;storage_key:string;source_sha256:string;byte_size:string}>=[];
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
   const path=await realpath(resolve(safeKnowledgeStorageKey(asset.storage_key)));assertResolvedInsideKnowledgeRoot(path);
   const file=await open(path,'r');
   try{
    const before=await file.stat();
    if(!before.isFile()||before.size!==size)throw new Error('Acceptance attachment bytes changed');
    const hash=createHash('sha256'),buffer=Buffer.alloc(64*1024);let length=0;
    while(true){
     const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,size-length+1),null);
     if(!bytesRead)break;
     length+=bytesRead;if(length>size)throw new Error('Acceptance attachment bytes changed');
     hash.update(buffer.subarray(0,bytesRead));
    }
    const after=await file.stat();
    if(length!==size||hash.digest('hex')!==asset.source_sha256||after.size!==before.size
     ||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs
     ||await realpath(resolve(asset.storage_key))!==path)throw new Error('Acceptance attachment bytes changed');
   }finally{await file.close();}
   manifest.push(asset);
  }
 }
 return {count:ids.length,manifestHash:digest(manifest)};
}
