import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool,type PoolClient} from 'pg';
import {revalidateLockedKnowledgeAssetBytes} from '../src/lib/assistant/main/skill-attachment-bytes';

nextEnv.loadEnvConfig(process.cwd());
assert(process.argv.slice(2).every(arg=>arg==='--install-source-snapshots')&&process.argv.length<=3);
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;
globalThis.fetch=async()=>{throw new Error('External network disabled');};
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),peer=randomUUID(),collection=randomUUID(),document=randomUUID(),asset=randomUUID();
const bytes=Buffer.from('Synthetic canonical original for source admission\n'),sha=createHash('sha256').update(bytes).digest('hex');
const results:unknown[]=[];
const bind=async(client:PoolClient,actor:string)=>{
 await client.query('begin');await client.query('set local role network_copilot_app');
 await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[actor]);
};
try{
 if(process.argv.includes('--install-source-snapshots')){
  const installer=await pool.connect();
  try{await installer.query('begin');
   for(const name of ['148_skill_decision_memory_source_locks.sql','149_skill_knowledge_source_locks.sql','156_knowledge_asset_immutable_snapshot.sql'])await installer.query(await readFile(`db/migrations/${name}`,'utf8'));
   await installer.query('commit');
  }catch(error){await installer.query('rollback');throw error;}finally{installer.release();}
 }
 assert((await pool.query("select to_regprocedure('capture_immutable_asset_snapshot(uuid,text,bytea)') is not null present")).rows[0].present,'Install exact snapshot migrations in this test clone first');
 for(const id of [owner,peer])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic snapshot source lock','!','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$1::uuid::text,'Synthetic source lock','industry')",[collection]);
 await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,$2,$1::uuid::text,'Synthetic source lock','synthetic',$3,$4,'shared')`,[document,collection,sha,owner]);
 await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
  values($1,$2,$3,$4,'text/plain',$5,'text','synthetic')`,[asset,document,`knowledge/nonexistent-${asset}.txt`,sha,bytes.length]);
 const capture=await pool.connect();try{await bind(capture,owner);await capture.query('select capture_immutable_asset_snapshot($1,$2,$3)',[asset,sha,bytes]);await capture.query('commit');}
 finally{await capture.query('rollback');capture.release();}
 const invalid=await pool.connect();
 try{
  await assert.rejects(revalidateLockedKnowledgeAssetBytes(invalid,owner,[asset]),/account or role invalid/);
  await bind(invalid,owner);await assert.rejects(revalidateLockedKnowledgeAssetBytes(invalid,peer,[asset]),/account or role invalid/);
  results.push({kind:'unbound-and-cross-account',rejectedBeforeSourceRead:true});
 }finally{await invalid.query('rollback');invalid.release();}
 for(const kind of ['withdraw','private','hash','delete'] as const){
  await pool.query("update knowledge_document set visibility='shared' where id=$1",[document]);
  await pool.query("update knowledge_asset set registration_status='registered',source_sha256=$2 where id=$1",[asset,sha]);
  const actor=kind==='private'?peer:owner,reader=await pool.connect(),writer=await pool.connect();
  let pending:Promise<{error?:unknown}>|undefined;
  try{
   await bind(reader,actor);
   const read=await revalidateLockedKnowledgeAssetBytes(reader,actor,[asset]);assert.equal(read.immutableSnapshotCount,1);
   const readerPid=(await reader.query('select pg_backend_pid() pid')).rows[0].pid;
   const writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
   const sql=kind==='withdraw'?"update knowledge_asset set registration_status='withdrawn' where id=$1":kind==='private'?"update knowledge_document set visibility='private' where id=$1":kind==='hash'?"update knowledge_asset set source_sha256=repeat('0',64) where id=$1":'delete from knowledge_asset where id=$1';
   pending=writer.query(sql,[kind==='private'?document:asset]).then(()=>({}),error=>({error}));
   let blocked=false;
   for(let attempt=0;attempt<40;attempt++){
    blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2)) blocked',[readerPid,writerPid])).rows[0].blocked;
    if(blocked)break;await new Promise(done=>setTimeout(done,25));
   }
   assert(blocked,'Source mutation must wait on the exact reading transaction');
   const again=await revalidateLockedKnowledgeAssetBytes(reader,actor,[asset]);assert.equal(again.immutableSnapshotManifestHash,read.immutableSnapshotManifestHash);
   await reader.query('commit');assert.equal((await pending).error,undefined);
   await bind(reader,actor);await assert.rejects(revalidateLockedKnowledgeAssetBytes(reader,actor,[asset]));await reader.query('rollback');
   results.push({kind,mutationBlockedByExactReaderPid:true,retainedCanonicalManifest:true,nextTransactionRejected:true});
  }finally{await reader.query('rollback');if(pending)await pending;reader.release();writer.release();}
 }
}finally{
 const cleanup=await pool.connect();
 try{
  await cleanup.query('begin');
  // Privileged fixture-only disposal; never an application purge capability.
  await cleanup.query('set local session_replication_role=replica');
  await cleanup.query('delete from knowledge_asset_immutable_snapshot where asset_id=$1',[asset]);
  await cleanup.query('delete from knowledge_asset where id=$1',[asset]);await cleanup.query('delete from knowledge_document where id=$1',[document]);
  await cleanup.query('delete from knowledge_collection where id=$1',[collection]);await cleanup.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);
  await cleanup.query('commit');
  const remaining=(await cleanup.query('select count(*)::int n from knowledge_asset_immutable_snapshot where asset_id=$1',[asset])).rows[0].n;assert.equal(remaining,0);
 }catch(error){await cleanup.query('rollback');throw error;}finally{cleanup.release();await pool.end();}
}
const result={passed:true,results,fixtureCleanupCompleted:true,exactMigrationsInstalledOnlyInValidatedClone:process.argv.includes('--install-source-snapshots'),modelAndNetworkCalls:0,productionQualified:false,automaticActivation:false};
await writeFile('tmp/ma24-immutable-snapshot-source-locks-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
