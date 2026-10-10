import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {currentKnowledgeChunkEvidence} from '@/lib/rag/repository';
import {readEvidence} from '@/lib/knowledge/vectorless';
import {digest,type ModelMessage} from './contracts';

export const SOURCE_CHANGED_REPLY='资料的权限、版本或核验状态已变化，或暂时无法复核。本次未返回受影响的回答，也未继续执行后续操作。请重新发起查询以读取当前资料。';
export class KnowledgeSourceChangedError extends Error {constructor(){super('Knowledge source validation failed');}}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const id=(value:unknown)=>z.uuid().parse(value);
const guardedTools=new Set(['knowledge_search','knowledge_facts','knowledge_compare','knowledge_originals','vectorless_read']);

/** Only server tool messages paired to actual tool calls count as evidence, never user text. */
export async function assertCurrentKnowledgeMessages(userId:string,messages:ModelMessage[]){
 try{
  const calls=new Map<string,string>();
  for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
    if(call.function.name!=='execute_tool')continue;
    try{const input=JSON.parse(call.function.arguments);if(guardedTools.has(input.tool))calls.set(call.id,input.tool);}catch{/* Invalid invocation cannot have executed. */}
  }
  const chunks:Array<{id:string;content?:string;documentId?:unknown;metadata?:Record<string,unknown>}>=[],facts:Record<string,unknown>[]=[],assets:Record<string,unknown>[]=[],nodes:Record<string,unknown>[]=[];
  const addChunks=(items:unknown[])=>{for(const item of items){const chunk=object(item);chunks.push({id:id(chunk.id),content:z.string().parse(chunk.content),documentId:chunk.documentId,metadata:object(chunk.metadata)});}};
  const addFacts=(items:unknown[])=>{for(const item of items){const fact=object(item);facts.push(fact);chunks.push({id:id(fact.chunkId)});}};
  for(const message of messages){
    const tool=message.role==='tool'?calls.get(message.tool_call_id??''):undefined;if(!tool)continue;
    const output=object(JSON.parse(message.content??'{}')),data=object(output.data);
    if(tool==='knowledge_search')addChunks(list(output.data));
    if(tool==='knowledge_facts')addFacts(list(output.data));
    if(tool==='knowledge_compare')for(const entry of list(data.entities)){const entity=object(entry);addChunks(list(entity.evidence));addFacts(list(entity.verifiedFacts));}
    if(tool==='knowledge_originals')assets.push(...list(Array.isArray(output.data)?output.data:data.documents).map(object));
    if(tool==='vectorless_read'&&data.evidence)nodes.push(object(data.evidence));
  }
  const current=await currentKnowledgeChunkEvidence(userId,[...new Set(chunks.map(chunk=>chunk.id))]);
  const byId=new Map(current.map(chunk=>[chunk.id,chunk]));
  for(const chunk of chunks){const now=byId.get(chunk.id);
    if(!now||(chunk.content!==undefined&&chunk.content!==now.content)||(chunk.documentId!==undefined&&chunk.documentId!==now.documentId))throw new KnowledgeSourceChangedError();
    for(const key of ['releaseId','sourceLocation','sourceSha256'] as const)if(chunk.metadata?.[key]!==undefined&&digest(chunk.metadata[key])!==digest(now[key]))throw new KnowledgeSourceChangedError();
  }
  if(facts.length){
    const rows=await tenantQuery<{id:string;chunkId:string;typedValue:unknown;rawValue:string;unit:string|null}>(userId,`select f.id,f.chunk_id as "chunkId",f.typed_value as "typedValue",f.raw_value as "rawValue",f.unit
      from knowledge_fact_v3 f join knowledge_release_pointer_v3 p on p.release_id=f.release_id and p.scope_kind='shared'
      where f.id=any($1::uuid[]) and f.verification_status='verified'
        and not exists(select 1 from knowledge_review_queue_v3 q where q.fact_id=f.id and q.release_id=f.release_id and q.status='open')`,[[...new Set(facts.map(f=>id(f.id)))]]);
    for(const fact of facts){const now=rows.find(row=>row.id===fact.id);
      if(!now||now.chunkId!==fact.chunkId||digest([now.typedValue,now.rawValue,now.unit])!==digest([fact.typedValue,fact.rawValue,fact.unit]))throw new KnowledgeSourceChangedError();}
  }
  if(assets.length){
    const rows=await tenantQuery<{id:string;sha256:string}>(userId,`select a.id,a.source_sha256 as sha256 from knowledge_asset a join knowledge_document d on d.id=a.document_id
      left join knowledge_tree_version v on v.id=d.current_tree_version_id
      where a.id=any($1::uuid[]) and d.status='active' and (d.visibility='shared' or d.owner_id=$2) and a.registration_status='registered'
      and (d.current_tree_version_id is null or (v.status='ready' and v.asset_id=a.id and v.source_sha256=a.source_sha256))`,[[...new Set(assets.map(a=>id(a.id)))],userId]);
    for(const asset of assets)if(!rows.some(row=>row.id===asset.id&&row.sha256===asset.sha256))throw new KnowledgeSourceChangedError();
  }
  for(const node of nodes){const now=await readEvidence(userId,id(node.id));
    if(!now||now.content!==node.content||now.source_sha256!==node.source_sha256||digest(now.source_location)!==digest(node.source_location))throw new KnowledgeSourceChangedError();}
 }catch{throw new KnowledgeSourceChangedError();}
}
