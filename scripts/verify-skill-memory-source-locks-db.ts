import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_MEMORY_SOURCE_LOCKS,'1','Disposable harness required');
process.env.PGOPTIONS='-c statement_timeout=10000';
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(admin.host+admin.pathname,app.host+app.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),a=randomUUID(),b=randomUUID(),conflict=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 const migration=await readFile('db/migrations/142_skill_memory_source_locks.sql','utf8');await pool.query(migration);await pool.query(migration);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic source locks','member','active')",[id,`${id}@example.invalid`]);
 for(const id of [a,b])await pool.query("insert into agent_memory_observation(id,owner_id,kind,content,source_receipt) values($1,$2,'experience','Synthetic source','{}')",[id,owner]);
 await pool.query("insert into agent_memory_conflict(id,owner_id,earlier_id,later_id,status) values($1,$2,$3,$4,'resolved')",[conflict,owner,a,b]);
 const lock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_memory_sources($1::uuid[]) as n',[ids])).rows[0].n);
 assert.equal(await lock([]),0);assert.equal(await lock([a,b]),2);
 await assert.rejects(lock([a],other),/unavailable/);await assert.rejects(lock([a,a]),/Invalid/);await assert.rejects(lock(null),/Invalid/);
 const grants=(await pool.query(`select has_table_privilege('network_copilot_app','agent_memory_observation','UPDATE') as observation_update,
  has_function_privilege('network_copilot_skill_collector','lock_skill_memory_sources(uuid[])','EXECUTE') as collector_execute`)).rows[0];
 assert.deepEqual(grants,{observation_update:false,collector_execute:false});
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
 assert.equal((await pool.query("select to_regclass('public.ma24_evaluation_hard_limit') is null absent")).rows[0].absent,true);
 console.log(JSON.stringify({memorySourceLocksDatabase:'passed',correctionInvalidationAndConflictBlocked:true,allWritersResumeAfterRelease:true,
  foreignOwnerAndInvalidIdsRejected:true,noObservationUpdateGrant:true,deferredEvaluationMigrationsApplied:false,actualModelCalls:0,automaticActivation:false}));
}finally{await pool.end();await getPool().end();}
