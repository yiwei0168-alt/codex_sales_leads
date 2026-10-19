import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {processLocalMemoryExtraction} from '../src/lib/knowledge/local-memory-extraction';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External model/network calls disabled');};
const pool=new Pool({connectionString:url.toString()}),owners:string[]=[],results:unknown[]=[];
const text='I prefer concise answers for my work.';
const model={name:'qwen3:8b',digest:'500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'};
const answer=()=>Response.json({message:{content:JSON.stringify({items:[{memoryKey:'source-race-style',content:'Concise answers',sourceQuote:text,confidence:0.9}]})}});
try{
  for(const mode of ['message','account','run','late-message'] as const){
    const owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),message=randomUUID();owners.push(owner);
    await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic source race','!','member','active')",[owner,`${owner}@example.invalid`]);
    await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic source race')",[conversation,owner]);
    await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
    await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[message,owner,conversation,text,JSON.stringify({runId:run})]);
    await pool.query('insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)',[owner,run]);
    const mutate=async()=>{
      if(mode==='account')await pool.query("update app_user set status='disabled' where id=$1",[owner]);
      else if(mode==='run')await pool.query("update agent_run set status='failed' where user_id=$1 and id=$2",[owner,run]);
      else await pool.query("update assistant_message set content='Changed synthetic source' where user_id=$1 and id=$2",[owner,message]);
    };
    const functionName=`ma24_source_race_${owner.replaceAll('-','')}`;
    let mutated=false,pending:Promise<string>|undefined;
    const holder=await pool.connect();
    try{
      if(mode==='late-message'){
        await holder.query('begin');
        const pid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
        const lockKey=`ma24-memory-source-race:${owner}`;
        await holder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[lockKey]);
        await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin
          if new.owner_id='${owner}'::uuid then perform pg_advisory_xact_lock(hashtextextended('${lockKey}',0)); end if; return new; end $$;
          create trigger ${functionName} after insert on agent_memory_observation for each row execute function ${functionName}()`);
        const fetcher:typeof fetch=async endpoint=>String(endpoint).endsWith('/api/tags')?Response.json({models:[model]}):answer();
        pending=processLocalMemoryExtraction(owner,run,fetcher);
        let observed=false;const deadline=Date.now()+15000;
        while(Date.now()<deadline){
          if((await pool.query(`select count(*)::int n from pg_stat_activity where $1=any(pg_blocking_pids(pid))
            and query like '%insert into agent_memory_observation%'`,[pid])).rows[0].n===1){observed=true;break;}
          await new Promise(accept=>setTimeout(accept,50));
        }
        assert(observed,'extraction must reach the held observation insertion');
        await mutate();mutated=true;await holder.query('commit');
        assert.equal(await pending,'queued');
      }else{
        const fetcher:typeof fetch=async endpoint=>{
          if(String(endpoint).endsWith('/api/tags'))return Response.json({models:[model]});
          if(!mutated){await mutate();mutated=true;}return answer();
        };
        assert.equal(await processLocalMemoryExtraction(owner,run,fetcher),'queued');
      }
      assert(mutated);
      assert.equal((await pool.query('select count(*)::int n from agent_memory_observation where owner_id=$1',[owner])).rows[0].n,0);
      assert.equal((await pool.query('select count(*)::int n from agent_memory_notice where owner_id=$1',[owner])).rows[0].n,0);
      const job=(await pool.query('select status,error_code from agent_memory_extraction_job where owner_id=$1 and run_id=$2',[owner,run])).rows[0];
      assert.deepEqual(job,{status:'queued',error_code:'source_changed'});
    }finally{
      await holder.query('rollback');holder.release();if(pending)await pending;
      await pool.query(`drop trigger if exists ${functionName} on agent_memory_observation;drop function if exists ${functionName}()`);
    }
    await pool.query("update app_user set status='active' where id=$1",[owner]);
    await pool.query("update agent_run set status='completed' where user_id=$1 and id=$2",[owner,run]);
    await pool.query('update assistant_message set content=$3 where user_id=$1 and id=$2',[owner,message,text]);
    await pool.query('update agent_memory_extraction_job set next_attempt_at=now() where owner_id=$1 and run_id=$2',[owner,run]);
    const retry:typeof fetch=async endpoint=>String(endpoint).endsWith('/api/tags')?Response.json({models:[model]}):answer();
    assert.equal(await processLocalMemoryExtraction(owner,run,retry),'ready');
    assert.equal((await pool.query('select count(*)::int n from agent_memory_observation where owner_id=$1',[owner])).rows[0].n,1);
    results.push({mode,staleSourceRejected:true,noObservationOrNoticeAfterRejection:true,restoredSourceRetryPassed:true});
  }
}finally{
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[owners]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=any($1::uuid[]))',[owners]);
    for(const table of ['agent_memory_observation','agent_memory_extraction_job'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[owners]);
    for(const table of ['agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=any($1::uuid[])`,[owners]);
    await client.query('delete from app_user where id=any($1::uuid[])',[owners]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
const result={passed:true,results,realModelCalls:0,syntheticLocalModelAdapter:true,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-memory-source-race-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
