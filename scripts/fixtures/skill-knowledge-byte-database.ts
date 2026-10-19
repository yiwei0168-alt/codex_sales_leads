import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {tenantTransaction} from '../../src/lib/rag/db';
import {revalidateLockedSkillKnowledgeReceiptBytes} from '../../src/lib/assistant/main/skill-knowledge-receipt-bytes';

/** Only called in the disposable source-lock cluster. Tests byte mapping, not
 * independent answer quality or complete receipt/journal provenance. */
export async function verifyKnowledgeReceiptByteDatabase(pool:Pool,input:{owner:string;other:string;documentId:string;assetId:string;treeId:string;sha:string;key:string;bytes:Buffer}){
 const {owner,other,documentId,assetId,treeId,sha,key,bytes}=input;
 const release=randomUUID(),revision=randomUUID(),chunk=randomUUID(),unit=randomUUID(),node=randomUUID(),legacy=randomUUID();
 await pool.query(`insert into knowledge_release_v3(id,release_key,scope_kind,extractor_profile,chunk_profile)
  values($1,$1::uuid::text,'shared','synthetic','synthetic')`,[release]);
 await pool.query(`insert into knowledge_release_pointer_v3(scope_kind,release_id) values('shared',$1)`,[release]);
 await pool.query(`insert into knowledge_source_revision_v3(id,release_id,asset_id,source_sha256,artifact_sha256,extractor_profile,parser_status)
  values($1,$2,$3,$4,$4,'synthetic','success')`,[revision,release,assetId,sha]);
 await pool.query(`insert into knowledge_chunk_v3(id,release_id,document_id,source_revision_id,chunk_index,block_type,source_location,content,canonical_embedding_text,token_estimate,content_sha256)
  values($1,$2,$3,$4,0,'text','{}','Synthetic attachment','Synthetic attachment',2,$5)`,[chunk,release,documentId,revision,sha]);
 await pool.query(`insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256)
  values($1,$2,0,'Synthetic attachment',2,$3)`,[legacy,documentId,sha]);
 await pool.query(`insert into knowledge_tree_node(id,version_id,ordinal,node_kind,title,unit_type,unit_index,source_location)
  values($1,$2,0,'unit','Synthetic unit','document',1,'{}')`,[unit,treeId]);
 await pool.query(`insert into knowledge_tree_node(id,version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256)
  values($1,$2,$3,0,'evidence','Synthetic evidence','document',1,'{}','Synthetic attachment',$4)`,[node,treeId,unit,sha]);
 await pool.query('update knowledge_document set current_tree_version_id=$1 where id=$2',[treeId,documentId]);
 const receipt=(tool:string,data:unknown)=>({tool,output:{status:'success',data}});
 const receipts=[receipt('knowledge_search',[{id:chunk,metadata:{releaseId:release}}]),
  receipt('knowledge_facts',[{chunkId:chunk}]),receipt('knowledge_compare',{entities:[{evidence:[{id:chunk}],verifiedFacts:[{chunkId:chunk}]}]}),
  receipt('knowledge_originals',{documents:[{id:assetId}]}),receipt('vectorless_read',{evidence:{id:node}}),receipt('knowledge_search',[{id:legacy}])];
 const verify=(user:string,rows=receipts)=>tenantTransaction(user,async client=>{
  await client.query('select lock_skill_knowledge_sources()');
  return revalidateLockedSkillKnowledgeReceiptBytes(client,user,rows);
 });
 const good=await verify(owner);assert.equal(good.knowledgeReceiptAssetCount,1);assert.equal(good.knowledgeReceiptDatabaseOnlyCount,1);
 await assert.rejects(verify(other),/source unavailable|attachment unavailable/);
 try{
  await writeFile(key,Buffer.alloc(bytes.length,120));
  await assert.rejects(verify(owner),/attachment bytes changed/);
 }finally{await writeFile(key,bytes);}
 assert.deepEqual(await verify(owner),good);
 await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[assetId]);
 await assert.rejects(verify(owner),/attachment unavailable/);
 await pool.query("update knowledge_asset set registration_status='registered' where id=$1",[assetId]);
 await pool.query('delete from knowledge_release_pointer_v3 where release_id=$1',[release]);
 await assert.rejects(verify(owner),/source unavailable/);
 console.log(JSON.stringify({knowledgeReceiptByteDatabase:'passed',allFiveKnowledgeToolsMapped:true,databaseOnlySourcePreserved:true,
  sameSizeTamperRejected:true,crossAccountRejected:true,withdrawnAssetRejected:true,withdrawnReleaseRejected:true,modelCalls:0,automaticActivation:false}));
}
