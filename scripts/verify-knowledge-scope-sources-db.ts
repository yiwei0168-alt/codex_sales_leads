import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Client} from 'pg';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../src/lib/rag/db';
import {currentKnowledgeChunkEvidence,authorizedKnowledgeChunkIds} from '../src/lib/rag/repository';
import {assertCurrentKnowledgeMessages,KnowledgeSourceChangedError,SOURCE_CHANGED_REPLY} from '../src/lib/assistant/main/knowledge-message-guard';
import {knowledgeOriginalsTool} from '../src/lib/assistant/main/knowledge-originals-tool';
import {buildMainAgentGraph} from '../src/lib/assistant/main/graph';
import {result,type ModelMessage} from '../src/lib/assistant/main/contracts';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();assert.equal(process.env.MA24_DISPOSABLE_KNOWLEDGE_SCOPE,'1');
const url=process.env.DATABASE_MIGRATION_URL!,appUrl=process.env.DATABASE_URL!;
assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).host+new URL(url).pathname,new URL(appUrl).host+new URL(appUrl).pathname);
const admin=new Client({connectionString:url}),writer=new Client({connectionString:url}),observer=new Client({connectionString:url});
await Promise.all([admin.connect(),writer.connect(),observer.connect()]);
const owner=randomUUID(),peer=randomUUID(),documents=[randomUUID(),randomUUID()],assets=[randomUUID(),randomUUID()],legacy=[randomUUID(),randomUUID()],v3=[randomUUID(),randomUUID()],release=randomUUID();
const content='Synthetic scoped source exact original qualification',hash=createHash('sha256').update(content).digest('hex');
const context={userId:owner,runId:randomUUID(),leaseToken:randomUUID(),role:'member' as const,knowledgeScope:['product'] as Array<'product'>};
const pair=(tool:string,data:unknown,args:unknown={}):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:randomUUID(),type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
 {role:'tool',content:JSON.stringify({status:'success',data})}];
