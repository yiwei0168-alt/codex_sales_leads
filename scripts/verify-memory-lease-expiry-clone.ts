import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {observeMemory} from '../src/lib/knowledge/temporal-memory';
import {processMessageMemoryCorrection} from '../src/lib/knowledge/memory-correction';
import {learnToolReceiptMemories} from '../src/lib/knowledge/tool-receipt-memory';
import {digest} from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External network disabled');};
const pool=new Pool({connectionString:url.toString()}),owners:string[]=[],results:unknown[]=[];
try{
 for(const kind of ['correction','receipt'] as const)for(const expire of [true,false]){
  const owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),lease=randomUUID();owners.push(owner);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic memory lease','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic memory lease')",[conversation,owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
  const target=kind==='correction'?await observeMemory(owner,{kind:'preference',content:'旧的合成偏好',sourceReceipt:{type:'local-qwen3-extraction'}}):null;
  await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",
   [owner,conversation,'更正记忆：“旧的合成偏好”改为“新的合成偏好”。',JSON.stringify({runId:run})]);
  if(kind==='receipt'){
   const doc=randomUUID(),input={sessionId:randomUUID(),documentIds:[doc]};
   await pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
    values($1,$2,$3,'vectorless_aggregate','1',$4,$5,'read','completed',$6)`,
   [owner,run,randomUUID(),digest(input),JSON.stringify(input),JSON.stringify({status:'success',data:{status:'ok',documentIds:[doc],count:1,truncated:false}})]);
  }
  const trigger=`ma24_lease_${owner.replaceAll('-','')}`;
  const counts=async()=>(await pool.query(`select
   (select count(*)::int from agent_memory_observation where owner_id=$1) observations,
   (select count(*)::int from agent_memory_notice where owner_id=$1) notices,
   (select count(*)::int from agent_memory_graph_outbox o join agent_memory_observation m on m.id=o.observation_id where m.owner_id=$1) outbox`,[owner])).rows[0];
  const before=await counts();
  try{
   await pool.query(`create function ${trigger}() returns trigger language plpgsql as $$ begin
    if new.owner_id='${owner}'::uuid then perform pg_sleep(2.2); end if; return new; end $$;
    create trigger ${trigger} after insert on agent_memory_observation for each row execute function ${trigger}()`);
   await pool.query(`insert into agent_memory_extraction_job(owner_id,run_id,status,lease_token,updated_at)
    values($1,$2,'processing',$3,clock_timestamp()-make_interval(secs=>$4))`,[owner,run,lease,expire?299:0]);
   const initial=(await pool.query('select updated_at::text from agent_memory_extraction_job where owner_id=$1 and run_id=$2',[owner,run])).rows[0].updated_at;
   const work=kind==='correction'?processMessageMemoryCorrection(owner,run,lease):learnToolReceiptMemories(owner,run,lease);
   if(expire){
    await assert.rejects(work,/extraction_lease_expired/);
    assert.deepEqual(await counts(),before,'Expired transaction must roll back observations/notices/outbox');
    const job=(await pool.query('select status,lease_token,updated_at::text from agent_memory_extraction_job where owner_id=$1 and run_id=$2',[owner,run])).rows[0];
    assert.deepEqual(job,{status:'processing',lease_token:lease,updated_at:initial});
    if(target)assert.equal((await pool.query('select count(*)::int n from agent_memory_observation where owner_id=$1 and corrects_id=$2',[owner,target])).rows[0].n,0);
   }else{
    assert.equal((await work).owned,true);
    const after=await counts();for(const key of ['observations','notices','outbox'])assert.equal(after[key],before[key]+1);
    const job=(await pool.query('select status,lease_token from agent_memory_extraction_job where owner_id=$1 and run_id=$2',[owner,run])).rows[0];
    assert.equal(job.status,kind==='correction'?'ready':'processing');
    assert.equal(job.lease_token,kind==='correction'?null:lease);
   }
   results.push({kind,expire,delayedInsertSeconds:2.2,finalWallClockGuardVerified:true,atomicCountsVerified:true});
  }finally{await pool.query(`drop trigger if exists ${trigger} on agent_memory_observation;drop function if exists ${trigger}()`);}
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
await writeFile('tmp/ma24-memory-lease-expiry-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
