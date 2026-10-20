import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../src/lib/rag/db';
import {enqueueRun,claimRun,beginCall,completeCall,controlRun} from '../src/lib/assistant/main/repository';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {result} from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_AGENT_CALL_LEASE,'1','Dedicated disposable database required');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic call lease fixture','member','active')",[owner,`${owner}@example.invalid`]);
 const create=async()=>{
  const run=await enqueueRun(owner,{content:'Synthetic task call lease boundary',requestKey:randomUUID(),attachments:[],mode:'standard'},modeModelConfig('standard'));
  const claimed=await claimRun('call-lease-fixture');assert.equal(claimed?.id,run.id);
  return {userId:owner,runId:run.id,leaseToken:claimed!.lease_token,role:'member' as const};
 };
 const call={key:'synthetic-read',tool:'customer_timeline',version:'1',input:{},effect:'read'};
 for(const scope of ['task-row','tool-table'] as const){
 const context=await create();
 await pool.query("update agent_run set lease_until=clock_timestamp()+interval '3 seconds' where id=$1",[context.runId]);
 const blocker=await pool.connect();let attempt:Promise<{error?:unknown}>|undefined;
 try{
  await blocker.query('begin');
  if(scope==='task-row')await blocker.query('select id from agent_run where id=$1 for no key update',[context.runId]);
  else await blocker.query('lock table agent_tool_call in share mode');
  const pid=(await blocker.query('select pg_backend_pid() pid')).rows[0].pid;
  attempt=beginCall(context,call).then(()=>({}),error=>({error}));
  let blocked=false;
  for(let i=0;i<100;i++){
   blocked=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) blocked',[pid])).rows[0].blocked;
   if(blocked)break;await new Promise(done=>setTimeout(done,20));
  }
  assert(blocked,`Task call did not reach the held ${scope} lock`);
  while((await pool.query('select lease_until>clock_timestamp() live from agent_run where id=$1',[context.runId])).rows[0].live)
   await new Promise(done=>setTimeout(done,50));
  await blocker.query('commit');
  assert.match(String((await attempt).error),/Agent lease lost/,'Expired waiter must reject before starting a tool');
  assert.equal((await pool.query('select count(*)::int n from agent_tool_call where run_id=$1',[context.runId])).rows[0].n,0);
 }finally{await blocker.query('rollback');blocker.release();if(attempt)await attempt;await controlRun(owner,context.runId,'cancel');}
 }
 const bound=await create();
 await pool.query("update agent_run set lease_until=clock_timestamp()+interval '1 second' where id=$1",[bound.runId]);
 await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  await client.query('select now()');await client.query('select pg_sleep(1.2)');return beginCall(bound,call);
 })),/Agent lease lost/);await controlRun(owner,bound.runId,'cancel');
 const valid=await create(),first=await beginCall(valid,call);assert.equal(first.fresh,true);
 const output=result({synthetic:true});await completeCall(valid,first.id,output,{});
 const reused=await beginCall(valid,call);assert.equal(reused.fresh,false);assert.deepEqual(reused.output,output);
 await assert.rejects(beginCall(valid,{...call,input:{changed:true}}),/Persisted call identity mismatch/);
 await controlRun(owner,valid.runId,'cancel');await assert.rejects(beginCall(valid,{...call,key:'after-cancel'}),/Agent lease lost/);
 console.log(JSON.stringify({agentCallLeaseDatabase:'passed',observedRowLockWaitCrossedNaturalExpiry:true,lateToolInsertWaitRollsBack:true,expiredWaiterCreatesNoToolCall:true,
  boundOldTransactionClockRejected:true,validCallAndCompletedReceiptReuseVerified:true,changedCallAndControlRejected:true,actualModelCalls:0,businessToolExecutions:0}));
}finally{await pool.end();await getPool().end();}