const messages=(tool:string,data:unknown,args:unknown={})=>{const rows=pair(tool,data,args);rows[1].tool_call_id=rows[0].tool_calls![0].id;return rows;};
const state=(rows:ModelMessage[])=>({messages:[{role:'user' as const,content:'Synthetic scoped task'},...rows],pending:[],steps:0,status:'running' as const,reply:'',seen:{},instructionIds:[]});
const move=(index:number,slug:string)=>admin.query('update knowledge_document set collection_id=(select id from knowledge_collection where slug=$2) where id=$1',[documents[index],slug]);
const results:string[]=[];
try{
 assert.equal(Number((await admin.query('select count(*) n from knowledge_release_pointer_v3')).rows[0].n),0,'Scope fixture requires fresh release pointers');
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic scope','member','active')",[id,`${id}@example.invalid`]);
 for(let i=0;i<2;i++){
  await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic scoped original','text',$2,$3,$4)`,[documents[i],hash,owner,i?'shared':'private']);
  await admin.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,$3,$4,'text/plain',$5,'TXT','synthetic')`,[assets[i],documents[i],`knowledge/${assets[i]}.txt`,hash,Buffer.byteLength(content)]);
  await admin.query('insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256) values($1,$2,0,$3,10,$4)',[legacy[i],documents[i],content,hash]);
 }
 for(const store of ['legacy','v3'] as const){
  if(store==='v3'){
   await admin.query("insert into knowledge_release_v3(id,release_key,status,scope_kind,extractor_profile,chunk_profile) values($1,$1::uuid::text,'active','shared','synthetic-scope','synthetic-scope')",[release]);
   for(let i=0;i<2;i++){
    const revision=randomUUID();await admin.query(`insert into knowledge_source_revision_v3(id,release_id,asset_id,source_sha256,artifact_sha256,extractor_profile,parser_status) values($1,$2,$3,$4,$4,'synthetic-scope','success')`,[revision,release,assets[i],hash]);
    await admin.query(`insert into knowledge_chunk_v3(id,release_id,document_id,source_revision_id,chunk_index,block_type,source_location,content,canonical_embedding_text,token_estimate,content_sha256)
     values($1,$2,$3,$4,0,'paragraph','{"unitType":"document","unitIndex":1}',$5,$5,10,$6)`,[v3[i],release,documents[i],revision,content,hash]);
   }
   await admin.query("insert into knowledge_release_pointer_v3(scope_kind,release_id) values('shared',$1)",[release]);
  }
  const ids=store==='legacy'?legacy:v3;
  for(let index=0;index<2;index++){
   const chunk={id:ids[index],documentId:documents[index],content,...(store==='v3'?{metadata:{releaseId:release,sourceSha256:hash,sourceLocation:{unitType:'document',unitIndex:1}}}:{})};
   const receipt=messages('knowledge_search',[chunk],{query:'Synthetic scope',collections:['product']});
   assert.equal((await currentKnowledgeChunkEvidence(owner,[ids[index]],['product'])).length,1);
   assert.equal((await currentKnowledgeChunkEvidence(peer,[ids[index]],['product'])).length,index?1:0);
   await assertCurrentKnowledgeMessages(owner,receipt,['product']);
   const original=await knowledgeOriginalsTool.execute({query:'',assetId:assets[index]},context);assert.equal(original.status,'success');
   const originalMessages=messages('knowledge_originals',original.data,{assetId:assets[index]});await assertCurrentKnowledgeMessages(owner,originalMessages,['product']);
   let modelCalls=0,toolCalls=0;
   const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),validateEvidence:rows=>assertCurrentKnowledgeMessages(owner,rows,['product']),
    model:async()=>{modelCalls++;await move(index,'company');return {role:'assistant',content:'UNSAFE_MOVED_SOURCE_ANSWER',tool_calls:[{id:randomUUID(),type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'mail_send',arguments:{}})}}]};},
    tool:async()=>{toolCalls++;return result({syntheticOnly:true});}});
   const stopped=await graph.invoke(state(receipt));assert.equal(modelCalls,1);assert.equal(toolCalls,0);assert.equal(stopped.status,'partial');assert.equal(stopped.reply,SOURCE_CHANGED_REPLY);
   assert(!stopped.messages.some(row=>row.content?.includes('UNSAFE_MOVED_SOURCE_ANSWER')));assert.deepEqual(stopped.pending,[]);
   assert.equal((await currentKnowledgeChunkEvidence(owner,[ids[index]])).length,1,'Move changes scope, not ACL/text/hash');
   assert.equal((await currentKnowledgeChunkEvidence(owner,[ids[index]],['product'])).length,0);assert.equal((await authorizedKnowledgeChunkIds(owner,[ids[index]],['product'])).size,0);
   await assert.rejects(assertCurrentKnowledgeMessages(owner,originalMessages,['product']),KnowledgeSourceChangedError);
   await assertCurrentKnowledgeMessages(owner,receipt,['company']); // Account scope overrides requested search collections exactly as execution does.
   const pending={id:randomUUID(),type:'function' as const,function:{name:'execute_tool',arguments:JSON.stringify({tool:'mail_send',arguments:{}})}};
   const resumed=await graph.invoke({...state(receipt),pending:[pending]});assert.equal(resumed.status,'partial');assert.equal(toolCalls,0);assert.equal(modelCalls,1);
   await move(index,'product');await assertCurrentKnowledgeMessages(owner,receipt,['product']);
   const positive=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),validateEvidence:rows=>assertCurrentKnowledgeMessages(owner,rows,['product']),model:async()=>({role:'assistant',content:'Synthetic current source accepted'}),tool:async()=>{throw new Error('No action expected');}});
   assert.equal((await positive.invoke(state(receipt))).status,'completed');
   results.push(`${store}/${index?'shared':'private'}: scope move during graph generation withholds reply and pending action; resumed action rejects; ACL/text/hash remain unchanged; restoration passes`);
  }
 }
 // G09 source admission prevents collection writes until the evidence-owning
 // transaction ends, then the normal scoped guard rejects the changed source.
 await writer.query('begin');const pid=Number((await writer.query('select pg_backend_pid() pid')).rows[0].pid);let pending:Promise<unknown>|undefined;
 await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  pending=writer.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='company') where id=$1",[documents[1]]);
  let waiting=false;for(let i=0;i<100;i++){waiting=(await observer.query<{waiting:boolean}>("select wait_event_type='Lock' and wait_event='advisory' as waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting??false;if(waiting)break;await new Promise(done=>setTimeout(done,20));}
  assert(waiting);assert.equal((await currentKnowledgeChunkEvidence(owner,[v3[1]],['product'])).length,1);
 }));
 await pending;await writer.query('commit');assert.equal((await currentKnowledgeChunkEvidence(owner,[v3[1]],['product'])).length,0);await move(1,'product');
 results.push('G09 bound source reader observes collection writer blocked on exact advisory lock; after release and commit scoped source is rejected');
 const receipt={passed:true,results,actualPostgresSources:true,productionGraphImplementation:true,modelAndActionAdapters:'synthetic',actualModelCalls:0,externalActions:0,durableRunPersistenceVerified:false,compiledHttpVerified:false,automaticActivation:false};
 await writeFile('tmp/ma24-knowledge-scope-sources-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({knowledgeScopeSources:'passed',...receipt}));
}finally{
 await writer.query('rollback').catch(()=>undefined);await Promise.allSettled([admin.end(),writer.end(),observer.end(),getPool().end()]);
}
