import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {changeSkill,importSkill,readSkill} from '../src/lib/assistant/main/skills';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()});
const userId=randomUUID(),conversationId=randomUUID(),runId=randomUUID();
const context={userId,role:'member' as const,runId,leaseToken:randomUUID()};
let skillId:string|undefined;
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Rollback fixture','!','member','active')",[userId,`${userId}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Rollback fixture')",[conversationId,userId]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[runId,userId,conversationId]);
  const first=await importSkill(context,{name:'Rollback check',source:'user',files:{'SKILL.md':'Read original sources.'},dependencies:[]});
  skillId=first.id;
  const second=await importSkill(context,{skillId,expectedVersion:1,name:'Rollback check',source:'user',files:{'SKILL.md':'Read original sources and compare citations.'},dependencies:[]});
  assert.equal(second.version,2);
  await changeSkill(context,{id:skillId,version:2,operation:'enable'},true);
  assert.equal((await pool.query('select enabled,current_version from agent_skill where id=$1',[skillId])).rows[0].enabled,true);
  assert.equal((await readSkill(context,skillId))?.version,2);
  await changeSkill(context,{id:skillId,version:1,operation:'rollback'},true);
  const restored=(await pool.query('select enabled,current_version from agent_skill where id=$1',[skillId])).rows[0];
  assert.deepEqual(restored,{enabled:false,current_version:1});
  assert.equal(await readSkill(context,skillId),null,'Restored version must not be readable while disabled');
  await changeSkill(context,{id:skillId,version:1,operation:'enable'},true);
  const laterRunId=randomUUID();
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[laterRunId,userId,conversationId]);
  assert.equal((await readSkill({...context,runId:laterRunId},skillId))?.version,1);
  console.log(JSON.stringify({clone:true,restoredVersion:1,disabledAfterRollback:true,readBlockedUntilHumanEnable:true,modelCalls:0}));
}finally{
  const client=await pool.connect();
  try{
    await client.query('begin');
    await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_run_skill where user_id=$1',[userId]);
    if(skillId){await client.query('delete from agent_skill_version where skill_id=$1',[skillId]);await client.query('delete from agent_skill where id=$1',[skillId]);}
    await client.query('delete from agent_run where user_id=$1',[userId]);
    await client.query('delete from assistant_conversation where user_id=$1',[userId]);
    await client.query('delete from app_user where id=$1',[userId]);
    await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
