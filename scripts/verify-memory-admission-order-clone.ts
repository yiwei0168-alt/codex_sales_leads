import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {observeMemory,observeMemoryInTransaction,undoMemory} from '../src/lib/knowledge/temporal-memory';
import {correctMemory} from '../src/lib/knowledge/memory-correction';
import {saveMemory} from '../src/lib/assistant/main/memory';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External network disabled');};
const pool=new Pool({connectionString:url.toString()}),owners:string[]=[],results:unknown[]=[];
try{
 for(const mode of ['observation','correction','undo','legacy-save','legacy-undo'] as const){
  const owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),message=randomUUID();owners.push(owner);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic admission order','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic admission order')",[conversation,owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
  const text='I prefer concise answers.';
  await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[message,owner,conversation,text,JSON.stringify({runId:run})]);
  let target=await observeMemory(owner,{kind:'preference',content:'Old synthetic preference',memoryKey:'admission-race',sourceReceipt:{type:'local-qwen3-extraction',runId:run,messageId:message,sourceQuote:text}});
  if(mode==='legacy-undo'){
   const saved=await saveMemory({userId:owner,runId:run,leaseToken:randomUUID(),role:'member'},{key:'admission-race',content:'Synthetic legacy automatic preference',kind:'preference',scope:'account',mandatory:false,markets:[],companies:[]},true);
   assert(saved.observationId);target=saved.observationId;
  }
  const holder=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
   await holder.query('begin');await holder.query('set local role network_copilot_app');
   await holder.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
   await holder.query('select lock_local_memory_extraction_source($1,$2,$3)',[run,message,text]);
   const pid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
   pending=mode==='observation'?observeMemory(owner,{kind:'preference',content:'Concurrent synthetic preference',memoryKey:'admission-race',sourceReceipt:{type:'synthetic-admission'}})
    :mode==='correction'?correctMemory(owner,{id:target,content:'Corrected synthetic preference'})
    :mode==='undo'||mode==='legacy-undo'?undoMemory(owner,target)
    :saveMemory({userId:owner,runId:run,leaseToken:randomUUID(),role:'member'},{key:'admission-race',content:'Synthetic legacy preference',kind:'preference',scope:'account',mandatory:false,markets:[],companies:[]},false);
   let admissionWait=false;const deadline=Date.now()+15000;
   while(Date.now()<deadline){
    const waiting=await pool.query<{query:string}>('select query from pg_stat_activity where $1=any(pg_blocking_pids(pid))',[pid]);
    if(waiting.rows.some(row=>row.query==='select pg_advisory_xact_lock(hashtextextended($1,0))'
      ||(mode==='legacy-undo'&&row.query.startsWith('select case when $1::boolean')))){admissionWait=true;break;}
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   assert(admissionWait,`${mode} must wait on admission before taking its memory key/target locks`);
   // The same memory key must remain available to the source-lock holder.
   await holder.query("set local lock_timeout='2s'");
   await observeMemoryInTransaction(holder,owner,{kind:'preference',content:'Source holder preference',memoryKey:'admission-race',sourceReceipt:{type:'synthetic-source-holder'}});
   await holder.query('commit');await pending;
   results.push({mode,admissionWaitObserved:true,sameKeyHolderWriteCompleted:true,waitingWriterCompletedAfterRelease:true});
  }finally{await holder.query('rollback');holder.release();if(pending)await pending;}
 }
}finally{
 const client=await pool.connect();
 try{
  await client.query('begin');await client.query('set local session_replication_role=replica');
  for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[owners]);
  await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=any($1::uuid[]))',[owners]);
  await client.query('delete from agent_memory_observation where owner_id=any($1::uuid[])',[owners]);
  await client.query('delete from agent_memory_version where memory_id in(select id from agent_memory where owner_id=any($1::uuid[]))',[owners]);
  await client.query('delete from agent_memory where owner_id=any($1::uuid[])',[owners]);
  for(const table of ['agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=any($1::uuid[])`,[owners]);
  await client.query('delete from app_user where id=any($1::uuid[])',[owners]);await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
const result={passed:true,results,modelAndNetworkCalls:0,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-memory-admission-order-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
