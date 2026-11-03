import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {Client} from 'pg';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {getPool} from '../src/lib/rag/db';
import {enqueueRun} from '../src/lib/assistant/main/repository';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {initialTaskMessages} from '../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {digest,result} from '../src/lib/assistant/main/contracts';

assert.equal(process.env.MA24_DISPOSABLE_NATIVE_MAIN,'1');
const app=new URL(process.env.DATABASE_URL!),migration=new URL(process.env.DATABASE_MIGRATION_URL!);
assert.equal(app.host+app.pathname,migration.host+migration.pathname);
assert(['127.0.0.1','localhost'].includes(app.hostname));assert.match(app.pathname,/^\/ma24_main_[a-f0-9]{12}$/);
const api=new URL(process.env.LANGGRAPH_API_URL!);assert.equal(api.protocol,'http:');assert(['127.0.0.1','localhost'].includes(api.hostname));
const workspace=resolve(process.env.MA24_NATIVE_WORKSPACE!),worker=resolve(process.env.MA24_NATIVE_WORKER_ENTRY!);
const suffix=relative(workspace,worker);assert(suffix&&!suffix.startsWith('..')&&!isAbsolute(suffix));
const workerHash=createHash('sha256').update(await readFile(worker)).digest('hex');assert.equal(workerHash,process.env.MA24_NATIVE_WORKER_SHA256);
const c=new Client({connectionString:migration.toString()});await c.connect();
const owner=randomUUID();
async function runWorker(){
 const env:NodeJS.ProcessEnv={NODE_ENV:'production'};for(const name of ['SystemRoot','WINDIR','PATH','PATHEXT','COMSPEC','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
 Object.assign(env,{DATABASE_URL:app.toString(),LANGGRAPH_API_URL:api.toString(),NODE_ENV:'production',LANGSMITH_TRACING:'false',LANGCHAIN_TRACING_V2:'false'});
 const child=spawn(process.execPath,['--require',resolve(workspace,'scripts/patch-node-user.cjs'),'--import',process.env.MA24_NATIVE_NETWORK_PRELOAD!,worker,'--once'],{cwd:process.env.MA24_NATIVE_CWD!,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const done=new Promise<number|null>((accept,reject)=>{child.once('error',reject);child.once('exit',accept);});const timeout=setTimeout(()=>child.kill(),30000);
 try{assert.equal(await done,0,output);assert(!/"mainAgentRecovery"|"mainAgentPolling"/.test(output),output);return output;}finally{clearTimeout(timeout);if(child.exitCode===null&&child.signalCode===null)child.kill();await done;}
}
try{
 assert.equal(Number((await c.query('select count(*) as n from agent_run')).rows[0].n),0);
 await c.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic main candidate','!','member','active')",[owner,owner+'@example.invalid']);
 const config=modeModelConfig('standard');assert(config.profile);
 const task=await enqueueRun(owner,{content:'Synthetic saved receipt lifecycle',attachments:[],requestKey:randomUUID(),mode:'standard'},config);
 const thread=`main-agent:${owner}:${task.id}`;
 assert.equal(Number((await c.query('select count(*) as n from langgraph.checkpoints where thread_id=$1',[thread])).rows[0].n),0);
 const initial=initialTaskMessages({userId:owner,role:'member',mode:'standard'},task.input,config,[]);
 const messages=[initial[0],decisionMemoryMessage(await loadDecisionMemory(owner)),...initial.slice(1)];
 const input={messages,profile:config.profile,index:0},callId=randomUUID(),reply='Synthetic retained answer '+randomUUID();
 const saved=result({value:{message:{role:'assistant',content:reply},provider:'synthetic-saved-model',generationId:'synthetic-not-provider-attestation'}});
 await c.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
  values($1,$2,$3,'mode-model:0:0:0','main_model',$4,$5,$6,'model','completed',$7)`,[callId,owner,task.id,config.profile.version,input,digest(input),saved]);
 const snapshot=()=>c.query('select to_jsonb(t) as row from agent_tool_call t where id=$1',[callId]).then(r=>r.rows[0].row);
 const before=await snapshot();
 await runWorker();
 const read=async()=>(await c.query(`select r.status,r.result->>'reply' as reply,
  (select count(*)::int from assistant_message m where m.user_id=r.user_id and m.metadata->>'runId'=r.id::text and m.role='assistant') as replies,
  (select count(*)::int from agent_memory_extraction_job j where j.owner_id=r.user_id and j.run_id=r.id) as extraction_jobs,
  (select count(*)::int from agent_tool_call t where t.user_id=r.user_id and t.run_id=r.id and t.tool_id='main_model') as models,
  (select count(*)::int from agent_run_event e where e.user_id=r.user_id and e.run_id=r.id and e.kind='model_attempt') as new_model_attempts
  from agent_run r where r.id=$1 and r.user_id=$2`,[task.id,owner])).rows[0];
 const finished=await read();assert.equal(finished.status,'completed');assert.equal(finished.reply,reply);assert.equal(finished.replies,1);assert.equal(finished.extraction_jobs,1);assert.equal(finished.models,1);assert.equal(finished.new_model_attempts,0);assert.deepEqual(await snapshot(),before);
 const checkpoint=await new PostgresSaver(getPool(),undefined,{schema:'langgraph'}).getTuple({configurable:{thread_id:thread,checkpoint_ns:''}});
 assert(checkpoint);assert.equal(checkpoint.checkpoint.channel_values.status,'completed');assert.equal(checkpoint.checkpoint.channel_values.reply,reply);
 await runWorker();assert.deepEqual(await read(),finished);assert.deepEqual(await snapshot(),before);
 console.log(JSON.stringify({nativeMainReceiptRecovery:'passed',workerHash,actualCompiledApiAndWorker:true,emptyCheckpointInitially:true,retainedReplyCommittedOnce:true,extractionQueuedOnce:true,savedModelRowUnchanged:true,newModelAttempts:0,subsequentEmptyWorkerNoReplay:true,syntheticReceipt:true,actualModelCalls:0,extractionWorkerExecuted:false,providerExecutionVerified:false,qualityAccepted:false}));
}finally{await c.end();await getPool().end();}
