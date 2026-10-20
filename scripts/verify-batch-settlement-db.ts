import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {pollDueModelBatch} from '../src/lib/assistant/main/model-batch';
import {enqueueRun,controlRun} from '../src/lib/assistant/main/repository';
import {digest} from '../src/lib/assistant/main/contracts';
import {getPool} from '../src/lib/rag/db';

assert.equal(process.env.MA24_DISPOSABLE_BATCH_SETTLEMENT,'1');
const migration=new URL(process.env.DATABASE_MIGRATION_URL!),application=new URL(process.env.DATABASE_URL!);
assert.equal(migration.hostname,'127.0.0.1');assert.equal(application.host+application.pathname,migration.host+migration.pathname);
process.env.OPENROUTER_API_KEY='synthetic-batch-settlement-fixture';
const admin=new Client({connectionString:migration.toString()});await admin.connect();
const owner=randomUUID(),peer=randomUUID(),trigger=`batch_settlement_${owner.replaceAll('-','')}`;
const config={model:'z-ai/glm-5.3:batch',providers:['fireworks'],version:'synthetic-settlement'};
let polls=0,releaseSlow:(()=>void)|undefined,slow:Promise<unknown>|undefined,receipt:Record<string,unknown>|undefined;
try{
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic batch settlement','member','active')",[id,`${id}@example.invalid`]);
 const create=async()=>{
  const run=await enqueueRun(owner,{content:'Synthetic receipt only',requestKey:randomUUID(),attachments:[]},config);
  const call=randomUUID(),reservation=randomUUID(),batch=randomUUID(),remote=`batch_${randomUUID()}`,custom=`turn-${call}`;
  await admin.query("insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status) values($1,$2,$3,'synthetic-batch','main_model','synthetic',$4,'{}','model','started')",[call,owner,run.id,digest({})]);
  await admin.query("insert into paid_call_reservation(id,user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,occupied_micros,status) values($1,$2,$3,'synthetic-batch','synthetic-only','fixture',100,100,'reserved')",[reservation,owner,run.id]);
  await admin.query("insert into agent_model_batch(id,user_id,run_id,call_id,reservation_id,model,provider,custom_id,remote_id,status) values($1,$2,$3,$4,$5,$6,'fireworks',$7,$8,'pending')",[batch,owner,run.id,call,reservation,config.model,custom,remote]);
  return {run:run.id,call,reservation,batch,remote,custom};
 };
 type Job=Awaited<ReturnType<typeof create>>;
 const response=(job:Job,text='Synthetic matched result',status='completed')=>({id:job.remote,model:'z-ai/glm-5.3',endpoint:'/v1/chat/completions',status,
  request_counts:{total:1,completed:status==='completed'?1:0,failed:0},usage:status==='completed'?{prompt_tokens:20,completion_tokens:10,cost:0.000036}:null,
  results:status==='completed'?[{custom_id:job.custom,response:{status_code:200,body:{choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}]}}}]:null});
 const transport=(job:Job,text?:string,status?:string):typeof fetch=>async(url,init)=>{
  assert(String(url).endsWith(`/batches/${job.remote}`));assert(!init?.method||init.method==='GET');polls++;return Response.json(response(job,text,status));
 };
 const snapshot=async(job:Job)=>(await admin.query(`select
  (select to_jsonb(r) from paid_call_reservation r where id=$1) reservation,
  (select to_jsonb(c) from agent_tool_call c where id=$2) call,
  (select to_jsonb(b) from agent_model_batch b where id=$3) batch,
  (select to_jsonb(r) from agent_run r where id=$4) run,
  (select count(*)::int from paid_cost_observation where reservation_id=$1) observations,
  (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from agent_run_event e where run_id=$4) events`,[job.reservation,job.call,job.batch,job.run])).rows[0];
 const failed=await create();
 await admin.query(`create function ${trigger}() returns trigger language plpgsql as $$begin
  if new.id='${failed.batch}'::uuid and new.status in('completed','failed') then raise exception 'Synthetic batch final write failure';end if;return new;end$$;
 create trigger ${trigger} before update on agent_model_batch for each row execute function ${trigger}();`);
 await assert.rejects(pollDueModelBatch(failed.batch,transport(failed)),/Synthetic batch final write failure/);
 const rolledBack=await snapshot(failed);
 assert.equal(rolledBack.reservation.status,'reserved','Batch final write failure left committed billing receipt');
 assert.equal(rolledBack.call.output,null);assert.equal(rolledBack.observations,0);assert.equal(rolledBack.batch.status,'pending');
 await admin.query(`drop trigger ${trigger} on agent_model_batch;drop function ${trigger}();`);
 const stale=await create();let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{releaseSlow=resolve;});
 slow=pollDueModelBatch(stale.batch,async()=>{polls++;entered();await gate;return Response.json(response(stale,'Obsolete slow result'));}).then(value=>({value}),error=>({error}));await started;
 const progress=await create();assert.equal(await pollDueModelBatch(progress.batch,transport(progress,undefined,'in_progress')),true);
 const waiting=await snapshot(progress);assert.equal(waiting.reservation.status,'reserved');assert.equal(waiting.call.output,null);assert.equal(waiting.batch.poll_lease_until,null);
 const normal=await create();assert.equal(await pollDueModelBatch(normal.batch,transport(normal)),true);
 const saved=await snapshot(normal);assert.equal(saved.reservation.status,'reported');assert.equal(saved.observations,1);assert.equal(saved.batch.status,'completed');
 const beforeDuplicate=polls;assert.equal(await pollDueModelBatch(normal.batch,transport(normal)),false);assert.equal(polls,beforeDuplicate);assert.deepEqual(await snapshot(normal),saved);
 // Real database expiry for both previous claim tokens; never rewrite leases or poll times.
 let expired=false;
 for(let i=0;i<1000;i++){
  expired=(await admin.query('select bool_and(poll_lease_until<=clock_timestamp()) expired from agent_model_batch where id=any($1::uuid[])',[[failed.batch,stale.batch]])).rows[0].expired;
  if(expired)break;await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(expired,'Original batch poll leases did not expire');
 assert.equal(await pollDueModelBatch(failed.batch,transport(failed)),true);assert.equal((await snapshot(failed)).observations,1);
 assert.equal(await pollDueModelBatch(progress.batch,transport(progress)),true);
 assert.equal(await pollDueModelBatch(stale.batch,transport(stale,'Current winner')),true);
 const winner=await snapshot(stale);releaseSlow!();const obsolete=await slow as {value?:boolean;error?:unknown};slow=undefined;
 assert.equal(obsolete.error,undefined);assert.equal(obsolete.value,false,'Obsolete poll was accepted after lease takeover');assert.deepEqual(await snapshot(stale),winner,'Obsolete result changed settled state');
 const conflict=await create();await admin.query("update agent_tool_call set status='completed',output=$2 where id=$1",[conflict.call,JSON.stringify({status:'success',data:{message:{role:'assistant',content:'Conflicting historical receipt'}}})]);
 await assert.rejects(pollDueModelBatch(conflict.batch,transport(conflict)),/Batch call receipt conflicts/);
 assert.equal((await snapshot(conflict)).reservation.status,'reserved');assert.equal((await snapshot(conflict)).batch.status,'pending');
 const late=await create();await controlRun(owner,late.run,'cancel');await admin.query("update app_user set status='disabled' where id=$1",[owner]);
 assert.equal(await pollDueModelBatch(late.batch,transport(late)),true);
 const cancelled=await snapshot(late);assert.equal(cancelled.run.status,'cancelled');assert.equal(cancelled.batch.status,'completed');assert.equal(cancelled.reservation.status,'reported');
 receipt={batchSettlement:'passed',atomicFinalWriteFailureRollback:true,actualLeaseSeconds:90,leaseOrPollTimeRewritten:false,
  expiredPollSupersededByRealClaim:true,obsoleteResultIgnored:true,settledSnapshotUnchanged:true,normalAndInProgressPolls:true,
  terminalDuplicateNoTransportCall:true,conflictingHistoricalReceiptRejected:true,cancelledDisabledAccountReceiptSavedWithoutResume:true,
  simulatedStatusPolls:polls,realProviderCalls:0,actualInferenceSubmissions:0,syntheticReservationAndJobRows:true};
}finally{
 releaseSlow?.();await slow;await getPool().end();
 try{
  await admin.query(`drop trigger if exists ${trigger} on agent_model_batch;drop function if exists ${trigger}();`);
  for(const table of ['agent_model_batch','agent_run_event','agent_tool_call','agent_run','assistant_message','assistant_conversation','paid_cost_observation','paid_call_reservation','paid_rule_hold','user_spend_budget'])await admin.query(`delete from ${table} where user_id=any($1::uuid[])`,[[owner,peer]]);
  await admin.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);
 }finally{await admin.end();}
}
console.log(JSON.stringify({...receipt,fixtureRowsCleaned:true}));
