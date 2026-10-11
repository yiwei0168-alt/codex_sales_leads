import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {observeMemory,undoMemory} from '../src/lib/knowledge/temporal-memory';
import {proposeExperienceSkillInTransaction} from '../src/lib/knowledge/experience-skill-draft';
import {changeSkill,readSkill} from '../src/lib/assistant/main/skills';
import {assertCurrentSkillMessages} from '../src/lib/assistant/main/skill-message-guard';
import type {ModelMessage} from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),conversation=randomUUID();
const quote='I found comparing original tables reduced errors.',key=`source-guard-${owner}`;
let skillId='',runId='';const observations:string[]=[];
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Skill guard fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Skill guard fixture')",[conversation,owner]);
  for(let i=0;i<2;i++){
    runId=randomUUID();const messageId=randomUUID();
    await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','completed','main-agent')`,[runId,owner,conversation,JSON.stringify({content:quote,requestKey:runId,attachments:[]})]);
    await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[messageId,owner,conversation,quote,JSON.stringify({runId})]);
    observations.push(await observeMemory(owner,{kind:'experience',memoryKey:key,content:quote,sourceReceipt:{type:'local-qwen3-extraction',usage:'unverified-user-experience',sourceQuote:quote,runId,messageId}}));
    const candidate=await tenantTransaction(owner,client=>proposeExperienceSkillInTransaction(client,owner,key,quote));
    if(candidate)skillId=candidate.id;
  }
  assert(skillId);
  const context={userId:owner,role:'member' as const,runId,leaseToken:randomUUID()},action={id:skillId,version:1,operation:'enable' as const};
  await assert.rejects(()=>changeSkill(context,action),/replay and shadow/);
  await changeSkill(context,action,true); // Explicit synthetic human activation, not quality acceptance.
  const loaded=await readSkill(context,skillId);assert(loaded);
  const messages:ModelMessage[]=[{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'skill_read',arguments:{id:skillId}})}}]},
    {role:'tool',tool_call_id:'read',content:JSON.stringify({status:'success',data:loaded})}];
  await assertCurrentSkillMessages(context,messages);
  await assert.rejects(()=>assertCurrentSkillMessages({...context,userId:randomUUID()},messages));
  await changeSkill(context,{...action,operation:'disable'},true);
  await assert.rejects(()=>assertCurrentSkillMessages(context,messages));
  await changeSkill(context,action,true);
  const pinned=await pool.query('select version from agent_run_skill where user_id=$1 and run_id=$2 and skill_id=$3',[owner,runId,skillId]);
  assert.equal(pinned.rows[0].version,1);
  const conflict=await observeMemory(owner,{kind:'experience',memoryKey:key,content:'I found this method failed.',sourceReceipt:{type:'synthetic'}});
  assert.equal(await readSkill(context,skillId),null,'Conflict must block an already pinned version');
  await assert.rejects(()=>assertCurrentSkillMessages(context,messages));
  await undoMemory(owner,conflict);
  assert(await readSkill(context,skillId));
  await assertCurrentSkillMessages(context,messages);
  await undoMemory(owner,observations[0]);
  assert.equal(await readSkill(context,skillId),null,'Revocation must block an already pinned version');
  await assert.rejects(()=>assertCurrentSkillMessages(context,messages));
  for(const human of [false,true])for(const operation of ['enable','rollback'] as const)
    await assert.rejects(()=>changeSkill(context,{...action,operation},human),/sources changed/);
  await changeSkill(context,{...action,operation:'disable'},true);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skillId])).rows[0].enabled,false);
  assert.equal((await pool.query('select count(*)::int n from agent_skill_version where skill_id=$1',[skillId])).rows[0].n,1);
  console.log(JSON.stringify({clone:true,currentSourcesReadable:true,unreviewedAutoActivationDenied:true,pinnedConflictDenied:true,resolvedConflictReadable:true,pinnedRevocationDenied:true,humanAndAgentReactivationDenied:true,disableAvailable:true,historyRetained:true,
    loadedContextRechecked:true,loadedContextDisableDenied:true,loadedContextRevocationDenied:true,crossAccountContextDenied:true,modelCalls:0}));
}finally{
  const client=await pool.connect();try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)',[owner]);
    await client.query('delete from agent_skill where owner_id=$1',[owner]);
    for(const table of ['agent_run_skill','agent_run_event'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)',[owner]);
    await client.query('delete from agent_memory_observation where owner_id=$1',[owner]);
    for(const table of ['assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
