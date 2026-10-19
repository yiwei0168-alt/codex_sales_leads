import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Client} from 'pg';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {getPool} from '../src/lib/rag/db';
import {enqueueRun} from '../src/lib/assistant/main/repository';
import {buildMainAgentGraph} from '../src/lib/assistant/main/graph';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {digest,result,type ModelMessage} from '../src/lib/assistant/main/contracts';
import {SOURCE_CHANGED_REPLY} from '../src/lib/assistant/main/knowledge-message-guard';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();assert.equal(process.env.MA24_DISPOSABLE_MAIN_RUNTIME,'1');
const image=process.env.MA24_MAIN_RUNTIME_IMAGE!,network=process.env.MA24_MAIN_RUNTIME_NETWORK!,runtimeUrl=process.env.MA24_MAIN_RUNTIME_DATABASE_URL!,ca=process.env.MA24_MAIN_RUNTIME_DATABASE_CA!;
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);
const url=process.env.DATABASE_MIGRATION_URL!,appUrl=process.env.DATABASE_URL!;
assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).host+new URL(url).pathname,new URL(appUrl).host+new URL(appUrl).pathname);
assert.equal(new URL(runtimeUrl).hostname,'pilot-db');assert.equal(new URL(runtimeUrl).searchParams.get('sslmode'),'verify-full');
const admin=new Client({connectionString:url});await admin.connect();
const redact=(text:string)=>[url,appUrl,runtimeUrl].reduce((value,connection)=>value.replaceAll(new URL(connection).password,'<temporary-password>'),text);
const docker=(args:string[],input?:string)=>new Promise<{code:number|null;output:string}>((done,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});let output='';
 child.stdout!.on('data',chunk=>output=redact(output+String(chunk)).slice(-30000));child.stderr!.on('data',chunk=>output=redact(output+String(chunk)).slice(-30000));
 if(input!==undefined){child.stdin!.on('error',reject);child.stdin!.end(input);}
 child.on('error',reject);child.on('exit',code=>done({code,output}));
});
const execute=async(args:string[])=>{const value=await docker(args);assert.equal(value.code,0,value.output);return value.output.trim();};
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=64m'];
const environment=['--env',`DATABASE_URL=${runtimeUrl}`,'--env',`DATABASE_SSL_CA=${ca}`,'--env','LANGCHAIN_TRACING_V2=false','--env','LANGSMITH_TRACING=false'];
const durability=process.env.MA24_MAIN_RUNTIME_DURABILITY==='1';
const commitLoss=process.env.MA24_MAIN_RUNTIME_COMMIT_LOSS==='1';
let server:string|undefined,worker:string|undefined,volume:string|undefined,proxy:string|undefined,pgProxy:string|undefined;
let proxyAddress:string|undefined,serverRuntimeUrl=runtimeUrl;
const api=async(container:string,path:string,method='GET',body?:unknown,port=2024)=>{
 assert.match(path,/^\/[a-zA-Z0-9_/-]+$/);
 // This is a literal Node argv, not shell text; request data never enters a shell.
 const code=`const r=await fetch('http://127.0.0.1:${port}${path}',{method:${JSON.stringify(method)},headers:{'content-type':'application/json'},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}});if(!r.ok)throw new Error('Fixture API status '+r.status);console.log(JSON.stringify(await r.json()));`;
 return JSON.parse(await execute(['exec',container,'node','--input-type=module','-e',code]));
};
try{
 assert.equal(Number((await admin.query('select count(*) n from agent_run')).rows[0].n),0,'Compiled queue test requires a pristine task table');
 const metadata=JSON.parse(await execute(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await execute(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const injected=await docker(['run','--rm','--network','none',...restricted,'--env','NODE_OPTIONS=--trace-warnings',metadata.id,'--verify']);assert.notEqual(injected.code,0);
 if(durability){
  const name=`ma24-main-state-${randomUUID()}`;assert.notEqual((await docker(['volume','inspect',name])).code,0);
  assert.equal(await execute(['volume','create','--label','ma24-purpose=main-runtime-verification',name]),name);volume=name;
 }
 if(commitLoss){
  const databaseContainer=process.env.MA24_MAIN_RUNTIME_DATABASE_CONTAINER!;assert.match(databaseContainer,/^[a-f0-9]{64}$/);
  const code=await readFile(new URL('./lib/ma24-pg-commit-ack-proxy.mjs',import.meta.url),'utf8');
  pgProxy=await execute(['run','--detach','--name',`ma24-pg-commit-proxy-${randomUUID().slice(0,8)}`,'--network',network,...restricted,
   '--entrypoint','node',metadata.id,'--input-type=module','-e',code]);assert.match(pgProxy,/^[a-f0-9]{64}$/);
  // Transient fixture key goes directly from the disposable DB process to a
  // same-UID tmpfs file via stdin; no argv/env/log/host file contains the key.
  const key=await execute(['exec',databaseContainer,'cat','/tmp/ma24-server.key']);
  const supplied=await docker(['exec','--interactive',pgProxy,'node','-e',
   "let chunks=[];process.stdin.on('data',chunk=>chunks.push(chunk));process.stdin.on('end',()=>require('node:fs').writeFileSync('/tmp/ma24-pg-proxy-config.json',Buffer.concat(chunks),{mode:0o600,flag:'wx'}));"],JSON.stringify({key,cert:ca}));
  assert.equal(supplied.code,0,supplied.output);
  let ready=false;for(let n=0;n<80;n++){
   const logs=await execute(['logs',pgProxy]);if(logs.includes('disposableCommitProxyReady')){ready=true;break;}
   if((await execute(['inspect','--format','{{.State.Running}}',pgProxy]))!=='true')throw new Error('Commit proxy stopped before readiness');
   await new Promise(done=>setTimeout(done,100));
  }
  assert(ready,'Commit proxy did not start');
  proxyAddress=await execute(['inspect','--format',`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,pgProxy]);assert.match(proxyAddress,/^\d+\.\d+\.\d+\.\d+$/);
  const proxied=new URL(runtimeUrl);proxied.port='5540';serverRuntimeUrl=proxied.toString();
 }
 const startServer=async()=>{
 server=await execute(['run','--detach','--name',`ma24-main-runtime-${randomUUID().slice(0,8)}`,'--network',network,...restricted,
  ...(volume?['--mount',`type=volume,source=${volume},target=/runtime`]:['--tmpfs','/runtime:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m']),
  ...(proxyAddress?['--add-host',`pilot-db:${proxyAddress}`]:[]),...environment,'--env',`DATABASE_URL=${serverRuntimeUrl}`,metadata.id,'server']);assert.match(server,/^[a-f0-9]{64}$/);
 let ready=false;for(let i=0;i<120;i++){
  const logs=await execute(['logs',server]);if(logs.includes('"mainAgentApi":"ready"')){ready=true;break;}
  if((await execute(['inspect','--format','{{.State.Running}}',server]))!=='true')throw new Error('Main runtime exited before readiness: '+logs);
  await new Promise(done=>setTimeout(done,500));
 }
 assert(ready,'Actual LangGraph API did not become ready');
 };
 const stopServer=async()=>{assert(server);await execute(['stop','--time','15',server]);assert.equal(await execute(['inspect','--format','{{.State.ExitCode}}',server]),'0','API must flush and exit normally');await execute(['rm','--volumes',server]);server=undefined;};
 await startServer();
 const owner=randomUUID(),sourceOwner=randomUUID(),document=randomUUID(),chunk=randomUUID(),content='Synthetic compiled worker source',hash=createHash('sha256').update(content).digest('hex');
 for(const id of [owner,sourceOwner])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic runtime','member','active')",[id,`${id}@example.invalid`]);
 await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic runtime source','text',$2,$3,'shared')`,[document,hash,sourceOwner]);
 await admin.query('insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256) values($1,$2,0,$3,10,$4)',[chunk,document,content,hash]);
 const cases=[];
 const prepareTask=async()=>{
  const task=await enqueueRun(owner,{content:'Synthetic compiled recovery',attachments:[],knowledgeScope:['product'],requestKey:randomUUID()},{model:'synthetic-unusable',providers:['synthetic-unusable'],version:'synthetic'});
  const callId=randomUUID(),callKey=randomUUID(),input={query:'Synthetic runtime source',collections:['product']},output=result([{id:chunk,documentId:document,content}],{callId}),reply=`Synthetic checkpoint answer ${randomUUID()}`;
  await admin.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
   values($1,$2,$3,$4,'knowledge_search','1',$5,$6,'read','completed',$7)`,[callId,owner,task.id,callKey,JSON.stringify(input),digest(input),JSON.stringify(output)]);
  const messages:ModelMessage[]=[{role:'user',content:'Synthetic compiled recovery'},{role:'assistant',content:null,tool_calls:[{id:callKey,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'knowledge_search',arguments:input})}}]},
   {role:'tool',tool_call_id:callKey,content:JSON.stringify(output)}];
  const policyRevision=digest(await loadDecisionMemory(owner));
  const seed=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[],policyRevision}),model:async()=>({role:'assistant',content:reply}),tool:async()=>{throw new Error('No synthetic action expected');}},new PostgresSaver(getPool(),undefined,{schema:'langgraph'}));
  assert.equal((await seed.invoke({messages,pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[]},{configurable:{thread_id:`main-agent:${owner}:${task.id}`,checkpoint_ns:''},recursionLimit:40})).status,'completed');
  return {task,reply};
 };
 const startWorker=async(apiPort=2024)=>{
  // container:server shares its host mapping too; use the same TLS proxy port.
  worker=await execute(['run','--detach','--name',`ma24-main-worker-${randomUUID().slice(0,8)}`,'--network',`container:${server}`,...restricted,...environment,
   '--env',`DATABASE_URL=${serverRuntimeUrl}`,'--env',`LANGGRAPH_API_URL=http://127.0.0.1:${apiPort}`,metadata.id,'worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
 };
 const finishWorker=async()=>{assert(worker);const exit=await execute(['wait',worker]),logs=await execute(['logs',worker]);assert.equal(exit,'0',logs);await execute(['rm','--volumes',worker]);worker=undefined;return logs;};
 const readTask=async(runId:string)=>(await admin.query<{status:string;reply:string;lease_token:string;messages:string[];jobs:number;models:number;status_events:number}>(`select r.status,r.result->>'reply' reply,r.lease_token,
   coalesce((select array_agg(content order by created_at) from assistant_message where user_id=r.user_id and metadata->>'runId'=r.id::text and role='assistant'),'{}') messages,
   (select count(*)::integer from agent_memory_extraction_job where owner_id=r.user_id and run_id=r.id) jobs,
   (select count(*)::integer from agent_tool_call where user_id=r.user_id and run_id=r.id and tool_id='main_model') models,
   (select count(*)::integer from agent_run_event where user_id=r.user_id and run_id=r.id and kind='status') status_events from agent_run r where r.id=$1`,[runId])).rows[0];
 const completedTasks:Array<{id:string;row:Awaited<ReturnType<typeof readTask>>}>=[];
 for(const withdraw of [false,true]){
  const {task,reply}=await prepareTask();
  if(withdraw)await admin.query("update knowledge_document set visibility='private' where id=$1",[document]);
  await startWorker();const logs=await finishWorker(),row=await readTask(task.id);
  assert.equal(row.status,withdraw?'partial':'completed',redact(JSON.stringify({row,logs,serverLogs:await execute(['logs',server!])})));
  assert.equal(row.reply,withdraw?SOURCE_CHANGED_REPLY:reply);assert.deepEqual(row.messages,[row.reply]);assert.equal(row.jobs,withdraw?0:1);assert.equal(row.models,0);assert(row.lease_token,'Worker must claim the task');
  cases.push({sourceWithdrawn:withdraw,status:row.status,modelAttempts:row.models,extractionJobs:row.jobs,actualClaimedLease:true});
  completedTasks.push({id:task.id,row});
 }
 let commitLossResult:unknown=null;
 if(commitLoss){
  assert(pgProxy);await admin.query("update knowledge_document set visibility='shared' where id=$1",[document]);
  const {task,reply}=await prepareTask();
  assert.equal((await api(pgProxy,'/arm','POST',{},5541)).armed,true);
  await startWorker();await finishWorker();const committed=await readTask(task.id);
  assert.equal(committed.status,'completed');assert.equal(committed.reply,reply);assert.deepEqual(committed.messages,[reply]);
  assert.equal(committed.jobs,1);assert.equal(committed.models,0);assert.equal(committed.status_events,1);assert(committed.lease_token);
  const stats=await api(pgProxy,'/status','GET',undefined,5541);
  assert.equal(stats.targetCommitCommands,1);assert.equal(stats.backendCommitCompletions,1);
  assert.equal(stats.suppressedCommitCompletions,1);assert.equal(stats.suppressedReadyForQuery,1);assert.equal(stats.droppedCommitAcks,1);
  assert.equal(stats.protocolFailures,0);assert(stats.downstreamTlsConnections>0);assert(stats.verifiedUpstreamTlsConnections>0);
  await startWorker();await finishWorker();assert.deepEqual(await readTask(task.id),committed);
  assert.equal((await api(pgProxy,'/status','GET',undefined,5541)).droppedCommitAcks,1);
  commitLossResult={...stats,actualPostgresCommitAcknowledgmentLost:true,committedTaskRetained:true,noDuplicateReplyEventOrExtractionJob:true,
   subsequentWorkerMakesNoReplay:true,originalSourceRevalidated:true,actualQueueLeaseClaimed:true};
 }
 let durabilityResult:unknown=null;
 if(durability){
  assert(volume&&server);const threadId=randomUUID(),marker=randomUUID();
  await api(server,'/threads','POST',{thread_id:threadId,metadata:{synthetic_marker:marker}});
  const before=await api(server,`/threads/${threadId}`);assert.equal(before.metadata.synthetic_marker,marker);
  const oldServer=server;await stopServer();
  const stateInspection=JSON.parse(await execute(['run','--rm','--network','none',...restricted,'--mount',`type=volume,source=${volume},target=/runtime,readonly`,'--entrypoint','node',metadata.id,'-e',
   "const fs=require('node:fs'),c=require('node:crypto'),s=fs.statSync('/runtime');const files=fs.readdirSync('/runtime/.langgraph_api').sort().map(name=>({name,sha256:c.createHash('sha256').update(fs.readFileSync('/runtime/.langgraph_api/'+name)).digest('hex')}));console.log(JSON.stringify({uid:s.uid,mode:s.mode&511,files}));"]));
  assert.equal(stateInspection.uid,1000);assert.equal(stateInspection.mode,448);assert(stateInspection.files.length>=3);
  await startServer();assert.notEqual(server,oldServer);assert.deepEqual(await api(server!,`/threads/${threadId}`),before);
  for(const saved of completedTasks)assert.deepEqual(await readTask(saved.id),saved.row);
  await admin.query("update knowledge_document set visibility='shared' where id=$1",[document]);
  const {task,reply}=await prepareTask();
  // A local forwarding proxy executes the real API request but withholds its
  // response until the observer sees the authoritative task commit.
  const proxyCode=String.raw`const http=require('node:http');let pending,forwarded=0;
   http.createServer((req,res)=>{
    if(req.url==='/_control/status'){res.end(JSON.stringify({forwarded,pending:Boolean(pending)}));return;}
    if(req.url==='/_control/drop'){const dropped=Boolean(pending);pending?.destroy();pending=undefined;res.end(JSON.stringify({dropped,forwarded}));return;}
    forwarded++;pending=res;const up=http.request({hostname:'127.0.0.1',port:2024,path:req.url,method:req.method,headers:req.headers},response=>response.resume());
    up.on('error',()=>res.destroy());req.pipe(up);
   }).listen(2025,'127.0.0.1',()=>console.log('ackProxyReady'));`;
  proxy=await execute(['run','--detach','--name',`ma24-main-ack-proxy-${randomUUID().slice(0,8)}`,'--network',`container:${server}`,...restricted,'--entrypoint','node',metadata.id,'-e',proxyCode]);assert.match(proxy,/^[a-f0-9]{64}$/);
  for(let i=0;i<40;i++){if((await execute(['logs',proxy])).includes('ackProxyReady'))break;await new Promise(done=>setTimeout(done,100));}
  await startWorker(2025);
  let committed=false;for(let i=0;i<300;i++){if((await readTask(task.id)).status==='completed'){committed=true;break;}await new Promise(done=>setTimeout(done,100));}
  assert(committed,'Real API did not complete the task while response was withheld');
  const held=await api(proxy,'/_control/status','GET',undefined,2025);assert.deepEqual(held,{forwarded:1,pending:true});
  assert.equal((await api(proxy,'/_control/drop','POST',{},2025)).dropped,true);await finishWorker();
  const afterLoss=await readTask(task.id);assert.equal(afterLoss.status,'completed');assert.equal(afterLoss.reply,reply);assert.deepEqual(afterLoss.messages,[reply]);assert.equal(afterLoss.jobs,1);assert.equal(afterLoss.models,0);assert.equal(afterLoss.status_events,1);
  await startWorker(2025);await finishWorker();assert.deepEqual(await readTask(task.id),afterLoss);
  assert.equal((await api(proxy,'/_control/status','GET',undefined,2025)).forwarded,1);
  await execute(['rm','--force','--volumes',proxy]);proxy=undefined;
  await stopServer();
  durabilityResult={namedVolumeUid:stateInspection.uid,namedVolumeMode:stateInspection.mode,stateFiles:stateInspection.files,actualThreadReadbackAfterContainerReplacement:true,
   priorTaskRowsUnchangedAfterRestart:true,gracefulApiExitCode:0,committedTaskSurvivesLostHttpResponse:true,noDuplicateReplyEventOrExtractionJob:true,subsequentWorkerMakesNoReplayRequest:true,forwardedApiRequests:1};
 }
 const receipt={passed:true,image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,actualLangGraphApi:true,actualCompiledQueueWorker:true,postgresCheckpointRecovery:true,cases,
  durabilityResult,commitLossResult,syntheticCheckpointSeed:true,actualModelCalls:0,externalActions:0,firstModelExecutionVerified:false,productionQualified:false,automaticActivation:false};
 await writeFile('tmp/ma24-main-runtime-worker-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({mainRuntimeWorker:'passed',...receipt}));
}finally{
 if(worker)await docker(['rm','--force','--volumes',worker]);
 if(proxy)await docker(['rm','--force','--volumes',proxy]);
 if(server){await docker(['stop','--time','10',server]);await docker(['rm','--force','--volumes',server]);}
 if(pgProxy)await docker(['rm','--force','--volumes',pgProxy]);
 if(volume){assert.equal(await execute(['volume','inspect','--format','{{index .Labels "ma24-purpose"}}',volume]),'main-runtime-verification');await execute(['volume','rm',volume]);}
 await Promise.allSettled([admin.end(),getPool().end()]);
}
