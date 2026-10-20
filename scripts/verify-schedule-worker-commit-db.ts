import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {createSchedule} from '../src/lib/assistant/main/schedules';
import {getPool} from '../src/lib/rag/db';

assert.equal(process.env.MA24_DISPOSABLE_SCHEDULE_WORKER,'1');
const image=process.env.MA24_SCHEDULE_WORKER_IMAGE!,network=process.env.MA24_SCHEDULE_NETWORK!,dbContainer=process.env.MA24_SCHEDULE_DATABASE_CONTAINER!,ca=process.env.MA24_SCHEDULE_CA!;
const runtime=new URL(process.env.MA24_SCHEDULE_RUNTIME_DATABASE_URL!),migration=new URL(process.env.DATABASE_MIGRATION_URL!),application=new URL(process.env.DATABASE_URL!);
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);assert.match(dbContainer,/^[a-f0-9]{64}$/);
assert.equal(runtime.hostname,'pilot-db');assert.equal(runtime.searchParams.get('sslmode'),'verify-full');assert.equal(migration.hostname,'127.0.0.1');
assert.equal(application.host+application.pathname,migration.host+migration.pathname);assert(ca.includes('BEGIN CERTIFICATE'));
const owners=[randomUUID(),randomUUID()],pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const docker=(args:string[],input?:string)=>new Promise<{code:number|null;output:string}>((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});let output='';
 child.stdout!.on('data',part=>{output+=part;});child.stderr!.on('data',part=>{output+=part;});
 if(input!==undefined)child.stdin!.end(input);
 child.once('error',reject);child.once('exit',code=>resolve({code,output:output.trim()}));
});
const execute=async(args:string[],input?:string)=>{const result=await docker(args,input);assert.equal(result.code,0,result.output.slice(-1500));return result.output;};
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m'];
const admin=new Client({connectionString:migration.toString()});await admin.connect();
let proxy:string|undefined,worker:string|undefined,receipt:Record<string,unknown>|undefined;
try{
 const metadata=JSON.parse(await execute(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await execute(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const code=await readFile(new URL('./lib/ma24-pg-commit-ack-proxy.mjs',import.meta.url),'utf8');
 proxy=await execute(['run','--detach','--name',`ma24-schedule-commit-proxy-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--entrypoint','node',metadata.id,'--input-type=module','-e',code]);assert.match(proxy,/^[a-f0-9]{64}$/);
 // Generated cluster key is transferred only through stdin to same-UID tmpfs.
 const key=await execute(['exec',dbContainer,'cat','/tmp/ma24-server.key']);
 await execute(['exec','--interactive',proxy,'node','-e',"let parts=[];process.stdin.on('data',p=>parts.push(p));process.stdin.on('end',()=>require('fs').writeFileSync('/tmp/ma24-pg-proxy-config.json',Buffer.concat(parts),{mode:0o600,flag:'wx'}));"],JSON.stringify({key,cert:ca,target:'schedule-dispatch'}));
 let ready=false;
 for(let i=0;i<100;i++){if((await execute(['logs',proxy])).includes('disposableCommitProxyReady')){ready=true;break;}await pause(100);}
 assert(ready,'Schedule commit proxy not ready');
 const proxyAddress=await execute(['inspect','--format',`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,proxy]);assert.match(proxyAddress,/^\d+\.\d+\.\d+\.\d+$/);
 const control=async(path:string,method='GET')=>JSON.parse(await execute(['exec',proxy!,'node','--input-type=module','-e',
  `const r=await fetch('http://127.0.0.1:5541${path}',{method:${JSON.stringify(method)}});if(!r.ok)throw Error('Proxy control failed');console.log(JSON.stringify(await r.json()));`]));
 const counts=async(owner:string)=>(await admin.query(`select (select count(*)::int from agent_run where user_id=$1) runs,
  (select count(*)::int from assistant_conversation where user_id=$1) conversations,(select count(*)::int from assistant_message where user_id=$1) messages,
  (select count(*)::int from agent_run_event where user_id=$1) events,(select count(*)::int from agent_tool_call where user_id=$1 and tool_id='main_model') models`,[owner])).rows[0];
 const state=async(owner:string)=>(await admin.query(`select
  (select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from agent_schedule s where user_id=$1) schedules,
  (select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from agent_run r where user_id=$1) runs,
  (select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from assistant_message m where user_id=$1) messages,
  (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from agent_run_event e where user_id=$1) events`,[owner])).rows[0];
 const schedule=async(owner:string)=>{
  await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic schedule commit','member','active')",[owner,`${owner}@example.invalid`]);
  const saved=await createSchedule(owner,{title:'Synthetic commit loss',content:'Synthetic schedule commit outcome',timezone:'Asia/Shanghai',plan:{kind:'once',at:new Date(Date.now()+1500).toISOString()}}) as {id:string};
  await admin.query('select pg_sleep(1.6)');return saved;
 };
 const runWorker=async(expectedExit:string)=>{
  const workerUrl=new URL(runtime);workerUrl.port='5540';workerUrl.searchParams.set('application_name','ma24-schedule-commit-fixture');
  worker=await execute(['run','--detach','--name',`ma24-schedule-commit-worker-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--add-host',`pilot-db:${proxyAddress}`,
   '--env',`DATABASE_URL=${workerUrl}`,'--env',`DATABASE_SSL_CA=${ca}`,'--env','LANGGRAPH_API_URL=http://127.0.0.1:1',
   '--env','LANGCHAIN_TRACING_V2=false','--env','LANGSMITH_TRACING=false',metadata.id,'worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
  const exit=await execute(['wait',worker]),logs=await execute(['logs',worker]);assert.equal(exit,expectedExit,logs);
  if(expectedExit==='1')assert(logs.includes('"phase":"worker"'),'Worker failed before reaching database work');
  await execute(['rm','--volumes',worker]);worker=undefined;
 };
 const first=await schedule(owners[0]);await control('/arm','POST');await runWorker('1');
 const firstStats=await control('/status');assert.equal(firstStats.targetKind,'schedule-dispatch');assert.equal(firstStats.targetCommitCommands,1);
 assert.equal(firstStats.backendCommitCompletions,1);assert.equal(firstStats.suppressedCommitCompletions,1);assert.equal(firstStats.suppressedReadyForQuery,1);assert.equal(firstStats.droppedCommitAcks,1);
 assert.equal(firstStats.protocolFailures,0);assert(firstStats.targetStatementsCompleted>=1&&firstStats.verifiedUpstreamTlsConnections>0);
 assert.deepEqual(await counts(owners[0]),{runs:1,conversations:1,messages:1,events:1,models:0});
 const committed=(await admin.query('select enabled,active_run_id,lease_until from agent_schedule where id=$1',[first.id])).rows[0];
 assert(!committed.enabled&&committed.active_run_id&&committed.lease_until===null);
 assert.equal((await admin.query('select status from agent_run where id=$1',[committed.active_run_id])).rows[0].status,'queued');
 await runWorker('0');assert.deepEqual(await counts(owners[0]),{runs:1,conversations:1,messages:2,events:2,models:0});
 const firstRecovered=await state(owners[0]);
 const second=await schedule(owners[1]);await control('/arm-before-commit','POST');await runWorker('1');
 const secondStats=await control('/status');assert.equal(secondStats.targetCommitCommands,2);assert.equal(secondStats.backendCommitCompletions,1);
 assert.equal(secondStats.blockedCommitCommands,1);assert.equal(secondStats.blockedAfterSuccessfulScheduleUpdate,1);assert.equal(secondStats.protocolFailures,0);
 let active=1;
 for(let i=0;i<100&&active;i++){active=Number((await admin.query("select count(*) from pg_stat_activity where application_name='ma24-schedule-commit-fixture' and xact_start is not null")).rows[0].count);if(active)await pause(100);}
 assert.equal(active,0);assert.deepEqual(await counts(owners[1]),{runs:0,conversations:0,messages:0,events:0,models:0});
 const original=(await admin.query('select enabled,active_run_id,lease_token,lease_until::text from agent_schedule where id=$1',[second.id])).rows[0];assert(original.enabled&&original.active_run_id===null&&original.lease_token&&original.lease_until);
 let expired=false;
 for(let i=0;i<700;i++){expired=(await admin.query('select lease_until<=clock_timestamp() expired from agent_schedule where id=$1',[second.id])).rows[0].expired;if(expired)break;await pause(100);}
 assert(expired);await runWorker('0');assert.deepEqual(await counts(owners[1]),{runs:1,conversations:1,messages:2,events:2,models:0});
 const recovered=(await admin.query('select enabled,active_run_id,lease_token from agent_schedule where id=$1',[second.id])).rows[0];assert(!recovered.enabled&&recovered.active_run_id&&recovered.lease_token!==original.lease_token);
 const secondRecovered=await state(owners[1]);await runWorker('0');assert.deepEqual(await state(owners[0]),firstRecovered);assert.deepEqual(await state(owners[1]),secondRecovered);
 assert.equal(Number((await admin.query("select count(*) from agent_run where user_id=any($1::uuid[]) and status='partial'",[owners])).rows[0].count),2);
 assert.equal(Number((await admin.query('select count(*) from agent_memory_extraction_job where owner_id=any($1::uuid[])',[owners])).rows[0].count),0);
 receipt={scheduleWorkerCommit:'passed',image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,
  actualPostgresCommitAcknowledgmentLost:true,committedScheduleAndTaskKept:true,successfulScheduleUpdateBeforeBlockedCommit:true,
  unforwardedCommitRolledBack:true,uncommittedCaseRecoveredAfterActualLeaseExpiry:true,leaseRewritten:false,
  finalProxyStats:await control('/status'),twoDistinctScheduledTasks:true,subsequentWorkerExactRowsUnchanged:true,
  apiUnavailableIntentionally:true,recoveredTasksPartial:true,modelCalls:0,externalActions:0};
}finally{
 try{if(worker)await docker(['rm','--force','--volumes',worker]);}finally{
  try{if(proxy)await execute(['rm','--force','--volumes',proxy]);}finally{
   await getPool().end();try{
    for(const table of ['agent_schedule','agent_run_event','assistant_message','agent_run','assistant_conversation'])await admin.query(`delete from ${table} where user_id=any($1::uuid[])`,[owners]);
    await admin.query('delete from app_user where id=any($1::uuid[])',[owners]);
   }finally{await admin.end();}
  }
 }
}
console.log(JSON.stringify({...receipt,fixtureRowsWorkersAndProxyCleaned:true}));
