import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Client} from 'pg';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {getPool} from '../src/lib/rag/db';
import {enqueueRun,LeaseLostError} from '../src/lib/assistant/main/repository';
import {settleMainAgentRun} from '../src/lib/assistant/main/final-main-agent-settlement';
import {assertCurrentKnowledgeMessages,SOURCE_CHANGED_REPLY} from '../src/lib/assistant/main/knowledge-message-guard';
import {MEMORY_CHANGED_REPLY} from '../src/lib/assistant/main/memory-message-guard';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {digest,result,type ModelMessage} from '../src/lib/assistant/main/contracts';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import {buildMainAgentGraph,executeMainAgentRun} from '../src/lib/assistant/main/graph';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();assert.equal(process.env.MA24_DISPOSABLE_FINAL_SETTLEMENT,'1');
const url=process.env.DATABASE_MIGRATION_URL!,appUrl=process.env.DATABASE_URL!;
assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).host+new URL(url).pathname,new URL(appUrl).host+new URL(appUrl).pathname);
const admin=new Client({connectionString:url}),blocker=new Client({connectionString:url}),writer=new Client({connectionString:url}),observer=new Client({connectionString:url});
await Promise.all([admin.connect(),blocker.connect(),writer.connect(),observer.connect()]);
const owner=randomUUID(),peer=randomUUID(),document=randomUUID(),chunk=randomUUID(),content='Synthetic original final-settlement evidence',hash=createHash('sha256').update(content).digest('hex');
const results:string[]=[];
const wait=async(test:()=>Promise<boolean>,message:string)=>{for(let i=0;i<500;i++){if(await test())return;await new Promise(done=>setTimeout(done,20));}throw new Error(message);};
const setup=async(seconds=120)=>{
 const task=await enqueueRun(owner,{content:'Synthetic final persistence',attachments:[],knowledgeScope:['product'],requestKey:randomUUID()},{model:'synthetic',providers:['synthetic'],version:'synthetic'});
 const token=randomUUID(),callId=randomUUID(),callKey=randomUUID(),input={query:'Synthetic evidence',collections:['product']},output=result([{id:chunk,documentId:document,content}],{callId});
 await admin.query("update agent_run set status='running',lease_token=$2,lease_until=clock_timestamp()+($3*interval '1 second') where id=$1",[task.id,token,seconds]);
 await admin.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
  values($1,$2,$3,$4,'knowledge_search','1',$5,$6,'read','completed',$7)`,[callId,owner,task.id,callKey,JSON.stringify(input),digest(input),JSON.stringify(output)]);
 const reply=`Synthetic generated answer ${randomUUID()}`;
 const messages:ModelMessage[]=[{role:'user',content:'Synthetic final persistence'},
  {role:'assistant',content:null,tool_calls:[{id:callKey,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'knowledge_search',arguments:input})}}]},
  {role:'tool',tool_call_id:callKey,content:JSON.stringify(output)},{role:'assistant',content:reply}];
 return {context:{userId:owner,runId:task.id,leaseToken:token,role:'member' as const,knowledgeScope:['product'] as Array<'product'>},
  final:{status:'completed' as const,reply,messages,instructionIds:[] as string[],policyRevision:digest(await loadDecisionMemory(owner))}};
};
const state=async(id:string)=>(await observer.query<{status:string;reply:string;messages:string[];events:string[];jobs:number}>(`select r.status,r.result->>'reply' reply,
 coalesce((select array_agg(content order by created_at) from assistant_message where user_id=r.user_id and metadata->>'runId'=r.id::text and role='assistant'),'{}') messages,
 coalesce((select array_agg(payload->>'reply' order by id) from agent_run_event where user_id=r.user_id and run_id=r.id and kind='status'),'{}') events,
 (select count(*)::integer from agent_memory_extraction_job where owner_id=r.user_id and run_id=r.id) jobs from agent_run r where id=$1`,[id])).rows[0];
const assertSafe=async(fixture:Awaited<ReturnType<typeof setup>>,status:string,reply?:string)=>{
 const row=await state(fixture.context.runId);assert.equal(row.status,status);assert.equal(row.jobs,status==='completed'?1:0);
 if(reply!==undefined)assert.equal(row.reply,reply);
 if(status!=='completed'){assert(!row.messages.includes(fixture.final.reply));assert(!row.events.includes(fixture.final.reply));assert.notEqual(row.reply,fixture.final.reply);}
 return row;
};
const waitForAnswerInsert=async()=>{
 let pid=0;await wait(async()=>{const rows=(await observer.query<{pid:number}>(`select distinct a.pid from pg_stat_activity a join pg_locks l on l.pid=a.pid
 where l.relation='public.assistant_message'::regclass and not l.granted and a.wait_event_type='Lock' and a.query like 'insert into assistant_message%'`)).rows;
  if(rows.length===1)pid=rows[0].pid;return rows.length===1;},'Final answer insert did not reach the held table lock');return pid;
};
try{
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic settlement','member','active')",[id,`${id}@example.invalid`]);
 await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic final source','text',$2,$3,'shared')`,[document,hash,peer]);
 await admin.query('insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256) values($1,$2,0,$3,10,$4)',[chunk,document,content,hash]);
 const positive=await setup();assert.equal((await settleMainAgentRun(positive.context,positive.final)).status,'completed');
 const positiveRow=await assertSafe(positive,'completed',positive.final.reply);assert.deepEqual(positiveRow.messages,[positive.final.reply]);assert.deepEqual(positiveRow.events,[positive.final.reply]);
 results.push('actual final transaction commits answer/result/event and exactly one extraction job together');
 const denied=await setup(),deniedCall=randomUUID(),deniedId=randomUUID(),deniedInput={messageId:randomUUID()},deniedOutput=result(null,{status:'unavailable',missing:['Synthetic missing mail'],callId:deniedId});
 await admin.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output)
  values($1,$2,$3,$4,'mail_read','1',$5,$6,'read','completed',$7)`,[deniedId,owner,denied.context.runId,deniedCall,JSON.stringify(deniedInput),digest(deniedInput),JSON.stringify(deniedOutput)]);
 denied.final.messages.splice(-1,0,{role:'assistant',content:null,tool_calls:[{id:deniedCall,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'mail_read',arguments:deniedInput})}}]},
  {role:'tool',tool_call_id:deniedCall,content:JSON.stringify(deniedOutput)});
 assert.equal((await settleMainAgentRun(denied.context,denied.final)).status,'completed');await assertSafe(denied,'completed',denied.final.reply);
 results.push('unavailable mail read without source data does not invent a missing live-source dependency or prevent a valid negative explanation');
 for(const mutation of ['scope','visibility'] as const){
  const fixture=await setup();await assertCurrentKnowledgeMessages(owner,fixture.final.messages,['product']); // Old separate precheck succeeds.
  await admin.query(mutation==='scope'?"update knowledge_document set collection_id=(select id from knowledge_collection where slug='company') where id=$1":"update knowledge_document set visibility='private' where id=$1",[document]);
  assert.equal((await settleMainAgentRun(fixture.context,fixture.final)).status,'partial');const row=await assertSafe(fixture,'partial',SOURCE_CHANGED_REPLY);assert.deepEqual(row.messages,[SOURCE_CHANGED_REPLY]);
  await admin.query("update knowledge_document set visibility='shared',collection_id=(select id from knowledge_collection where slug='product') where id=$1",[document]);
 }
 results.push('scope move and shared withdrawal committed after a successful precheck save only safe partial reply and no extraction job');
 const recovered=await setup(),checkpoint=new PostgresSaver(getPool(),undefined,{schema:'langgraph'});
 const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[],policyRevision:recovered.final.policyRevision}),
  validateEvidence:rows=>assertCurrentKnowledgeMessages(owner,rows,['product']),model:async()=>({role:'assistant',content:recovered.final.reply}),tool:async()=>{throw new Error('No action expected');}},checkpoint);
 const configuration={configurable:{thread_id:`main-agent:${owner}:${recovered.context.runId}`,checkpoint_ns:''},recursionLimit:40};
 const seeded=await graph.invoke({messages:recovered.final.messages.slice(0,-1),pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[]},configuration);assert.equal(seeded.status,'completed');
 await admin.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='company') where id=$1",[document]);
 assert.equal((await executeMainAgentRun(owner,recovered.context.runId,recovered.context.leaseToken)).status,'partial');await assertSafe(recovered,'partial',SOURCE_CHANGED_REPLY);
 assert.equal(Number((await admin.query("select count(*) n from agent_tool_call where run_id=$1 and tool_id='main_model'",[recovered.context.runId])).rows[0].n),0);
 await admin.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='product') where id=$1",[document]);
 results.push('actual executeMainAgentRun recovers PostgreSQL completed checkpoint through protected settlement after source change, with no model attempt or external action');
 const broken=await setup();await admin.query('revoke select on knowledge_chunk from network_copilot_app');
 try{assert.equal((await settleMainAgentRun(broken.context,broken.final)).status,'partial');await assertSafe(broken,'partial',SOURCE_CHANGED_REPLY);}finally{await admin.query('grant select on knowledge_chunk to network_copilot_app');}
 results.push('real PostgreSQL source-read error rolls back savepoint and safely settles partial without an aborted-transaction leak');
 const instructed=await setup();await admin.query('update agent_run set instructions=$2 where id=$1',[instructed.context.runId,JSON.stringify([{id:randomUUID(),content:'Synthetic new instruction'}])]);
 assert.equal((await settleMainAgentRun(instructed.context,instructed.final)).status,'queued');assert.deepEqual((await assertSafe(instructed,'queued','')).messages,[]);
 for(const control of ['pause','cancel']){
  const fixture=await setup();await admin.query('update agent_run set control=$2 where id=$1',[fixture.context.runId,control]);
  const expected=control==='pause'?'paused':'cancelled';assert.equal((await settleMainAgentRun(fixture.context,fixture.final)).status,expected);assert.deepEqual((await assertSafe(fixture,expected,'')).messages,[]);
 }
 const disabled=await setup();await admin.query("update app_user set status='disabled' where id=$1",[owner]);
 await assert.rejects(settleMainAgentRun(disabled.context,disabled.final),LeaseLostError);await assertSafe(disabled,'running');await admin.query("update app_user set status='active' where id=$1",[owner]);
 results.push('new instruction requeues with no old answer; latest pause/cancel and disabled account prevent old generated text persistence');
 const concurrent=await setup();await blocker.query('begin');await blocker.query('lock table assistant_message in share mode');
 const settling=settleMainAgentRun(concurrent.context,concurrent.final);await waitForAnswerInsert();
 await writer.query('begin');const writerPid=Number((await writer.query('select pg_backend_pid() pid')).rows[0].pid);
 const moving=writer.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='company') where id=$1",[document]);
 await wait(async()=>(await observer.query<{waiting:boolean}>("select wait_event_type='Lock' and wait_event='advisory' waiting from pg_stat_activity where pid=$1",[writerPid])).rows[0]?.waiting??false,'Source writer did not wait for settlement');
 assert.equal((await state(concurrent.context.runId)).status,'running');await blocker.query('rollback');assert.equal((await settling).status,'completed');await moving;
 assert.equal((await observer.query("select k.slug from knowledge_document d join knowledge_collection k on k.id=d.collection_id where d.id=$1",[document])).rows[0].slug,'product');
 await writer.query('commit');await assertSafe(concurrent,'completed',concurrent.final.reply);
 await admin.query("update knowledge_document set collection_id=(select id from knowledge_collection where slug='product') where id=$1",[document]);
 results.push('actual final answer INSERT wait retains source admission until commit; exact source writer waits then commits after valid answer settlement');
 const expiring=await setup(6);await blocker.query('begin');await blocker.query('lock table assistant_message in share mode');
 const expired=settleMainAgentRun(expiring.context,expiring.final).then(value=>({value,error:null}),error=>({value:null,error}));const waitingPid=await waitForAnswerInsert();
 await wait(async()=>(await observer.query<{expired:boolean}>(`select clock_timestamp()>r.lease_until and a.xact_start<r.lease_until expired from agent_run r cross join pg_stat_activity a where r.id=$1 and a.pid=$2`,[expiring.context.runId,waitingPid])).rows[0]?.expired??false,'Lease did not cross expiry during actual INSERT wait');
 await blocker.query('rollback');assert((await expired).error instanceof LeaseLostError);const expiredRow=await assertSafe(expiring,'running');assert.deepEqual(expiredRow.messages,[]);assert.deepEqual(expiredRow.events,[]);
 results.push('lease expires after transaction start during actual answer INSERT wait: answer, event, result and extraction job all roll back');
 const memoryId=randomUUID();await admin.query(`insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind,valid_from,valid_until)
  values($1,$2,'account','preference',$1::uuid::text,'explicit',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '6 seconds')`,[memoryId,owner]);
 await admin.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic expiring policy','{}')",[memoryId]);
 const memory=await setup();await blocker.query('begin');await blocker.query('lock table assistant_message in share mode');
 const lateMemory=settleMainAgentRun(memory.context,memory.final);await waitForAnswerInsert();
 await wait(async()=>(await observer.query<{expired:boolean}>('select clock_timestamp()>valid_until expired from agent_memory where id=$1',[memoryId])).rows[0]?.expired??false,'Memory did not expire during actual INSERT wait');
 await blocker.query('rollback');assert.equal((await lateMemory).status,'partial');await assertSafe(memory,'partial',MEMORY_CHANGED_REPLY);
 results.push('policy naturally expires during answer INSERT wait: speculative answer/event/extraction writes roll back; only safe memory-change partial is committed');
 const receipt={passed:true,results,actualPostgresFinalPersistence:true,actualEntrypointCheckpointRecoveryVerified:true,modelCalls:0,externalActions:0,syntheticTaskAndSourceData:true,compiledWorkerVerified:false,automaticActivation:false};
 await writeFile('tmp/ma24-final-main-settlement-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({finalMainSettlement:'passed',...receipt}));
}finally{
 await blocker.query('rollback').catch(()=>undefined);await writer.query('rollback').catch(()=>undefined);await Promise.allSettled([admin.end(),blocker.end(),writer.end(),observer.end(),getPool().end()]);
}
