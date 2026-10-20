import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {enqueueRun,controlRun} from '../src/lib/assistant/main/repository';
import {digest} from '../src/lib/assistant/main/contracts';
import {getPool} from '../src/lib/rag/db';

assert.equal(process.env.MA24_DISPOSABLE_BATCH_WORKER,'1');
const commitCheck=process.env.MA24_BATCH_WORKER_COMMIT==='1';
const image=process.env.MA24_BATCH_WORKER_IMAGE!,network=process.env.MA24_BATCH_NETWORK!,dbContainer=process.env.MA24_BATCH_DATABASE_CONTAINER!,ca=process.env.MA24_BATCH_CA!;
const runtime=new URL(process.env.MA24_BATCH_RUNTIME_DATABASE_URL!),migration=new URL(process.env.DATABASE_MIGRATION_URL!),application=new URL(process.env.DATABASE_URL!);
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);assert.match(dbContainer,/^[a-f0-9]{64}$/);
assert.equal(runtime.hostname,'pilot-db');assert.equal(runtime.searchParams.get('sslmode'),'verify-full');assert.equal(migration.hostname,'127.0.0.1');
assert.equal(application.host+application.pathname,migration.host+migration.pathname);
const owner=randomUUID(),tag=owner.replaceAll('-',''),trigger=`batch_crash_${tag}`,appName=`ma24-batch-worker-${tag}`;
runtime.searchParams.set('application_name',appName);
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const docker=(args:string[],input?:string)=>new Promise<string>((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});let output='';
 child.stdout!.on('data',part=>{output+=part;});child.stderr!.on('data',part=>{output+=part;});if(input!==undefined)child.stdin!.end(input);
 child.once('error',reject);child.once('exit',code=>code===0?resolve(output.trim()):reject(new Error(`Batch Worker fixture Docker operation failed (${code}): ${output.slice(-1500)}`)));
});
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m'];
const admin=new Client({connectionString:migration.toString()});await admin.connect();
let stub:string|undefined,worker:string|undefined,volume:string|undefined,proxy:string|undefined,proxyAddress:string|undefined,receipt:Record<string,unknown>|undefined;
try{
 const metadata=JSON.parse(await docker(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await docker(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const source='src/lib/assistant/main/model-batch.ts',archived=execFileSync('tar',['-xOf','-',source],{input:execFileSync('git',['archive','--format=tar',metadata.revision,source])});
 const sourceSha256=createHash('sha256').update(archived).digest('hex');
 const measured=JSON.parse(await docker(['run','--rm','--network','none',...restricted,'--entrypoint','node',metadata.id,'-e',
  "const f=require('fs'),c=require('crypto'),h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({source:h('/app/.skill-runtime-source/src/lib/assistant/main/model-batch.ts'),worker:h('/app/worker.mjs'),declared:JSON.parse(f.readFileSync('/app/build-manifest.json','utf8')).artifacts.worker.sha256}));"]));
 assert.equal(measured.source,sourceSha256);assert.equal(measured.worker,measured.declared);
 const control=async(path:string,method='GET')=>JSON.parse(await docker(['exec',proxy!,'node','--input-type=module','-e',
  `const r=await fetch('http://127.0.0.1:5541${path}',{method:${JSON.stringify(method)}});if(!r.ok)throw Error('Proxy control failed');console.log(JSON.stringify(await r.json()));`]));
 if(commitCheck){
  const code=await readFile(new URL('./lib/ma24-pg-commit-ack-proxy.mjs',import.meta.url),'utf8');
  proxy=await docker(['run','--detach','--name',`ma24-batch-commit-proxy-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--entrypoint','node',metadata.id,'--input-type=module','-e',code]);assert.match(proxy,/^[a-f0-9]{64}$/);
  const key=await docker(['exec',dbContainer,'cat','/tmp/ma24-server.key']);
  await docker(['exec','--interactive',proxy,'node','-e',"let parts=[];process.stdin.on('data',p=>parts.push(p));process.stdin.on('end',()=>require('fs').writeFileSync('/tmp/ma24-pg-proxy-config.json',Buffer.concat(parts),{mode:0o600,flag:'wx'}));"],JSON.stringify({key,cert:ca,target:'batch-settlement'}));
  let ready=false;for(let i=0;i<100;i++){if((await docker(['logs',proxy])).includes('disposableCommitProxyReady')){ready=true;break;}await pause(100);}assert(ready);
  proxyAddress=await docker(['inspect','--format',`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,proxy]);assert.match(proxyAddress,/^\d+\.\d+\.\d+\.\d+$/);
  runtime.port='5540';
 }
 await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic batch Worker','member','active')",[owner,`${owner}@example.invalid`]);
 const create=async()=>{
  const run=await enqueueRun(owner,{content:'Synthetic compiled batch receipt',requestKey:randomUUID(),attachments:[]},{model:'z-ai/glm-5.3:batch',providers:['fireworks'],version:'synthetic-worker'});
  await controlRun(owner,run.id,'cancel');
  const call=randomUUID(),reservation=randomUUID(),batch=randomUUID(),remote=`batch_${randomUUID()}`,custom=`turn-${call}`;
  await admin.query("insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status) values($1,$2,$3,'synthetic-batch','main_model','synthetic',$4,'{}','model','started')",[call,owner,run.id,digest({})]);
  await admin.query("insert into paid_call_reservation(id,user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,occupied_micros,status) values($1,$2,$3,'synthetic-batch','synthetic-only','fixture',100,100,'reserved')",[reservation,owner,run.id]);
  await admin.query("insert into agent_model_batch(id,user_id,run_id,call_id,reservation_id,model,provider,custom_id,remote_id,status) values($1,$2,$3,$4,$5,'z-ai/glm-5.3:batch','fireworks',$6,$7,'pending')",[batch,owner,run.id,call,reservation,custom,remote]);
  return {run:run.id,call,reservation,batch,remote,custom};
 };
 const normal=await create(),crash=await create();
 const response=(job:typeof normal)=>({id:job.remote,model:'z-ai/glm-5.3',endpoint:'/v1/chat/completions',status:'completed',request_counts:{total:1,completed:1,failed:0},
  usage:{prompt_tokens:20,completion_tokens:10,cost:0.000036},results:[{custom_id:job.custom,response:{status_code:200,body:{choices:[{message:{role:'assistant',content:'Synthetic compiled batch status'},finish_reason:'stop'}]}}}]});
 const keyPath=`/tmp/ma24-batch-${tag}.key`,certPath=`/tmp/ma24-batch-${tag}.crt`;
 await docker(['exec',dbContainer,'openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=openrouter.ai','-addext','subjectAltName=DNS:openrouter.ai','-keyout',keyPath,'-out',certPath]);
 const key=await docker(['exec',dbContainer,'cat',keyPath]),cert=await docker(['exec',dbContainer,'cat',certPath]);
 const code=await readFile(new URL('./lib/ma24-batch-status-stub.mjs',import.meta.url),'utf8');
 stub=await docker(['run','--detach','--name',`ma24-batch-status-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--entrypoint','node',metadata.id,'--input-type=module','-e',code]);assert.match(stub,/^[a-f0-9]{64}$/);
 await docker(['exec','--interactive',stub,'node','-e',"let parts=[];process.stdin.on('data',p=>parts.push(p));process.stdin.on('end',()=>require('fs').writeFileSync('/tmp/ma24-batch-stub-config.json',Buffer.concat(parts),{mode:0o600,flag:'wx'}));"],JSON.stringify({key,cert,jobs:{[normal.remote]:response(normal),[crash.remote]:response(crash)}}));
 let ready=false;for(let i=0;i<100;i++){if((await docker(['logs',stub])).includes('syntheticBatchTlsStatusReady')){ready=true;break;}await pause(100);}assert(ready);
 const address=await docker(['inspect','--format',`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,stub]);assert.match(address,/^\d+\.\d+\.\d+\.\d+$/);
 const volumeName=`ma24-batch-status-ca-${tag}`;assert.equal(await docker(['volume','create','--label','ma24-purpose=batch-status-ca-fixture',volumeName]),volumeName);volume=volumeName;
 // Only the public certificate enters this volume. The private key stays in tmpfs.
 await docker(['run','--rm','--interactive','--network','none','--read-only','--user','0:0','--cap-drop=ALL','--security-opt','no-new-privileges','--mount',`type=volume,source=${volume},target=/certificates`,'--entrypoint','node',metadata.id,'-e',
  "let parts=[];process.stdin.on('data',p=>parts.push(p));process.stdin.on('end',()=>require('fs').writeFileSync('/certificates/provider.crt',Buffer.concat(parts),{mode:0o644,flag:'wx'}));"],cert);
 const snapshot=async(job:typeof normal)=>(await admin.query(`select (select to_jsonb(r) from paid_call_reservation r where id=$1) reservation,
  (select to_jsonb(c) from agent_tool_call c where id=$2) call,(select to_jsonb(b) from agent_model_batch b where id=$3) batch,
  (select to_jsonb(r) from agent_run r where id=$4) run,(select count(*)::int from paid_cost_observation where reservation_id=$1) observations,
  (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from agent_run_event e where run_id=$4) events`,[job.reservation,job.call,job.batch,job.run])).rows[0];
 const start=async()=>{
  worker=await docker(['run','--detach','--name',`ma24-batch-worker-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--add-host',`openrouter.ai:${address}`,...(proxyAddress?['--add-host',`pilot-db:${proxyAddress}`]:[]),
   '--mount',`type=volume,source=${volume},target=/certificates,readonly`,'--env','NODE_EXTRA_CA_CERTS=/certificates/provider.crt',
   '--env',`DATABASE_URL=${runtime}`,'--env',`DATABASE_SSL_CA=${ca}`,'--env','OPENROUTER_BASE_URL=https://openrouter.ai:8443/api/v1','--env','OPENROUTER_API_KEY=synthetic-local-batch-key',
   '--env','LANGGRAPH_API_URL=http://127.0.0.1:1','--env','LANGCHAIN_TRACING_V2=false','--env','LANGSMITH_TRACING=false',metadata.id,'worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
 };
 const finish=async(expectedExit='0')=>{assert(worker);const exit=await docker(['wait',worker]),logs=await docker(['logs',worker]);assert.equal(exit,expectedExit,logs);if(expectedExit==='1')assert(logs.includes('"phase":"worker"'));await docker(['rm','--volumes',worker]);worker=undefined;};
 if(commitCheck)await control('/arm','POST');
 await start();await finish(commitCheck?'1':'0');const saved=await snapshot(normal);
 assert.equal(saved.batch.status,'completed');assert.equal(saved.call.status,'completed');assert.equal(saved.reservation.status,'reported');assert.equal(saved.observations,1);assert.equal(saved.run.status,'cancelled');
 const baseline=await snapshot(crash);
 let held:Awaited<ReturnType<typeof snapshot>>;
 if(commitCheck){
  const first=await control('/status');assert.equal(first.targetKind,'batch-settlement');assert.equal(first.targetCommitCommands,1);
  assert.equal(first.backendCommitCompletions,1);assert.equal(first.suppressedCommitCompletions,1);assert.equal(first.suppressedReadyForQuery,1);assert.equal(first.droppedCommitAcks,1);assert.equal(first.protocolFailures,0);
  await control('/arm-before-commit','POST');await start();await finish('1');
  const second=await control('/status');assert.equal(second.targetCommitCommands,2);assert.equal(second.blockedCommitCommands,1);assert.equal(second.blockedAfterSuccessfulBatchUpdate,1);assert.equal(second.protocolFailures,0);
  let active=1;for(let i=0;i<250&&active;i++){active=Number((await admin.query('select count(*) from pg_stat_activity where application_name=$1 and xact_start is not null',[appName])).rows[0].count);if(active)await pause(100);}assert.equal(active,0);
  held=await snapshot(crash);
  for(const field of ['reservation','call','run','observations','events'])assert.deepEqual(held[field],baseline[field]);
  const expectedBatch={...baseline.batch,poll_token:held.batch.poll_token,poll_lease_until:held.batch.poll_lease_until};assert.deepEqual(held.batch,expectedBatch);
 }else{
 await admin.query(`create function ${trigger}() returns trigger language plpgsql as $$begin
  if new.id='${crash.batch}'::uuid and new.status in('completed','failed') then perform pg_sleep(10);end if;return new;end$$;
 create trigger ${trigger} before update on agent_model_batch for each row execute function ${trigger}();`);
 await start();let observed=false;
 for(let i=0;i<300;i++){
  observed=(await admin.query("select exists(select 1 from pg_stat_activity where application_name=$1 and state='active' and wait_event='PgSleep' and query like '%update agent_model_batch set status%') ok",[appName])).rows[0].ok;
  if(observed)break;assert.equal(await docker(['inspect','--format','{{.State.Running}}',worker!]),'true','Worker ended before final batch wait');await pause(100);
 }
 assert(observed);held=await snapshot(crash);assert.equal(held.reservation.status,'reserved');assert.equal(held.call.output,null);assert.equal(held.observations,0);assert.equal(held.batch.status,'pending');
 assert(held.batch.poll_token&&held.batch.poll_lease_until);
 await docker(['kill','--signal','KILL',worker!]);assert.equal(await docker(['wait',worker!]),'137');await docker(['rm','--volumes',worker!]);worker=undefined;
 let active=1;for(let i=0;i<250&&active;i++){active=Number((await admin.query('select count(*) from pg_stat_activity where application_name=$1 and xact_start is not null',[appName])).rows[0].count);if(active)await pause(100);}assert.equal(active,0);
 assert.deepEqual(await snapshot(crash),held);assert.deepEqual(await snapshot(normal),saved);
 await admin.query(`drop trigger ${trigger} on agent_model_batch;drop function ${trigger}();`);
 }
 assert(held.batch.poll_token&&held.batch.poll_lease_until);assert.deepEqual(await snapshot(normal),saved);
 let expired=false;for(let i=0;i<1000;i++){expired=(await admin.query('select poll_lease_until<=clock_timestamp() expired from agent_model_batch where id=$1',[crash.batch])).rows[0].expired;if(expired)break;await pause(100);}assert(expired);
 await start();await finish();const recovered=await snapshot(crash);
 assert.equal(recovered.batch.status,'completed');assert.notEqual(recovered.batch.poll_token,held.batch.poll_token);assert.equal(recovered.reservation.status,'reported');assert.equal(recovered.observations,1);assert.equal(recovered.call.status,'completed');assert.equal(recovered.run.status,'cancelled');
 await start();await finish();assert.deepEqual(await snapshot(normal),saved);assert.deepEqual(await snapshot(crash),recovered);
 const stats=JSON.parse(await docker(['exec',stub,'node','--input-type=module','-e',"console.log(await (await fetch('http://127.0.0.1:8444/status')).text());"]));
 assert.equal(stats.statusGetRequests,3);assert.equal(stats.byId[normal.remote],1);assert.equal(stats.byId[crash.remote],2);
 assert.equal(stats.inferencePosts,0);assert.equal(stats.nonStatusRequests,0);assert.equal(stats.authenticationFailures,0);
 receipt={...(commitCheck?{batchWorkerCommit:'passed',actualPostgresCommitAcknowledgmentLost:true,committedReceiptKept:true,successfulBatchUpdateBeforeBlockedCommit:true,unforwardedCommitRolledBack:true,finalProxyStats:await control('/status')}
   :{batchWorkerCrash:'passed',actualFinalBatchUpdateWait:true,actualSigkillExitCode:137}),image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,archivedBatchSourceSha256:sourceSha256,compiledWorkerSha256:measured.worker,
  localSyntheticHttpsStatus:true,gatewayValidationUnchanged:true,tlsVerificationEnabled:true,normalReceiptSaved:true,
  uncommittedReceiptSnapshotRolledBack:true,noActiveTransactionAfterFailure:true,
  originalPollLeaseUnchanged:true,recoveredAfterActual90SecondLease:true,newPollToken:true,oneCostObservationPerBatch:true,
  cancelledTasksNotResumed:true,subsequentWorkerExactRowsUnchanged:true,syntheticStatusGets:stats.statusGetRequests,inferencePosts:0,realProviderCalls:0,syntheticReservationAndJobRows:true};
}finally{
 try{if(worker)await docker(['rm','--force','--volumes',worker]);}finally{
  try{if(proxy)await docker(['rm','--force','--volumes',proxy]);}finally{
  try{if(stub)await docker(['rm','--force','--volumes',stub]);}finally{
   try{if(volume){assert.equal(await docker(['volume','inspect','--format','{{index .Labels "ma24-purpose"}}',volume]),'batch-status-ca-fixture');await docker(['volume','rm',volume]);}}finally{
    await getPool().end();try{
     await admin.query(`drop trigger if exists ${trigger} on agent_model_batch;drop function if exists ${trigger}();`);
     for(const table of ['agent_model_batch','agent_run_event','agent_tool_call','agent_run','assistant_message','assistant_conversation','paid_cost_observation','paid_call_reservation'])await admin.query(`delete from ${table} where user_id=$1`,[owner]);
     await admin.query('delete from app_user where id=$1',[owner]);
    }finally{await admin.end();}
   }
  }
  }
 }
}
console.log(JSON.stringify({...receipt,fixtureRowsWorkersStatusServiceAndCertificateVolumeCleaned:true,commitProxyCleaned:commitCheck}));
