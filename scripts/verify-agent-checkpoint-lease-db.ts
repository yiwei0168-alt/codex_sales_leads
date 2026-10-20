import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import {getPool} from '../src/lib/rag/db';
import {AgentRunCheckpointer} from '../src/lib/assistant/main/agent-run-checkpointer';
import {enqueueRun,claimRun,controlRun,finishRun} from '../src/lib/assistant/main/repository';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {buildMainAgentGraph} from '../src/lib/assistant/main/graph';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_AGENT_CHECKPOINT_LEASE,'1');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic checkpoint lease','member','active')",[owner,`${owner}@example.invalid`]);
 const create=async()=>{
  const run=await enqueueRun(owner,{content:'Synthetic checkpoint lease fixture',requestKey:randomUUID(),attachments:[],mode:'standard'},modeModelConfig('standard'));
  const claimed=await claimRun('checkpoint-lease-fixture');assert.equal(claimed?.id,run.id);
  return {userId:owner,runId:run.id,leaseToken:claimed!.lease_token,role:'member' as const};
 };
 const metadata={source:'input' as const,step:-1,parents:{}};
 for(const mode of ['checkpoint','pending-write'] as const){
  const context=await create(),thread=`main-agent:${owner}:${context.runId}`,config={configurable:{thread_id:thread,checkpoint_ns:''}};
  const checkpoint=emptyCheckpoint();checkpoint.channel_values={value:'Synthetic checkpoint'};checkpoint.channel_versions={value:1};
  const saver=process.env.MA24_RAW_CHECKPOINT_REPRO==='1'?new PostgresSaver(getPool(),undefined,{schema:'langgraph'}):new AgentRunCheckpointer(context);
  const seed=mode==='pending-write'?await saver.put(config,checkpoint,metadata,checkpoint.channel_versions):null;
  await pool.query("update agent_run set lease_until=clock_timestamp()+interval '3 seconds' where id=$1",[context.runId]);
  const blocker=await pool.connect();let attempt:Promise<{error?:unknown}>|undefined;
  try{
   await blocker.query('begin');await blocker.query(`lock table langgraph.${mode==='checkpoint'?'checkpoints':'checkpoint_writes'} in share mode`);
   const pid=(await blocker.query('select pg_backend_pid() pid')).rows[0].pid;
   attempt=(mode==='checkpoint'?saver.put(config,checkpoint,metadata,checkpoint.channel_versions):saver.putWrites(seed!,[['result','Synthetic pending write']],'fixture-task'))
    .then(()=>({}),error=>({error}));let blocked=false;
   for(let i=0;i<100;i++){
    blocked=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) blocked',[pid])).rows[0].blocked;
    if(blocked)break;await new Promise(done=>setTimeout(done,20));
   }
   assert(blocked,`Checkpoint ${mode} did not reach the held write lock`);
   while((await pool.query('select lease_until>clock_timestamp() live from agent_run where id=$1',[context.runId])).rows[0].live)
    await new Promise(done=>setTimeout(done,50));
   await blocker.query('commit');
   assert.match(String((await attempt).error),/Agent lease lost/,'Expired checkpoint waiter must roll back');
   assert.equal((await pool.query('select count(*)::int n from langgraph.checkpoints where thread_id=$1',[thread])).rows[0].n,mode==='checkpoint'?0:1);
   assert.equal((await pool.query('select count(*)::int n from langgraph.checkpoint_writes where thread_id=$1',[thread])).rows[0].n,0);
   if(mode==='checkpoint')assert.equal((await pool.query('select count(*)::int n from langgraph.checkpoint_blobs where thread_id=$1',[thread])).rows[0].n,0);
   const successor=await claimRun('checkpoint-successor');assert.equal(successor?.id,context.runId);assert.notEqual(successor!.lease_token,context.leaseToken);
   await assert.rejects(saver.put(config,emptyCheckpoint(),metadata,{}),/Agent lease lost/);
   const current={...context,leaseToken:successor!.lease_token},fresh=new AgentRunCheckpointer(current);
   await fresh.put(config,checkpoint,metadata,checkpoint.channel_versions);assert((await fresh.getTuple(config))?.checkpoint);
   await controlRun(owner,current.runId,'cancel');await finishRun(current,'partial','');
  }finally{await blocker.query('rollback');blocker.release();if(attempt)await attempt;}
 }
 const context=await create(),saver=new AgentRunCheckpointer(context),config={configurable:{thread_id:`main-agent:${owner}:${context.runId}`,checkpoint_ns:''}};
 let models=0;
 const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),model:async()=>{models++;return {role:'assistant',content:'Synthetic graph answer'};},tool:async()=>{throw new Error('No business tools expected');}},saver);
 const initial={messages:[{role:'user' as const,content:'Synthetic graph'}],pending:[],steps:0,status:'running' as const,reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''};
 const final=await graph.invoke(initial,{...config,recursionLimit:30});assert.equal(final.status,'completed');assert.equal(models,1);
 const saved=await graph.getState(config);assert.equal(saved.values.reply,'Synthetic graph answer');assert.equal(saved.next.length,0);
 await assert.rejects(saver.put({configurable:{thread_id:`main-agent:${randomUUID()}:${context.runId}`}},emptyCheckpoint(),metadata,{}),/Checkpoint task identity changed/);
 await controlRun(owner,context.runId,'pause');await saver.put(config,emptyCheckpoint(),metadata,{});await finishRun(context,'partial','');
 await assert.rejects(saver.put(config,emptyCheckpoint(),metadata,{}),/Agent lease lost/);
 console.log(JSON.stringify({agentCheckpointLeaseDatabase:'passed',checkpointAndPendingWriteNaturalExpiryRollback:true,checkpointBlobsRollback:true,
  actualTokenTakeoverRejectsOldSaver:true,newOwnerReadsAndWrites:true,actualSharedGraphPersistAndReadback:true,crossThreadRejected:true,
  pendingControlCheckpointSavedAndSettledTaskRejected:true,modelRepliesSynthetic:true,actualModelCalls:0,businessToolExecutions:0}));
}finally{await pool.end();await getPool().end();}
