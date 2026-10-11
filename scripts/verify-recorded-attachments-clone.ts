import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {initialTaskMessages} from '../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {bindRecordedInitialSource} from '../src/lib/assistant/main/recorded-initial-source';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),doc=randomUUID(),collection=randomUUID();
const assets=[randomUUID(),randomUUID()],version=randomUUID(),runs=[randomUUID(),randomUUID()],conversations=[randomUUID(),randomUUID()];
globalThis.fetch=async()=>{throw Error('Network disabled in clone verification');};
try{
 await pool.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic attachment fixture','product')",[collection,`fixture-${collection}`]);
 for(const [i,userId] of [owner,other].entries()){
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Attachment fixture','!','member','active')",[userId,`${userId}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Attachment fixture')",[conversations[i],userId]);
 }
 await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,$2,$1::uuid::text,'Synthetic private attachment','manual',$3,$4,'private')`,[doc,collection,'a'.repeat(64),owner]);
 for(const [i,id] of assets.entries())await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
  values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')`,[id,doc,`synthetic/${id}.pdf`,(i?'b':'a').repeat(64)]);
 const input={content:'Synthetic attachment request',attachments:[{assetId:assets[0]}]},config=modeModelConfig('standard');
 for(const [i,userId] of [owner,other].entries()){
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,'completed','main-agent')`,[runs[i],userId,conversations[i],JSON.stringify(input),JSON.stringify(config)]);
  await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[userId,conversations[i],input.content,JSON.stringify({runId:runs[i]})]);
 }
 const messages=(userId:string)=>{const m=initialTaskMessages({userId,role:'member',mode:'standard'},input,config,[]);return [m[0],decisionMemoryMessage([]),...m.slice(1)];};
 const check=()=>bindRecordedInitialSource({userId:owner,runId:runs[0]},messages(owner));
 assert.equal((await check()).attachmentsCurrentlyAccessible,true);
 await assert.rejects(bindRecordedInitialSource({userId:other,runId:runs[1]},messages(other)),/attachment unavailable/);
 await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[assets[0]]);await assert.rejects(check(),/attachment unavailable/);
 await pool.query("update knowledge_asset set registration_status='registered' where id=$1",[assets[0]]);
 await pool.query("update knowledge_document set status='archived' where id=$1",[doc]);await assert.rejects(check(),/attachment unavailable/);
 await pool.query("update knowledge_document set status='active' where id=$1",[doc]);
 await pool.query(`insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status)
  values($1,$2,$3,$4,'synthetic-v1',$4,'ready')`,[version,doc,assets[0],'a'.repeat(64)]);
 await pool.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[doc,version]);await check();
 await pool.query("update knowledge_tree_version set status='failed' where id=$1",[version]);await assert.rejects(check(),/attachment unavailable/);
 await pool.query("update knowledge_tree_version set status='ready',asset_id=$2,source_sha256=$3 where id=$1",[version,assets[1],'b'.repeat(64)]);await assert.rejects(check(),/superseded/);
 console.log(JSON.stringify({cloneOnly:true,metadataFixturesOnly:true,ownedAttachmentAccepted:true,crossAccountDenied:true,withdrawnAssetDenied:true,archivedDocumentDenied:true,currentVersionAccepted:true,failedVersionDenied:true,replacedVersionDenied:true,modelCalls:0,fileReads:0}));
}finally{
 await pool.query('update knowledge_document set current_tree_version_id=null where id=$1',[doc]);
 await pool.query('delete from knowledge_tree_version where id=$1',[version]);
 await pool.query('delete from knowledge_asset where id=any($1::uuid[])',[assets]);
 await pool.query('delete from knowledge_document where id=$1',[doc]);
 await pool.query('delete from knowledge_collection where id=$1',[collection]);
 await pool.query('delete from agent_run where id=any($1::uuid[])',[runs]);
 await pool.query('delete from assistant_message where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from assistant_conversation where id=any($1::uuid[])',[conversations]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
 await pool.end();await getPool().end();
}
