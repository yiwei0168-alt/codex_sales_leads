import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {processMessageMemoryCorrection} from '../src/lib/knowledge/memory-correction';
import {learnToolReceiptMemories} from '../src/lib/knowledge/tool-receipt-memory';
import {digest} from '../src/lib/assistant/main/contracts';
import {observeMemory} from '../src/lib/knowledge/temporal-memory';
import {correctionMessageHash} from '../src/lib/knowledge/natural-memory-correction';
nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External network disabled');};
assert(process.argv.slice(2).every(arg=>arg==='--install-receipt-locks')&&process.argv.length<=3);
const pool=new Pool({connectionString:url.toString()}),owners:string[]=[],results:unknown[]=[];
try{
 if(process.argv.includes('--install-receipt-locks'))await pool.query(await readFile('db/migrations/155_local_memory_receipt_source_locks.sql','utf8'));
 for(const mode of ['early-message','late-message','early-account','early-run','late-account','late-run','late-edit','late-insert','early-origin','late-origin']){
  const originCase=mode.endsWith('origin'),correction=mode.endsWith('message')||originCase,early=mode.startsWith('early');
  const owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),message=randomUUID(),call=randomUUID(),lease=randomUUID();owners.push(owner);
  const originRun=randomUUID(),originMessage=randomUUID(),originConversation=randomUUID();
  const oldContent='I prefer concise answers.',newContent='I prefer detailed answers.';
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic secondary source','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic secondary source')",[conversation,owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
  if(originCase){
   await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic old origin')",[originConversation,owner]);
   await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[originRun,owner,originConversation]);
   await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",
    [originMessage,owner,originConversation,oldContent,JSON.stringify({runId:originRun})]);
   await observeMemory(owner,{kind:'preference',content:oldContent,memoryKey:'origin-case',sourceReceipt:{type:'local-qwen3-extraction',runId:originRun,messageId:originMessage,sourceQuote:oldContent}});
  }
  const command=originCase?`I previously said ${oldContent} That was wrong: ${newContent}`:'更正记忆：“旧的合成偏好”改为“新的合成偏好”。';
  await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",
   [message,owner,conversation,command,JSON.stringify({runId:run})]);
  const doc=randomUUID(),input={sessionId:randomUUID(),documentIds:[doc]},output={status:'success',data:{status:'ok',documentIds:[doc],count:1,truncated:false}};
  const insertReceipt=(id:string)=>pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
   values($1,$2,$3,$1::uuid::text,'vectorless_aggregate','1',$4,$5,'read','completed',$6)`,[id,owner,run,digest(input),JSON.stringify(input),JSON.stringify(output)]);
  if(!correction)await insertReceipt(call);
  await pool.query("insert into agent_memory_extraction_job(owner_id,run_id,status,lease_token) values($1,$2,'processing',$3)",[owner,run,lease]);
  const mutate=async()=>{
   if(originCase)await (early?holder:pool).query("update assistant_message set content='Changed synthetic old origin' where id=$1 and user_id=$2",[originMessage,owner]);
   else if(mode.endsWith('message'))await pool.query("update assistant_message set content='Changed synthetic command' where id=$1 and user_id=$2",[message,owner]);
   else if(mode.endsWith('account'))await pool.query("update app_user set status='disabled' where id=$1",[owner]);
   else if(mode.endsWith('run'))await pool.query("update agent_run set status='failed' where id=$1 and user_id=$2",[run,owner]);
   else if(mode==='late-edit')await pool.query("update agent_tool_call set output='{}' where id=$1 and user_id=$2",[call,owner]);
   else await insertReceipt(randomUUID());
  };
  const trigger=`ma24_secondary_${owner.replaceAll('-','')}`,lockKey=early?`skill-memory-owner:${owner}`:`secondary-source:${owner}`;
  const holder=await pool.connect();let work:Promise<unknown>|undefined,mutation:Promise<void>|undefined;
  try{
   await holder.query('begin');const holderPid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
   if(mode==='early-origin')await holder.query('select id from assistant_conversation where id=$1 for update',[originConversation]);
   else await holder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[lockKey]);
   if(!early)await pool.query(`create function ${trigger}() returns trigger language plpgsql as $$ begin
    if new.owner_id='${owner}'::uuid then perform pg_advisory_xact_lock(hashtextextended('${lockKey}',0)); end if; return new; end $$;
    create trigger ${trigger} after insert on agent_memory_observation for each row execute function ${trigger}()`);
   work=correction?processMessageMemoryCorrection(owner,run,lease,originCase?{messageSha256:correctionMessageHash(command),output:{intent:'correction',oldContent,content:newContent}}:undefined):learnToolReceiptMemories(owner,run,lease);
   // Attach a rejection handler while the expected source failure is still pending.
   void work.catch(()=>undefined);
   const waitFor=async(blocker:number,fragment:string)=>{
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
     const rows=await pool.query<{pid:number;query:string}>('select pid,query from pg_stat_activity where $1=any(pg_blocking_pids(pid))',[blocker]);
     const row=rows.rows.find(value=>value.query.includes(fragment));if(row)return row.pid;
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Expected source wait not observed: ${mode}`);
   };
   const workerPid=await waitFor(holderPid,early?'select lock_local_memory_':'insert into agent_memory_observation');
   if(early){await mutate();await holder.query('commit');await assert.rejects(work,/source_changed/);}
   else{
    mutation=mutate();void mutation.catch(()=>undefined);
    await waitFor(workerPid,mode==='late-insert'?'insert into agent_tool_call':'update ');
    await holder.query('commit');assert.equal((await work as {owned:boolean}).owned,true);await mutation;
   }
   const n=(await pool.query(`select
    (select count(*)::int from agent_memory_observation where owner_id=$1) observations,
    (select count(*)::int from agent_memory_notice where owner_id=$1) notices`,[owner])).rows[0];
   const baseline=originCase?1:0;
   assert.deepEqual(n,{observations:baseline+(early?0:1),notices:baseline+(early?0:1)});
   results.push({mode,sourceChangedBeforeLockRejected:early,mutationWaitedThroughCommit:!early,atomicCountsVerified:true});
  }finally{
   await holder.query('rollback');holder.release();
   if(work)await work.catch(()=>undefined);if(mutation)await mutation.catch(()=>undefined);
   await pool.query(`drop trigger if exists ${trigger} on agent_memory_observation;drop function if exists ${trigger}()`);
  }
 }
}finally{
 const client=await pool.connect();
 try{
  await client.query('begin');await client.query('set local session_replication_role=replica');
  for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[owners]);
  await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=any($1::uuid[]))',[owners]);
  for(const table of ['agent_memory_observation','agent_memory_extraction_job'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[owners]);
  for(const table of ['agent_tool_call','agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=any($1::uuid[])`,[owners]);
  await client.query('delete from app_user where id=any($1::uuid[])',[owners]);await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
const result={passed:true,results,modelAndNetworkCalls:0,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-memory-secondary-source-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
