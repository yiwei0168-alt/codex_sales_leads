import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createSchedule,changeSchedule,dispatchDueSchedule,listSchedules} from '../src/lib/assistant/main/schedules';
import {getPool,withDatabaseDeadline} from '../src/lib/rag/db';
import {databaseDeadline} from '../src/lib/rag/database-deadline';

assert.equal(process.env.MA24_DISPOSABLE_SCHEDULE_DISPATCH,'1');
const migration=new URL(process.env.DATABASE_MIGRATION_URL!),application=new URL(process.env.DATABASE_URL!);
assert.equal(migration.hostname,'127.0.0.1');assert.equal(application.host+application.pathname,migration.host+migration.pathname);
const admin=new Client({connectionString:migration.toString()});await admin.connect();
const owner=randomUUID(),peer=randomUUID(),suffix=owner.replaceAll('-','');
const fail=`schedule_fail_${suffix}`,delay=`schedule_delay_${suffix}`;
let pendingExpiry:Promise<unknown>|undefined,receipt:unknown;
try{
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic schedule','member','active')",[id,`${id}@example.invalid`]);
 const at=new Date(Date.now()+2000).toISOString();
 const create=async(title:string,interval=false)=>(await createSchedule(owner,{title,content:`Synthetic ${title}`,timezone:'Asia/Shanghai',plan:interval?{kind:'interval',minutes:1}:{kind:'once',at}})) as {id:string;version:number};
 const failed=await create('failed settlement'),cancelled=await create('cancelled enqueue'),expired=await create('expired lease'),once=await create('once'),disabled=await create('disabled'),interval=await create('interval',true);
 await admin.query(`create function ${fail}() returns trigger language plpgsql as $$begin
  if new.id='${failed.id}'::uuid and new.active_run_id is not null then raise exception 'Synthetic schedule settlement failure';end if;return new;end$$;
 create trigger ${fail} before update on agent_schedule for each row execute function ${fail}();
 create function ${delay}() returns trigger language plpgsql as $$begin
  if new.kind='queued' and exists(select 1 from agent_run where id=new.run_id and request_key like 'schedule:${expired.id}:%') then perform pg_sleep(61);
  elsif new.kind='queued' and exists(select 1 from agent_run where id=new.run_id and request_key like 'schedule:${cancelled.id}:%') then perform pg_sleep(5);end if;return new;end$$;
 create trigger ${delay} before insert on agent_run_event for each row execute function ${delay}();`);
 await admin.query('select pg_sleep(2.1)');
 await assert.rejects(dispatchDueSchedule(failed.id),/Synthetic schedule settlement failure/);
 const counts=async()=>(await admin.query(`select (select count(*)::int from agent_run where user_id=$1) runs,
  (select count(*)::int from assistant_conversation where user_id=$1) conversations,
  (select count(*)::int from assistant_message where user_id=$1) messages,
  (select count(*)::int from agent_run_event where user_id=$1) events`,[owner])).rows[0];
 assert.deepEqual(await counts(),{runs:0,conversations:0,messages:0,events:0},'Failed schedule settlement left a separately committed queued task');
 pendingExpiry=dispatchDueSchedule(expired.id).then(()=>({unexpectedSuccess:true}),error=>({error}));
 await assert.rejects(withDatabaseDeadline(databaseDeadline(400),()=>dispatchDueSchedule(cancelled.id)),{code:'DATABASE_DEADLINE_EXCEEDED'});
 await new Promise(resolve=>setTimeout(resolve,500));
 assert.deepEqual(await counts(),{runs:0,conversations:0,messages:0,events:0},'Cancelled schedule enqueue left persisted task fragments');
 assert.equal(await changeSchedule(owner,disabled.id,disabled.version,false),true);assert.equal(await dispatchDueSchedule(disabled.id),false);
 assert.deepEqual(await listSchedules(peer),[]);
 const competing=await Promise.all([dispatchDueSchedule(once.id),dispatchDueSchedule(once.id)]);
 assert.deepEqual(competing.sort(),[false,true]);assert.equal(await dispatchDueSchedule(once.id),false);
 const expiry=await pendingExpiry as {unexpectedSuccess?:boolean;error?:Error};pendingExpiry=undefined;
 assert(!expiry.unexpectedSuccess&&expiry.error?.message.includes('Schedule lease expired before dispatch completed'),'Dispatcher settled after its real 60-second lease expired');
 assert.deepEqual(await counts(),{runs:1,conversations:1,messages:1,events:1},'Expired dispatch persisted additional task fragments');
 await admin.query(`drop trigger ${fail} on agent_schedule;drop function ${fail}();drop trigger ${delay} on agent_run_event;drop function ${delay}();`);
 // Observe actual expiry; never edit a stored due time, lease token or deadline.
 for(const schedule of [failed,cancelled]){
  const timing=(await admin.query("select extract(epoch from greatest(lease_until-clock_timestamp(),interval '0'))::float8 remaining from agent_schedule where id=$1",[schedule.id])).rows[0];
  if(timing.remaining>0)await admin.query('select pg_sleep($1)',[Number(timing.remaining)+0.05]);
  assert.equal(await dispatchDueSchedule(schedule.id),true);assert.equal(await dispatchDueSchedule(schedule.id),false);
 }
 assert.equal(await dispatchDueSchedule(expired.id),true);assert.equal(await dispatchDueSchedule(expired.id),false);
 assert.equal(await dispatchDueSchedule(interval.id),true);assert.equal(await dispatchDueSchedule(interval.id),false);
 const final=(await admin.query(`select count(*)::int schedules,count(distinct active_run_id)::int distinct_runs,
  bool_and(case when plan->>'kind'='interval' then enabled and next_run_at>clock_timestamp() else not enabled end) settled
  from agent_schedule where user_id=$1 and id<>$2`,[owner,disabled.id])).rows[0];
 assert.deepEqual(final,{schedules:5,distinct_runs:5,settled:true});assert.deepEqual(await counts(),{runs:5,conversations:5,messages:5,events:5});
 receipt={scheduleDispatch:'passed',sourceImplementation:true,atomicSettlementFailureRollback:true,nestedDeadlineRollback:true,
  realLeaseExpiryRollback:true,actualLeaseSeconds:60,leaseRewritten:false,recoveryAfterActualLeaseExpiry:true,onceAndIntervalDispatch:true,
  concurrentClaimSingleTask:true,disabledAndCrossAccountDenied:true,finalRuns:5,modelCalls:0,externalActions:0};
}finally{
 await pendingExpiry;await getPool().end();
 try{
  await admin.query(`drop trigger if exists ${fail} on agent_schedule;drop function if exists ${fail}();drop trigger if exists ${delay} on agent_run_event;drop function if exists ${delay}();`);
  for(const table of ['agent_schedule','agent_run_event','assistant_message','agent_run','assistant_conversation'])await admin.query(`delete from ${table} where user_id=any($1::uuid[])`,[[owner,peer]]);
  await admin.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);
 }finally{await admin.end();}
}
console.log(JSON.stringify(receipt));
