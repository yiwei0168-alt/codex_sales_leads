import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {OWNER_USER_ID} from '../src/lib/auth/config';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {indexTextRevision} from '../src/lib/knowledge/text-tree';
import {searchDocuments,currentCandidateDocuments} from '../src/lib/knowledge/vectorless';
import {startVectorlessSession,searchSessionDocuments,browseSessionTree,readSessionEvidence,aggregateSessionDocuments,filterSessionDocuments} from '../src/lib/knowledge/vectorless-session';

nextEnv.loadEnvConfig(process.cwd());
globalThis.fetch=async()=>{throw new Error('HTTP disabled for local scope verification');};
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!base||!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw new Error('Local database required');
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
if(!/^ma11_replay_[a-f0-9]{12}$/.test(state.database))throw new Error('Isolated clone required');
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()});
const runId=randomUUID(),conversationId=randomUUID(),docIds=[randomUUID(),randomUUID()];
const marker=`scopeprobe${randomUUID().replaceAll('-','')}`;
const nodeIds:string[]=[];
let sessionId='';
try{
  await tenantTransaction(OWNER_USER_ID,async client=>{
    await client.query('insert into assistant_conversation(id,user_id,title) values($1,$2,$3)',[conversationId,OWNER_USER_ID,'MA24 isolated scope probe']);
    await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,'running','main-agent')`,[runId,OWNER_USER_ID,conversationId,
      JSON.stringify({content:marker,requestKey:runId,attachments:[],knowledgeScope:['product']}),JSON.stringify({model:'local-test',providers:[],version:'test'})]);
    for(const [i,collection] of ['product','company'].entries()){
      const content=`${marker} SCOPEALPHA SCOPEBETA 本地范围隔离验证 ${collection}`;
      const hash=createHash('sha256').update(content).digest('hex');
      await client.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,authority_level,language,content_sha256,metadata,status,owner_id,visibility)
        values($1,(select id from knowledge_collection where slug=$2),$1::uuid::text,$3,'manual',3,'en',$4,'{}','active',$5,'private')`,[docIds[i],collection,marker,hash,OWNER_USER_ID]);
      await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed)
        values($1,$2,$3,$4,$5,false)`,[docIds[i],OWNER_USER_ID,hash,marker,content]);
      const version=await indexTextRevision(client,docIds[i],content,hash,marker);
      nodeIds.push((await client.query<{id:string}>("select id from knowledge_tree_node where version_id=$1 and node_kind='evidence'",[version])).rows[0].id);
    }
  });
  // Main lexical path and both language fallbacks execute their real SQL.
  for(const query of [marker,'SCOPEALPHA SCOPEBETA MISSINGANCHOR','本地范围隔离验证无法匹配']){
    const docs=await searchDocuments(OWNER_USER_ID,query,{collections:['product']});
    assert(docs.some(d=>d.documentId===docIds[0]));assert(!docs.some(d=>d.documentId===docIds[1]));
  }
  assert.deepEqual((await currentCandidateDocuments(OWNER_USER_ID,docIds,['product'])).map(d=>d.documentId),[docIds[0]]);
  sessionId=await startVectorlessSession(OWNER_USER_ID,marker,runId);
  const found=await searchSessionDocuments(OWNER_USER_ID,sessionId);
  assert.equal(found.status,'ok');if(found.status!=='ok')throw new Error('Search unexpectedly partial');
  assert.deepEqual(found.documents.map(d=>d.documentId),[docIds[0]]);
  const own=await readSessionEvidence(OWNER_USER_ID,sessionId,nodeIds[0]);assert(own.status==='ok'&&own.evidence);
  const outside=await readSessionEvidence(OWNER_USER_ID,sessionId,nodeIds[1]);assert(outside.status==='ok'&&!outside.evidence);
  await assert.rejects(()=>browseSessionTree(OWNER_USER_ID,sessionId,docIds[1]));
  // A candidate moved outside the saved collection must disappear even after session restore.
  await pool.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='company') where id=$1",[docIds[0]]);
  const stale=await readSessionEvidence(OWNER_USER_ID,sessionId,nodeIds[0]);assert(stale.status==='ok'&&!stale.evidence);
  const tree=await browseSessionTree(OWNER_USER_ID,sessionId,docIds[0]);assert(tree.status==='ok'&&tree.nodes.length===0);
  const total=await aggregateSessionDocuments(OWNER_USER_ID,sessionId,[docIds[0]]);assert(total.status==='ok'&&total.count===0);
  const filtered=await filterSessionDocuments(OWNER_USER_ID,sessionId,[docIds[0]],{collection:'company'});assert(filtered.status==='ok'&&filtered.count===0);
  console.log(JSON.stringify({clone:true,lexicalTechnicalCjkScope:true,fallbackCandidateScope:true,persistedRunScope:true,crossCollectionReadDenied:true,changedCollectionRevalidated:true,externalCalls:0}));
}finally{
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    if(sessionId){await client.query('delete from knowledge_retrieval_step where session_id=$1',[sessionId]);await client.query('delete from knowledge_retrieval_session where id=$1',[sessionId]);}
    await client.query('delete from knowledge_tree_node where version_id in (select id from knowledge_tree_version where document_id=any($1::uuid[]))',[docIds]);
    await client.query('delete from knowledge_tree_version where document_id=any($1::uuid[])',[docIds]);
    await client.query('delete from knowledge_document_revision where document_id=any($1::uuid[])',[docIds]);
    await client.query('delete from knowledge_document where id=any($1::uuid[])',[docIds]);
    await client.query('delete from agent_run where id=$1',[runId]);await client.query('delete from assistant_conversation where id=$1',[conversationId]);
    await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
