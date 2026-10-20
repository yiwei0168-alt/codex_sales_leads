import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';
import {enqueueRun,claimRun,heartbeat,boundary,controlRun} from '../../src/lib/assistant/main/repository';
import {withAgentRunLease,settleControlledAgentRun} from '../../src/lib/assistant/main/agent-run-lease';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {productNodeBuildOptions} from '../lib/product-node-build.mjs';

/** Real task SQL and worker loop; only the remote SDK and unrelated schedulers
 * are replaced. All accounts/tasks belong to this disposable fixture. */
export async function verifyAgentRunLeaseDatabase(pool:Pool,owner:string){
 const create=()=>enqueueRun(owner,{content:'Synthetic shared task lease fixture',requestKey:randomUUID(),attachments:[],mode:'standard'},modeModelConfig('standard'));
 const claim=async(id:string)=>{
  const row=await claimRun('shared-lease-fixture');assert.equal(row?.id,id);
  return {userId:owner,runId:id,leaseToken:row!.lease_token,role:'member' as const};
 };
 const renewed=await create(),renewedContext=await claim(renewed.id);
 const initialExpiry=(await pool.query('select lease_until::text until from agent_run where id=$1',[renewed.id])).rows[0].until;
 await withAgentRunLease(renewedContext,async lease=>{
  await new Promise(done=>setTimeout(done,21_000));assert.equal(lease.signal.aborted,false);
  assert.equal((await pool.query("select lease_until>$2::timestamptz+interval '15 seconds' renewed from agent_run where id=$1",[renewed.id,initialExpiry])).rows[0].renewed,true);
  await controlRun(owner,renewed.id,'cancel');lease.stop();assert.equal(await settleControlledAgentRun(renewedContext,lease),true);
 });
 const expired=await create(),context=await claim(expired.id);
 for(const kind of ['heartbeat','boundary'] as const){
  await pool.query("update agent_run set lease_until=clock_timestamp()+interval '1 second' where id=$1",[expired.id]);
  await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
   await client.query('select now()');await client.query('select pg_sleep(1.2)');
   if(kind==='heartbeat')assert.equal(await heartbeat(context),false);
   else await assert.rejects(boundary(context),/Agent lease lost/);
  }));
 }
 await controlRun(owner,expired.id,'cancel');assert.equal((await pool.query('select status from agent_run where id=$1',[expired.id])).rows[0].status,'cancelled');
 const controlled=await create(),controlledContext=await claim(controlled.id);
 await controlRun(owner,controlled.id,'cancel');assert.equal(await heartbeat(controlledContext),false);
 await withAgentRunLease(controlledContext,async lease=>{assert(lease.signal.aborted);lease.stop();assert.equal(await settleControlledAgentRun(controlledContext,lease),true);});
 assert.equal((await pool.query('select status from agent_run where id=$1',[controlled.id])).rows[0].status,'cancelled');
 const inactive=await create(),inactiveContext=await claim(inactive.id);
 await pool.query("update app_user set status='disabled' where id=$1",[owner]);
 try{assert.equal(await heartbeat(inactiveContext),false);await assert.rejects(withAgentRunLease(inactiveContext,async()=>{throw new Error('Must not start inactive work');}),/lease unavailable/);}
 finally{await pool.query("update app_user set status='active' where id=$1",[owner]);await pool.query("update agent_run set status='partial',lease_until=null where id=$1",[inactive.id]);}

 const compiled=join(process.cwd(),'tmp','shared-lease-worker-fixture.mjs');
 await build({...productNodeBuildOptions(),entryPoints:['scripts/run-main-agent-worker.ts'],outfile:compiled,
  plugins:[{name:'synthetic-worker-sdk-and-initial-control-race',setup(builder){
   builder.onLoad({filter:/run-main-agent-worker\.ts$/},async args=>{
    const source=await readFile(args.path,'utf8'),needle='await withAgentRunLease(context,async lease=>';assert.equal(source.split(needle).length,2);
    return {contents:"import {controlRun as fixtureControl} from '../src/lib/assistant/main/repository';\n"+source.replace(needle,
     "if(process.env.MA24_WORKER_LEASE_CASE==='initial-pause')await fixtureControl(context.userId,context.runId,'pause');\n    "+needle),loader:'ts',resolveDir:dirname(args.path)};
   });
   builder.onResolve({filter:/.*/},args=>{
    if(!args.importer.replaceAll('\\','/').endsWith('/scripts/run-main-agent-worker.ts'))return;
    if(args.path==='@langchain/langgraph-sdk')return {path:'sdk',namespace:'lease-fixture'};
    if(args.path.endsWith('/schedules')||args.path.endsWith('/model-batch'))return {path:'background',namespace:'lease-fixture'};
   });
   builder.onLoad({filter:/.*/,namespace:'lease-fixture'},args=>({contents:args.path==='background'
    ?'export async function pollDueModelBatch(){};export async function dispatchDueSchedule(){}'
    :`export class Client{constructor(options){if(options.callerOptions.maxRetries!==0)throw Error('Worker retries changed');this.runs={wait:async(_thread,_graph,options)=>{console.log('FIXTURE_SDK_WAIT');if(process.env.MA24_WORKER_LEASE_CASE==='transport-error')throw Error('Synthetic transport loss');return new Promise((resolve,reject)=>{const stop=()=>reject(Error('Synthetic aborted SDK wait'));if(options.signal.aborted)stop();else options.signal.addEventListener('abort',stop,{once:true});});}};}}`,loader:'js'}));
  }}]});
 for(const scenario of ['transport-error','initial-pause','pause','cancel'] as const){
  const run=await create();await pool.query('update agent_run set result=$2 where id=$1',[run.id,JSON.stringify({reply:'Saved synthetic partial reply'})]);
  let entered!:()=>void;const marker=new Promise<void>(resolve=>{entered=resolve;});
  const child=spawn(process.execPath,[compiled,'--once'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
   LANGGRAPH_API_URL:'http://127.0.0.1:9',MA24_WORKER_LEASE_CASE:scenario,LANGCHAIN_TRACING_V2:'false',LANGSMITH_TRACING:'false'}});
  let output='',diagnostic=false;
  child.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('FIXTURE_SDK_WAIT'))entered();});
  child.stderr.on('data',chunk=>{if(String(chunk).includes('mainAgentRecovery'))diagnostic=true;});
  const timer=setTimeout(()=>child.kill('SIGKILL'),60_000);
  const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
  if(scenario==='pause'||scenario==='cancel'){
   await Promise.race([marker,exit.then(()=>{throw new Error('Worker exited before SDK marker');})]);await controlRun(owner,run.id,scenario);
  }
  assert.equal(await exit,0,`Compiled shared-lease worker failed: ${scenario}`);assert.equal(diagnostic,false);
  assert.equal(output.split('FIXTURE_SDK_WAIT').length-1,scenario==='initial-pause'?0:1);
  const stored=(await pool.query('select status,result from agent_run where id=$1',[run.id])).rows[0];
  assert.equal(stored.status,scenario==='transport-error'?'partial':scenario==='cancel'?'cancelled':'paused');
  if(scenario!=='transport-error')assert.equal(stored.result.reply,'Saved synthetic partial reply');
  assert.equal((await pool.query('select count(*)::int n from agent_tool_call where run_id=$1',[run.id])).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from agent_memory_extraction_job where run_id=$1',[run.id])).rows[0].n,0);
  if(stored.status==='paused'){await controlRun(owner,run.id,'resume');await controlRun(owner,run.id,'cancel');}
 }
 return {sharedAgentRunLeaseDatabaseVerified:true,sharedOrdinaryLeaseActualRenewalVerified:true,taskHeartbeatAndBoundaryRejectExpiredTransactionClock:true,
  controlledAndInactiveRenewalRejected:true,expiredRunningTaskControlSettledDirectly:true,compiledOrdinaryWorkerSharedLeaseVerified:true,
  ordinaryWorkerInitialPauseAndPauseCancelSettled:true,ordinaryWorkerTransportFailureNoAutomaticReplay:true,
  syntheticSdkAdapter:true,actualModelCalls:0};
}
