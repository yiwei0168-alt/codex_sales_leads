import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
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
const docker=(args:string[])=>new Promise<{code:number|null;output:string}>((done,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',chunk=>output=redact(output+String(chunk)).slice(-30000));child.stderr.on('data',chunk=>output=redact(output+String(chunk)).slice(-30000));
 child.on('error',reject);child.on('exit',code=>done({code,output}));
});
const execute=async(args:string[])=>{const value=await docker(args);assert.equal(value.code,0,value.output);return value.output.trim();};
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=64m'];
const environment=['--env',`DATABASE_URL=${runtimeUrl}`,'--env',`DATABASE_SSL_CA=${ca}`,'--env','LANGCHAIN_TRACING_V2=false','--env','LANGSMITH_TRACING=false'];
let server:string|undefined,worker:string|undefined;
try{
 assert.equal(Number((await admin.query('select count(*) n from agent_run')).rows[0].n),0,'Compiled queue test requires a pristine task table');
 const metadata=JSON.parse(await execute(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await execute(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const injected=await docker(['run','--rm','--network','none',...restricted,'--env','NODE_OPTIONS=--trace-warnings',metadata.id,'--verify']);assert.notEqual(injected.code,0);
 server=await execute(['run','--detach','--name',`ma24-main-runtime-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--tmpfs','/runtime:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m',...environment,metadata.id,'server']);assert.match(server,/^[a-f0-9]{64}$/);
 let ready=false;for(let i=0;i<120;i++){
  const logs=await execute(['logs',server]);if(logs.includes('"mainAgentApi":"ready"')){ready=true;break;}
  if((await execute(['inspect','--format','{{.State.Running}}',server]))!=='true')throw new Error('Main runtime exited before readiness: '+logs);
  await new Promise(done=>setTimeout(done,500));
 }
 assert(ready,'Actual LangGraph API did not become ready');
 const owner=randomUUID(),sourceOwner=randomUUID(),document=randomUUID(),chunk=randomUUID(),content='Synthetic compiled worker source',hash=createHash('sha256').update(content).digest('hex');
 for(const id of [owner,sourceOwner])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic runtime','member','active')",[id,`${id}@example.invalid`]);
 await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic runtime source','text',$2,$3,'shared')`,[document,hash,sourceOwner]);
 await admin.query('insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256) values($1,$2,0,$3,10,$4)',[chunk,document,content,hash]);
 const cases=[];
 for(const withdraw of [false,true]){
  const task=await enqueueRun(owner,{content:'Synthetic compiled recovery',attachments:[],knowledgeScope:['product'],requestKey:randomUUID()},{model:'synthetic-unusable',providers:['synthetic-unusable'],version:'synthetic'});
  const callId=randomUUID(),callKey=randomUUID(),input={query:'Synthetic runtime source',collections:['product']},output=result([{id:chunk,documentId:document,content}],{callId}),reply=`Synthetic checkpoint answer ${randomUUID()}`;
  await admin.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
   values($1,$2,$3,$4,'knowledge_search','1',$5,$6,'read','completed',$7)`,[callId,owner,task.id,callKey,JSON.stringify(input),digest(input),JSON.stringify(output)]);
  const messages:ModelMessage[]=[{role:'user',content:'Synthetic compiled recovery'},{role:'assistant',content:null,tool_calls:[{id:callKey,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'knowledge_search',arguments:input})}}]},
   {role:'tool',tool_call_id:callKey,content:JSON.stringify(output)}];
  const policyRevision=digest(await loadDecisionMemory(owner));
  const seed=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[],policyRevision}),model:async()=>({role:'assistant',content:reply}),tool:async()=>{throw new Error('No synthetic action expected');}},new PostgresSaver(getPool(),undefined,{schema:'langgraph'}));
  assert.equal((await seed.invoke({messages,pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[]},{configurable:{thread_id:`main-agent:${owner}:${task.id}`,checkpoint_ns:''},recursionLimit:40})).status,'completed');
  if(withdraw)await admin.query("update knowledge_document set visibility='private' where id=$1",[document]);
  worker=await execute(['run','--detach','--name',`ma24-main-worker-${randomUUID().slice(0,8)}`,'--network',`container:${server}`,...restricted,...environment,'--env','LANGGRAPH_API_URL=http://127.0.0.1:2024',metadata.id,'worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
  const exit=await execute(['wait',worker]),logs=await execute(['logs',worker]);assert.equal(exit,'0',logs);
  const row=(await admin.query<{status:string;reply:string;lease_token:string;messages:string[];jobs:number;models:number}>(`select r.status,r.result->>'reply' reply,r.lease_token,
   coalesce((select array_agg(content) from assistant_message where user_id=r.user_id and metadata->>'runId'=r.id::text and role='assistant'),'{}') messages,
   (select count(*)::integer from agent_memory_extraction_job where owner_id=r.user_id and run_id=r.id) jobs,
   (select count(*)::integer from agent_tool_call where user_id=r.user_id and run_id=r.id and tool_id='main_model') models from agent_run r where r.id=$1`,[task.id])).rows[0];
  assert.equal(row.status,withdraw?'partial':'completed',redact(JSON.stringify({row,logs,serverLogs:await execute(['logs',server])})));
  assert.equal(row.reply,withdraw?SOURCE_CHANGED_REPLY:reply);assert.deepEqual(row.messages,[row.reply]);assert.equal(row.jobs,withdraw?0:1);assert.equal(row.models,0);assert(row.lease_token,'Worker must claim the task');
  cases.push({sourceWithdrawn:withdraw,status:row.status,modelAttempts:row.models,extractionJobs:row.jobs,actualClaimedLease:true});
  await execute(['rm','--force','--volumes',worker]);worker=undefined;
 }
 const receipt={passed:true,image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,actualLangGraphApi:true,actualCompiledQueueWorker:true,postgresCheckpointRecovery:true,cases,
  syntheticCheckpointSeed:true,actualModelCalls:0,externalActions:0,firstModelExecutionVerified:false,productionQualified:false,automaticActivation:false};
 await writeFile('tmp/ma24-main-runtime-worker-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({mainRuntimeWorker:'passed',...receipt}));
}finally{
 if(worker)await docker(['rm','--force','--volumes',worker]);
 if(server){await docker(['stop','--time','10',server]);await docker(['rm','--force','--volumes',server]);}
 await Promise.allSettled([admin.end(),getPool().end()]);
}
