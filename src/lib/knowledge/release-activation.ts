import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {tenantTransaction} from "@/lib/rag/db";

type GateRow={releaseId:string;status:string;manifest:unknown;registeredAssets:number;assets:number;incompleteAssets:number;chunks:number;qwen:number;bge:number;documentReviews:number;factReviews:number;goldReviewed:number;holdoutUnlocked:boolean};
const manifestHash=(manifest:unknown)=>createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
async function assertAdminInTransaction(client:PoolClient,userId:string){
  const actor=await client.query<{role:string}>("select role from app_user where id=$1 and status='active'",[userId]);
  if(actor.rows[0]?.role!=="admin")throw new Error("Active administrator account required");
}
async function readGate(client:PoolClient,releaseKey:string,lock:boolean):Promise<GateRow|null>{
  const row=await client.query<GateRow>(`select r.id as "releaseId",r.status,r.manifest,
    (select count(*)::int from knowledge_asset a join knowledge_document d on d.id=a.document_id where a.registration_status='registered' and d.visibility='shared') "registeredAssets",
    (select count(*)::int from knowledge_release_asset_v3 m where m.release_id=r.id) assets,
    (select count(*)::int from knowledge_release_asset_v3 m join knowledge_asset a on a.id=m.asset_id where m.release_id=r.id and(
      m.processing_status='pending' or m.expected_units<>m.actual_units or m.expected_chunks<>m.actual_chunks
      or m.qwen_embeddings<>m.actual_chunks or m.bge_embeddings<>m.actual_chunks
      or(m.processing_status='success' and lower(a.source_nature) like '%datasheet%' and m.actual_chunks=0)
      or(m.processing_status in('blank','review-required','failed') and(m.resolution_status='pending' or m.human_decision_at is null)))) "incompleteAssets",
    (select count(*)::int from knowledge_chunk_v3 c where c.release_id=r.id) chunks,
    (select count(*)::int from knowledge_chunk_embedding_v3 e join knowledge_chunk_v3 c on c.id=e.chunk_id join knowledge_embedding_profile_v3 p on p.id=e.profile_id where c.release_id=r.id and p.profile_key='qwen-v4-1536') qwen,
    (select count(*)::int from knowledge_chunk_embedding_v3 e join knowledge_chunk_v3 c on c.id=e.chunk_id join knowledge_embedding_profile_v3 p on p.id=e.profile_id where c.release_id=r.id and p.profile_key='bge-m3-1024') bge,
    (select count(*)::int from knowledge_review_queue_v3 q where q.release_id=r.id and q.status='open' and(q.source_unit_id is not null or q.fact_id is null)) "documentReviews",
    (select count(*)::int from knowledge_review_queue_v3 q where q.release_id=r.id and q.status='open' and q.fact_id is not null) "factReviews",
    (select count(*)::int from knowledge_evaluation_review_v3 e where e.corpus_version='knowledge-eval-v3-baseline') "goldReviewed",
    exists(select 1 from knowledge_evaluation_holdout_gate_v3 g where g.corpus_version='knowledge-eval-v3-baseline') "holdoutUnlocked"
    from knowledge_release_v3 r where r.release_key=$1 and r.scope_kind='shared' ${lock?"for update":""}`,[releaseKey]);
  return row.rows[0]??null;
}
function blockers(gate:GateRow){return [gate.assets!==gate.registeredAssets?`Manifest assets ${gate.assets}/${gate.registeredAssets}`:null,
  gate.incompleteAssets?`${gate.incompleteAssets} incomplete assets`:null,gate.chunks===0?"Release has no chunks":null,
  gate.qwen!==gate.chunks?`Qwen embeddings ${gate.qwen}/${gate.chunks}`:null,gate.bge!==gate.chunks?`BGE embeddings ${gate.bge}/${gate.chunks}`:null,
  gate.documentReviews?`${gate.documentReviews} open document reviews`:null].filter((value):value is string=>Boolean(value));}
export async function readSharedReleaseGate(userId:string,releaseKey:string){
  return tenantTransaction(userId,async client=>{
    await assertAdminInTransaction(client,userId);
    const gate=await readGate(client,releaseKey,false);if(!gate)return null;
    const pointer=await client.query<{id:string}>("select release_id as id from knowledge_release_pointer_v3 where scope_kind='shared'");
    return {releaseKey,releaseId:gate.releaseId,status:gate.status,manifestHash:manifestHash(gate.manifest),
      registeredAssets:gate.registeredAssets,assets:gate.assets,incompleteAssets:gate.incompleteAssets,chunks:gate.chunks,
      qwen:gate.qwen,bge:gate.bge,documentReviews:gate.documentReviews,factReviews:gate.factReviews,
      goldReviewed:gate.goldReviewed,holdoutUnlocked:gate.holdoutUnlocked,blockers:blockers(gate),active:pointer.rows[0]?.id===gate.releaseId};
  },"admin");
}
export async function activateSharedRelease(userId:string,input:{releaseKey:string;releaseId:string;expectedManifestHash:string}){
  return tenantTransaction(userId,async client=>{
    await assertAdminInTransaction(client,userId);
    const gate=await readGate(client,input.releaseKey,true);
    if(!gate||gate.releaseId!==input.releaseId||manifestHash(gate.manifest)!==input.expectedManifestHash)throw new Error("Shared release identity or manifest changed; reread its gate");
    const pointer=await client.query<{id:string}>("select release_id as id from knowledge_release_pointer_v3 where scope_kind='shared' for update");
    const blocked=blockers(gate);if(blocked.length)throw new Error(`Activation blocked: ${blocked.join(", ")}`);
    if(gate.status==="active"&&pointer.rows[0]?.id===gate.releaseId)return {activated:true,reused:true,releaseId:gate.releaseId};
    if(gate.status==="building")await client.query("update knowledge_release_v3 set status='validated',validated_at=now() where id=$1",[gate.releaseId]);
    else if(gate.status!=="validated")throw new Error(`Release status ${gate.status} cannot be activated`);
    await client.query("select activate_knowledge_release_v3($1)",[gate.releaseId]);
    return {activated:true,reused:false,releaseId:gate.releaseId};
  },"admin");
}
