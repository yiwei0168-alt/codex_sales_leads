import type {PoolClient} from 'pg';
import {z} from 'zod';
import {revalidateLockedKnowledgeAssetBytes} from './skill-attachment-bytes';

type Receipt={tool:string;output:unknown};
const object=(v:unknown)=>z.record(z.string(),z.unknown()).parse(v);
const list=(v:unknown)=>z.array(z.unknown()).max(10000).parse(v);
/** Receipts must already be bound to historical/prospective task journals and
 * current source semantics under retained locks. Safety-fixture receipts are
 * intentionally excluded by the caller: they are predefined adversarial input. */
export async function revalidateLockedSkillKnowledgeReceiptBytes(client:PoolClient,userId:string,receipts:Receipt[]){
 z.uuid().parse(userId);
 const assets=new Set<string>(),chunks=new Set<string>(),v3Required=new Set<string>(),nodes=new Set<string>();
 const addChunks=(v:unknown)=>{for(const value of list(v)){
  const row=object(value),id=z.uuid().parse(row.id);chunks.add(id);
  const metadata=row.metadata===undefined?{}:object(row.metadata);
  if(metadata.releaseId!==undefined||metadata.sourceSha256!==undefined)v3Required.add(id);
 }};
 const addFacts=(v:unknown)=>{for(const value of list(v)){const id=z.uuid().parse(object(value).chunkId);chunks.add(id);v3Required.add(id);}};
 for(const receipt of receipts){
  if(!['knowledge_search','knowledge_facts','knowledge_compare','knowledge_originals','vectorless_read'].includes(receipt.tool))continue;
  const output=z.object({status:z.enum(['success','partial']),data:z.unknown()}).parse(receipt.output);
  if(receipt.tool==='knowledge_search')addChunks(output.data);
  if(receipt.tool==='knowledge_facts')addFacts(output.data);
  if(receipt.tool==='knowledge_compare')for(const entry of list(object(output.data).entities)){
   const entity=object(entry);addChunks(entity.evidence);addFacts(entity.verifiedFacts);
  }
  if(receipt.tool==='knowledge_originals'){
   const data=Array.isArray(output.data)?output.data:object(output.data);
   const documents=Array.isArray(data)?data:data.kind==='insufficient-evidence'&&data.reason==='no-accessible-match'?[]:data.documents;
   for(const entry of list(documents))assets.add(z.uuid().parse(object(entry).id));
  }
  if(receipt.tool==='vectorless_read'){
   const evidence=object(output.data).evidence;if(evidence!==undefined&&evidence!==null)nodes.add(z.uuid().parse(object(evidence).id));
  }
 }
 let databaseOnlyCount=0;
 for(const ids of [chunks,nodes])for(let offset=0;offset<ids.size;offset+=100){
  const batch=[...ids].sort().slice(offset,offset+100);
  const mapped=ids===chunks?await client.query<{id:string;asset_id:string|null;kind:string}>(`
   select c.id,s.asset_id,'v3' as kind from knowledge_chunk_v3 c
   join knowledge_source_revision_v3 s on s.id=c.source_revision_id and s.release_id=c.release_id
   join knowledge_release_pointer_v3 p on p.release_id=c.release_id and p.scope_kind='shared'
   join knowledge_document d on d.id=c.document_id join knowledge_asset a on a.id=s.asset_id and a.document_id=d.id and a.source_sha256=s.source_sha256
   where c.id=any($1::uuid[]) and d.status='active' and (d.owner_id=$2 or d.visibility='shared')
   union all select c.id,null::uuid,'legacy' as kind from knowledge_chunk c join knowledge_document d on d.id=c.document_id
   where c.id=any($1::uuid[]) and d.status='active' and (d.owner_id=$2 or d.visibility='shared')`,[batch,userId]):
   await client.query<{id:string;asset_id:string|null;kind:string}>(`
   select n.id,v.asset_id,'tree' as kind from knowledge_tree_node n join knowledge_tree_version v on v.id=n.version_id
   join knowledge_document d on d.current_tree_version_id=v.id and d.id=v.document_id
   where n.id=any($1::uuid[]) and n.node_kind='evidence' and v.status='ready' and d.status='active'
   and (d.owner_id=$2 or d.visibility='shared')`,[batch,userId]);
  for(const id of batch){
   const matches=mapped.rows.filter(row=>row.id===id);
   if(matches.length!==1||(v3Required.has(id)&&matches[0].kind!=='v3'))throw new Error('Acceptance knowledge receipt source unavailable');
   if(matches[0].asset_id===null)databaseOnlyCount++;else assets.add(z.uuid().parse(matches[0].asset_id));
  }
 }
 const checked=await revalidateLockedKnowledgeAssetBytes(client,userId,[...assets]);
 return {knowledgeReceiptBytesRevalidated:true as const,knowledgeReceiptAssetCount:checked.count,
  knowledgeReceiptReadOnlyMountVerified:checked.readOnlyMountVerified,
  knowledgeReceiptImmutableSnapshotCount:checked.immutableSnapshotCount,
  knowledgeReceiptImmutableSnapshotManifestHash:checked.immutableSnapshotManifestHash,
  knowledgeReceiptDatabaseOnlyCount:databaseOnlyCount,knowledgeReceiptBytesManifestHash:checked.manifestHash};
}
