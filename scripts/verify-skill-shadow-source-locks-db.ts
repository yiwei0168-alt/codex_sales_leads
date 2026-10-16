import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_SHADOW_SOURCE_LOCKS,'1');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!);assert(['127.0.0.1','localhost'].includes(admin.hostname));
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),run=randomUUID(),conversation=randomUUID(),campaign=randomUUID(),job=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 const migration=await readFile('db/migrations/150_skill_shadow_source_locks.sql','utf8');await pool.query(migration);await pool.query(migration);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic shadow lock','member','active')",[id,`${id}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic shadow lock',source:'synthetic-test',files:{'SKILL.md':'Synthetic instructions.'},dependencies:[]});
 await pool.query('insert into assistant_conversation(id,user_id) values($1,$2)',[conversation,owner]);
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
  values($1,$2,$3,$4,$5,'{}','{}','queued','main-agent')`,[run,owner,conversation,randomUUID(),digest('synthetic')]);
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$4,'{}',true,clock_timestamp()+interval '1 hour')`,[campaign,owner,skill.id,digest('fixture')]);
 await pool.query("insert into agent_skill_shadow_job(id,owner_id,run_id,campaign_id,start_context) values($1,$2,$3,$4,'{}')",[job,owner,run,campaign]);
 const holder=await pool.connect();let writes:Promise<unknown>[]=[];
 try{
  await holder.query('begin');await holder.query('set local role network_copilot_app');await holder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await holder.query('select lock_skill_shadow_sources($1::uuid[],$2::uuid[]) n',[[job],[run]])).rows[0].n,1);
  const pid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
  writes=[pool.query('update agent_skill_shadow_campaign set enabled=false where id=$1',[campaign]),
   pool.query("update agent_skill_shadow_job set start_context='{}'::jsonb||jsonb_build_object('changed',true) where id=$1",[job])];
  for(const write of writes)void write.catch(()=>undefined);
  let blocked=0;
  for(let i=0;i<100;i++){
   blocked=(await pool.query('select count(*)::int n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[pid])).rows[0].n;
   if(blocked===2)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(blocked,2,'Campaign disable and capture rewrite must both wait');
 }finally{await holder.query('rollback');holder.release();}
 await Promise.all(writes);
 assert.equal((await pool.query('select enabled from agent_skill_shadow_campaign where id=$1',[campaign])).rows[0].enabled,false);
 assert.equal((await pool.query("select start_context->>'changed' changed from agent_skill_shadow_job where id=$1",[job])).rows[0].changed,'true');
 const check=await pool.connect();
 try{
  await check.query('set role network_copilot_app');await check.query("select set_config('app.current_user_id',$1,false)",[other]);
  await assert.rejects(check.query('select lock_skill_shadow_sources($1::uuid[],$2::uuid[])',[[job],[run]]),/unavailable/);
  await check.query("select set_config('app.current_user_id',$1,false)",[owner]);
  await assert.rejects(check.query('select lock_skill_shadow_sources($1::uuid[],$2::uuid[])',[[job],[job]]),/unavailable/);
  await assert.rejects(check.query('select lock_skill_shadow_sources($1::uuid[],$2::uuid[])',[[job,job],[run,run]]),/Invalid/);
  await assert.rejects(check.query('select lock_skill_shadow_sources($1::uuid[],$2::uuid[])',[[job],[]]),/Invalid/);
  await assert.rejects(check.query('update agent_skill_shadow_job set reason=$2 where id=$1',[job,'forbidden']),/permission denied/);
 }finally{check.release();}
 console.log(JSON.stringify({shadowSourceLocksDatabase:'passed',campaignDisableWaits:true,captureRewriteWaits:true,writersResume:true,crossAccountRejected:true,wrongRunRejected:true,invalidBindingsRejected:true,noNewTableWriteGrant:true,activationWiring:false,automaticActivation:false,actualModelCalls:0}));
}finally{await pool.end();await getPool().end();}
