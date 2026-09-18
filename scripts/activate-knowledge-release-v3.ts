import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantTransaction} from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const releaseKey=process.argv.find(value=>value.startsWith("--release="))?.slice(10)??"rag-v3-shadow-2026-09-18";
const write=process.argv.includes("--write");

type GateRow={releaseId:string;status:string;registeredAssets:number;assets:number;incompleteAssets:number;chunks:number;qwen:number;bge:number;documentReviews:number;factReviews:number;goldReviewed:number;holdoutUnlocked:boolean;};
const readGate=async(client:import("pg").PoolClient)=>(await client.query<GateRow>(`
  select r.id as "releaseId",r.status,
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
  from knowledge_release_v3 r where r.release_key=$1 for update`,[releaseKey])).rows[0];

const report=await tenantTransaction(OWNER_USER_ID,async client=>{
  const gate=await readGate(client);if(!gate)throw new Error(`Release not found: ${releaseKey}`);
  const blockers=[gate.assets!==gate.registeredAssets?`manifest assets ${gate.assets}/${gate.registeredAssets}`:null,gate.incompleteAssets?`${gate.incompleteAssets} incomplete assets`:null,
    gate.chunks===0?"release has no chunks":null,gate.qwen!==gate.chunks?`Qwen ${gate.qwen}/${gate.chunks}`:null,
    gate.bge!==gate.chunks?`BGE ${gate.bge}/${gate.chunks}`:null,gate.documentReviews?`${gate.documentReviews} document reviews`:null].filter(Boolean);
  if(blockers.length)throw new Error(`Activation blocked: ${blockers.join(", ")}`);
  if(write){
    if(gate.status==="building")await client.query("update knowledge_release_v3 set status='validated' where id=$1",[gate.releaseId]);
    if(gate.status!=="active")await client.query("select activate_knowledge_release_v3($1)",[gate.releaseId]);
  }
  const after=await readGate(client);
  const pointer=await client.query<{releaseId:string}>("select release_id as \"releaseId\" from knowledge_release_pointer_v3 where scope_kind='shared'");
  return{mode:write?"activated":"dry-run",releaseKey,...after,activePointer:pointer.rows[0]?.releaseId??null,
    quarantinedFactReviews:after.factReviews,goldProgress:`${after.goldReviewed}/300`,holdoutUnlocked:after.holdoutUnlocked,
    externalCalls:{model:0,embedding:0,search:0,smtp:0}};
},"admin");
console.log(JSON.stringify(report,null,2));
await getPool().end();
