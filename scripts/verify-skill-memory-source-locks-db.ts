import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {lockCurrentSkillExperienceSources,type SourcedSkillVersion} from '../src/lib/assistant/main/skill-source-guard';
import {lockSkillAcceptanceRunJournals} from '../src/lib/assistant/main/skill-acceptance-run-locks';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_MEMORY_SOURCE_LOCKS,'1','Disposable harness required');
process.env.PGOPTIONS='-c statement_timeout=10000';
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(admin.host+admin.pathname,app.host+app.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),a=randomUUID(),b=randomUUID(),conflict=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 const migration=await readFile('db/migrations/142_skill_memory_source_locks.sql','utf8');await pool.query(migration);await pool.query(migration);
 const originsMigration=await readFile('db/migrations/143_skill_memory_origin_locks.sql','utf8');await pool.query(originsMigration);await pool.query(originsMigration);
 const taskOriginsMigration=await readFile('db/migrations/144_skill_task_origin_locks.sql','utf8');await pool.query(taskOriginsMigration);await pool.query(taskOriginsMigration);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic source locks','member','active')",[id,`${id}@example.invalid`]);
 const conversation=randomUUID(),quote='I found comparing original tables reduced errors.',memoryKey='source-lock-fixture';
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic source provenance')",[conversation,owner]);
 const refs=[];
 for(const id of [a,b]){
  const runId=randomUUID(),messageId=randomUUID();
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$4,'{}','{}','completed','main-agent')`,[runId,owner,conversation,digest(quote)]);
  await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",
   [messageId,owner,conversation,quote,JSON.stringify({runId})]);
  const receipt={type:'local-qwen3-extraction',usage:'unverified-user-experience',sourceQuote:quote,runId,messageId};
  await pool.query("insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,memory_key) values($1,$2,'experience',$3,$4,$5)",[id,owner,quote,JSON.stringify(receipt),memoryKey]);
  refs.push({observationId:id,runId,messageId,receiptSha256:digest(receipt)});
 }
 const fingerprint=digest({version:'experience-draft-v1',memoryKey,quote}),files={'SKILL.md':'Synthetic source-lock method'};
 const version:SourcedSkillVersion={owner_id:owner,scope:'account',files,content_hash:digest(files),source:`local-experience:${fingerprint}`,
  validation:{sourceQuality:'repeated-user-report-unverified',methodFingerprint:fingerprint,sourceObservations:refs}};
 await pool.query("insert into agent_memory_conflict(id,owner_id,earlier_id,later_id,status) values($1,$2,$3,$4,'resolved')",[conflict,owner,a,b]);
 const lock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_memory_sources($1::uuid[]) as n',[ids])).rows[0].n);
 assert.equal(await lock([]),0);assert.equal(await lock([a,b]),2);
 const guarded=await tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version));
 assert.deepEqual(guarded,{localExperienceSourceLocksHeld:true,observationCount:2});
 const expiring=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++)await pool.query(`insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,memory_key,valid_until)
  select $1,owner_id,kind,content,source_receipt,memory_key,clock_timestamp()+interval '1 second' from agent_memory_observation where id=$2`,[expiring[i],[a,b][i]]);
 const expiringVersion={...version,validation:{...(version.validation as Record<string,unknown>),sourceObservations:refs.map((ref,i)=>({...ref,observationId:expiring[i]}))}};
 await tenantTransaction(owner,async client=>{
  assert.equal((await client.query('select transaction_timestamp()<min(valid_until) as before_expiry from agent_memory_observation where id=any($1::uuid[])',[expiring])).rows[0].before_expiry,true);
  await client.query('select pg_sleep(1.1)');
  await assert.rejects(lockCurrentSkillExperienceSources(client,owner,expiringVersion),/changed after locking/);
 });
 await assert.rejects(lock([a],other),/unavailable/);await assert.rejects(lock([a,a]),/Invalid/);await assert.rejects(lock(null),/Invalid/);
 const grants=(await pool.query(`select has_table_privilege('network_copilot_app','agent_memory_observation','UPDATE') as observation_update,
  has_function_privilege('network_copilot_skill_collector','lock_skill_memory_sources(uuid[])','EXECUTE') as collector_execute`)).rows[0];
 assert.deepEqual(grants,{observation_update:false,collector_execute:false});
 const originHolder=await pool.connect();let originPending:Array<Promise<unknown>>=[];
 try{
  await originHolder.query('begin');await originHolder.query('set local role network_copilot_app');
  await originHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await originHolder.query('select lock_skill_memory_sources($1::uuid[]) as n',[[a,b]])).rows[0].n,2);
  const pid=(await originHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  originPending=[
   pool.query('update app_user set status=status where id=$1',[owner]),
   pool.query('update assistant_conversation set title=title where id=$1',[conversation]),
   pool.query('update agent_run set status=status where id=$1',[refs[0].runId]),
   pool.query('update assistant_message set content=content where id=$1',[refs[0].messageId]),
  ];
  for(const work of originPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=Number((await pool.query('select count(*) n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[pid])).rows[0].n);
   if(waiting===4)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,4,'Account, conversation, run and message updates must all wait');
 }finally{await originHolder.query('rollback');originHolder.release();}
 await Promise.all(originPending);
 await pool.query('update assistant_message set content=$1 where id=$2',['Changed synthetic source',refs[0].messageId]);
 await assert.rejects(tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version)),/changed after locking/);
 await pool.query('update assistant_message set content=$1 where id=$2',[quote,refs[0].messageId]);
 const taskOriginLock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_task_origins($1::uuid[]) n',[ids])).rows[0].n);
 assert.equal(await taskOriginLock([]),0);assert.equal(await taskOriginLock(refs.map(ref=>ref.runId)),2);
 await assert.rejects(taskOriginLock([refs[0].runId],other),/unavailable/);
 await assert.rejects(taskOriginLock([refs[0].runId,refs[0].runId]),/Invalid/);
 await assert.rejects(taskOriginLock(null),/Invalid/);
 const taskOriginHolder=await pool.connect();let taskOriginPending:Array<Promise<unknown>>=[];
 try{
  await taskOriginHolder.query('begin');await taskOriginHolder.query('set local role network_copilot_app');
  await taskOriginHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await taskOriginHolder.query('select lock_skill_task_origins($1::uuid[]) n',[refs.map(ref=>ref.runId)])).rows[0].n,2);
  const pid=(await taskOriginHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  taskOriginPending=[
   pool.query('update app_user set status=status where id=$1',[owner]),
   pool.query('update assistant_conversation set title=title where id=$1',[conversation]),
   pool.query('update assistant_message set content=content where id=$1',[refs[0].messageId]),
   pool.query(`insert into assistant_message(user_id,conversation_id,role,intent,content) values($1,$2,'user','general','Synthetic concurrent history')`,[owner,conversation]),
  ];
  for(const work of taskOriginPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=Number((await pool.query('select count(*) n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[pid])).rows[0].n);
   if(waiting===4)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,4,'Account, conversation, message update and history append must wait');
 }finally{await taskOriginHolder.query('rollback');taskOriginHolder.release();}
 await Promise.all(taskOriginPending);
 const journalId=randomUUID(),runId=refs[0].runId;
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
  values($1,$2,$3,'existing','synthetic','v1',$4,'{}','read','completed')`,[journalId,owner,runId,digest({})]);
 const runArtifact={plan:{cases:[{id:'case',provenance:'historical-task'}]},rawReceipts:{baselineSources:{case:{runId}},candidateSources:{case:{runId}}}};
 const journalHolder=await pool.connect();let journalPending:Array<Promise<unknown>>=[];
 try{
  await journalHolder.query('begin');await journalHolder.query('set local role network_copilot_app');
  await journalHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.deepEqual(await lockSkillAcceptanceRunJournals(journalHolder,owner,runArtifact),{taskJournalsLocked:true,runCount:1});
  const pid=(await journalHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  journalPending=[
   pool.query('update agent_run set status=status where id=$1',[runId]),
   pool.query('update agent_tool_call set output=output where id=$1',[journalId]),
   pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
    values($1,$2,'appended','synthetic','v1',$3,'{}','read','completed')`,[owner,runId,digest({})]),
  ];
  for(const work of journalPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=Number((await pool.query('select count(*) n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[pid])).rows[0].n);
   if(waiting===3)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,3,'Task update, existing journal update and journal append must all wait');
 }finally{await journalHolder.query('rollback');journalHolder.release();}
 await Promise.all(journalPending);
 await assert.rejects(tenantTransaction(other,client=>lockSkillAcceptanceRunJournals(client,other,runArtifact)),/task unavailable/);
 const holder=await pool.connect();let pending:Array<Promise<unknown>>=[];const finished=[false,false,false];
 try{
  await holder.query('begin');await holder.query('set local role network_copilot_app');
  await holder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await holder.query('select lock_skill_memory_sources($1::uuid[]) as n',[[a,b]])).rows[0].n,2);
  const pid=(await holder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  pending=[
   tenantTransaction(owner,client=>client.query("insert into agent_memory_observation(owner_id,kind,content,source_receipt,corrects_id) values($1,'experience','Synthetic correction','{}',$2)",[owner,a])),
   tenantTransaction(owner,client=>client.query("insert into agent_memory_observation(owner_id,kind,content,source_receipt,invalidates_id) values($1,'experience','Synthetic invalidation','{}',$2)",[owner,b])),
   tenantTransaction(owner,client=>client.query("update agent_memory_conflict set status='open' where owner_id=$1 and id=$2",[owner,conflict])),
  ].map((work,index)=>work.finally(()=>{finished[index]=true;}));
  for(const work of pending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=Number((await pool.query('select count(*) n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[pid])).rows[0].n);
   if(waiting===3)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,3,'Correction, invalidation and conflict update must all wait');assert.deepEqual(finished,[false,false,false]);
 }finally{await holder.query('rollback');holder.release();}
 await Promise.all(pending);assert.deepEqual(finished,[true,true,true]);
 const state=(await pool.query(`select exists(select 1 from agent_memory_observation where corrects_id=$1) as corrected,
  exists(select 1 from agent_memory_observation where invalidates_id=$2) as invalidated,
  (select status from agent_memory_conflict where id=$3) as conflict`,[a,b,conflict])).rows[0];
 assert.deepEqual(state,{corrected:true,invalidated:true,conflict:'open'});
 await assert.rejects(tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version)),/changed after locking/);
 assert.equal((await pool.query("select to_regclass('public.ma24_evaluation_hard_limit') is null absent")).rows[0].absent,true);
 console.log(JSON.stringify({memorySourceLocksDatabase:'passed',correctionInvalidationAndConflictBlocked:true,allWritersResumeAfterRelease:true,
  foreignOwnerAndInvalidIdsRejected:true,taskOriginsAndHistoryAppendBlocked:true,taskAndJournalUpdateAndAppendBlocked:true,foreignTaskJournalLockRejected:true,noObservationUpdateGrant:true,originUpdatesBlocked:true,changedOriginalMessageRejected:true,storedProvenanceLockThenRecheck:true,invalidatedProvenanceRejectedAfterLock:true,expiryAfterTransactionStartRejected:true,
  deferredEvaluationMigrationsApplied:false,actualModelCalls:0,automaticActivation:false}));
}finally{await pool.end();await getPool().end();}
