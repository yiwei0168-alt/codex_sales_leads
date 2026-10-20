import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createSchedule} from '../src/lib/assistant/main/schedules';
import {getPool} from '../src/lib/rag/db';

assert.equal(process.env.MA24_DISPOSABLE_SCHEDULE_WORKER,'1');
const image=process.env.MA24_SCHEDULE_WORKER_IMAGE!,network=process.env.MA24_SCHEDULE_NETWORK!,runtimeUrl=new URL(process.env.MA24_SCHEDULE_RUNTIME_DATABASE_URL!),ca=process.env.MA24_SCHEDULE_CA!;
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);
assert.equal(runtimeUrl.hostname,'pilot-db');assert.equal(runtimeUrl.searchParams.get('sslmode'),'verify-full');assert(ca.includes('BEGIN CERTIFICATE'));
const migration=new URL(process.env.DATABASE_MIGRATION_URL!),application=new URL(process.env.DATABASE_URL!);
assert.equal(migration.hostname,'127.0.0.1');assert.equal(application.host+application.pathname,migration.host+migration.pathname);
const owner=randomUUID(),tag=owner.replaceAll('-',''),trigger=`schedule_crash_${tag}`;
const appName=`ma24-schedule-crash-${tag}`;runtimeUrl.searchParams.set('application_name',appName);
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const docker=(args:string[])=>new Promise<string>((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
 child.stdout.on('data',part=>{out+=part;});child.stderr.on('data',part=>{err+=part;});
 child.once('error',reject);child.once('exit',code=>code===0?resolve(out.trim()):reject(new Error(`Isolated Docker operation failed (${code}): ${err.slice(-1000)}`)));
});
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=64m'];
const admin=new Client({connectionString:migration.toString()});await admin.connect();
let worker:string|undefined,receipt:Record<string,unknown>|undefined;
try{
 const metadata=JSON.parse(await docker(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await docker(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const source='src/lib/assistant/main/schedules.ts';
 const archived=execFileSync('tar',['-xOf','-',source],{input:execFileSync('git',['archive','--format=tar',metadata.revision,source])});
 const expectedSourceSha256=createHash('sha256').update(archived).digest('hex');
 const measured=JSON.parse(await docker(['run','--rm','--network','none',...restricted,'--entrypoint','node',metadata.id,'-e',
  "const f=require('fs'),c=require('crypto'),h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({source:h('/app/.skill-runtime-source/src/lib/assistant/main/schedules.ts'),worker:h('/app/worker.mjs'),declared:JSON.parse(f.readFileSync('/app/build-manifest.json','utf8')).artifacts.worker.sha256}));"]));
 assert.equal(measured.source,expectedSourceSha256);assert.equal(measured.worker,measured.declared);
 await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic scheduled Worker','member','active')",[owner,`${owner}@example.invalid`]);
 const schedule=await createSchedule(owner,{title:'Synthetic crash dispatch',content:'Synthetic schedule crash recovery',timezone:'Asia/Shanghai',plan:{kind:'once',at:new Date(Date.now()+1500).toISOString()}}) as {id:string};
 await admin.query(`create function ${trigger}() returns trigger language plpgsql as $$begin
  if new.id='${schedule.id}'::uuid and new.active_run_id is not null then perform pg_sleep(10);end if;return new;end$$;
 create trigger ${trigger} before update on agent_schedule for each row execute function ${trigger}();`);
 await admin.query('select pg_sleep(1.6)');
 const snapshot=async()=>(await admin.query(`select (select count(*)::int from agent_run where user_id=$1) runs,
  (select count(*)::int from assistant_conversation where user_id=$1) conversations,
  (select count(*)::int from assistant_message where user_id=$1) messages,
  (select count(*)::int from agent_run_event where user_id=$1) events,
  (select count(*)::int from agent_tool_call where user_id=$1 and tool_id='main_model') models,
  (select count(*)::int from agent_memory_extraction_job where owner_id=$1) extraction_jobs`,[owner])).rows[0];
 const zero={runs:0,conversations:0,messages:0,events:0,models:0,extraction_jobs:0};
 const start=async()=>{
  worker=await docker(['run','--detach','--name',`ma24-schedule-worker-${randomUUID().slice(0,8)}`,'--network',network,...restricted,
   '--env',`DATABASE_URL=${runtimeUrl}`,'--env',`DATABASE_SSL_CA=${ca}`,'--env','LANGGRAPH_API_URL=http://127.0.0.1:1',
   '--env','LANGCHAIN_TRACING_V2=false','--env','LANGSMITH_TRACING=false',metadata.id,'worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
 };
 const finish=async()=>{assert(worker);const exit=await docker(['wait',worker]),logs=await docker(['logs',worker]);assert.equal(exit,'0',logs);await docker(['rm','--volumes',worker]);worker=undefined;};
 await start();let observed=false;
 for(let i=0;i<300;i++){
  const activity=(await admin.query("select count(*)::int n from pg_stat_activity where application_name=$1 and state='active' and wait_event='PgSleep' and query like '%update agent_schedule set active_run_id%'",[appName])).rows[0].n;
  if(activity){observed=true;break;}
  assert.equal(await docker(['inspect','--format','{{.State.Running}}',worker!]),'true','Worker stopped before the post-enqueue wait');await pause(100);
 }
 assert(observed,'Did not observe actual post-enqueue event wait');assert.deepEqual(await snapshot(),zero);
 const claim=(await admin.query('select lease_token,lease_until::text,enabled,active_run_id from agent_schedule where id=$1',[schedule.id])).rows[0];
 assert(claim.lease_token&&claim.lease_until&&claim.enabled&&claim.active_run_id===null);
 await docker(['kill','--signal','KILL',worker!]);assert.equal(await docker(['wait',worker!]),'137');await docker(['rm','--volumes',worker!]);worker=undefined;
 let active=1;
 for(let i=0;i<250&&active;i++){
  active=Number((await admin.query('select count(*) from pg_stat_activity where application_name=$1 and xact_start is not null',[appName])).rows[0].count);if(active)await pause(100);
 }
 assert.equal(active,0,'Killed Worker left an active transaction');assert.deepEqual(await snapshot(),zero);
 assert.deepEqual((await admin.query('select lease_token,lease_until::text,enabled,active_run_id from agent_schedule where id=$1',[schedule.id])).rows[0],claim);
 await admin.query(`drop trigger ${trigger} on agent_schedule;drop function ${trigger}();`);
 let expired=false;
 for(let i=0;i<700;i++){
  expired=(await admin.query('select lease_until<=clock_timestamp() expired from agent_schedule where id=$1',[schedule.id])).rows[0].expired;
  if(expired)break;await pause(100);
 }
 assert(expired,'Original schedule lease did not expire');await start();await finish();
 const final=(await admin.query(`select s.enabled,s.active_run_id,s.lease_token,r.status
  from agent_schedule s join agent_run r on r.user_id=s.user_id and r.id=s.active_run_id where s.id=$1`,[schedule.id])).rows[0];
 assert(!final.enabled&&final.active_run_id&&final.lease_token!==claim.lease_token);assert.equal(final.status,'partial');
 const counts=await snapshot();assert.deepEqual(counts,{runs:1,conversations:1,messages:2,events:2,models:0,extraction_jobs:0});
 await start();await finish();assert.deepEqual(await snapshot(),counts);
 receipt={scheduleWorkerCrash:'passed',image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,archivedScheduleSourceSha256:expectedSourceSha256,
  compiledWorkerSha256:measured.worker,actualPostEnqueueWait:true,actualSigkillExitCode:137,noCommittedTaskFragmentsAfterKill:true,
  noActiveTransactionAfterKill:true,originalScheduleLeaseUnchanged:true,recoveredAfterActualLeaseExpiry:true,newLeaseToken:true,
  oneScheduledTask:true,subsequentWorkerNoReplay:true,finalTaskStatus:'partial',apiUnavailableIntentionally:true,modelCalls:0,externalActions:0};
}finally{
 try{if(worker)await docker(['rm','--force','--volumes',worker]);}finally{
  await getPool().end();try{
   await admin.query(`drop trigger if exists ${trigger} on agent_schedule;drop function if exists ${trigger}();`);
   for(const table of ['agent_schedule','agent_run_event','assistant_message','agent_run','assistant_conversation'])await admin.query(`delete from ${table} where user_id=$1`,[owner]);
   await admin.query('delete from app_user where id=$1',[owner]);
  }finally{await admin.end();}
 }
}
console.log(JSON.stringify({...receipt,fixtureRowsAndWorkersCleaned:true}));
