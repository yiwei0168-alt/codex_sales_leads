import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import type {Client} from 'pg';
import {chromium,expect} from '@playwright/test';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {getPool} from '../../src/lib/rag/db';
import {enqueueRun} from '../../src/lib/assistant/main/repository';
import {buildMainAgentGraph} from '../../src/lib/assistant/main/graph';
import {loadDecisionMemory} from '../../src/lib/assistant/main/memory-context';
import {digest,type ModelMessage,type ModelToolCall} from '../../src/lib/assistant/main/contracts';
import {productTools} from '../../src/lib/assistant/main/tools';
import {MAIN_AGENT_EXECUTION_LIMITS} from '../../src/lib/assistant/main/main-agent-limits';

/** Generated documents only. The production Worker creates and consumes the
 * approval; the browser is the sole source of its synthetic decision. */
export async function verifyMa24ApprovedLocalAction(input:{
 admin:Client;owner:string;base:string;ownerCookie:string;peerCookie:string;
 key:string;cert:string;runWorker:()=>Promise<void>;
}){
 assert.equal(process.env.MA24_DISPOSABLE_MAIN_RUNTIME,'1');
 assert.equal((await input.admin.query('select current_database() name')).rows[0].name,'network_copilot_local');
 assert.match(process.env.MA24_MAIN_RUNTIME_NETWORK??'',/^ma24-pilot-net-[a-f0-9]{12}$/);
 assert.match((await input.admin.query('select email from app_user where id=$1',[input.owner])).rows[0]?.email??'',/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 assert.notEqual(input.ownerCookie,input.peerCookie);
 const upstream=new URL(input.base);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
 const proxy=createServer({key:input.key,cert:input.cert},(incoming,outgoing)=>{
  const forwarded=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{
   outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });forwarded.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forwarded);
 });
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const results:Record<string,unknown>[]=[],screenshots:string[]=[];
 try{
  await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}});
  const separator=input.ownerCookie.indexOf('=');assert(separator>0);
  await context.addCookies([{name:input.ownerCookie.slice(0,separator),value:input.ownerCookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  const spec=productTools.find(tool=>tool.id==='knowledge_private_delete');assert(spec);assert.equal(spec.effect,'destructive');assert.equal(spec.recovery,'reconcile');
  const seed=buildMainAgentGraph({boundary:async()=>{throw new Error('Checkpoint seed only');},model:async()=>{throw new Error('No fixture model');},tool:async()=>{throw new Error('No fixture executor');}},new PostgresSaver(getPool(),undefined,{schema:'langgraph'}));
  for(const kind of ['approve','deny','revoke','changed-hash'] as const){
   const document=randomUUID(),chunk=randomUUID(),content=`Synthetic approval document ${document}`,hash=digest(content);
   await input.admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
    values($1,(select id from knowledge_collection where slug='product'),$1::uuid::text,'Synthetic approval document','text',$2,$3,'private')`,[document,hash,input.owner]);
   await input.admin.query('insert into knowledge_chunk(id,document_id,chunk_index,content,token_estimate,content_sha256) values($1,$2,0,$3,10,$4)',[chunk,document,content,hash]);
   const task=await enqueueRun(input.owner,{content:`Synthetic ${kind} local deletion`,attachments:[],requestKey:randomUUID()},
    {model:'synthetic-unusable',providers:['synthetic-unusable'],version:'synthetic'});
   const args={documentId:document,expectedHash:hash};
   const call:ModelToolCall={id:randomUUID(),type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:spec.id,arguments:args})}};
   const config={configurable:{thread_id:`main-agent:${input.owner}:${task.id}`,checkpoint_ns:''}};
   // Exercise the actual pending-action boundary and stop at the existing next
   // model-step limit. This proves local execution, not a natural model answer.
   await seed.updateState(config,{messages:[{role:'user',content:task.input.content},{role:'assistant',content:null,tool_calls:[call]}],pending:[call],
    steps:MAIN_AGENT_EXECUTION_LIMITS.modelSteps,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:digest(await loadDecisionMemory(input.owner))},'main_model');
   const readDocument=async()=>(await input.admin.query('select owner_id,visibility,content_sha256 from knowledge_document where id=$1',[document])).rows;
   const before=await readDocument();assert.deepEqual(before,[{owner_id:input.owner,visibility:'private',content_sha256:hash}]);
   await input.runWorker();
   const waiting=(await input.admin.query('select status from agent_run where id=$1',[task.id])).rows[0];assert.equal(waiting.status,'waiting_user');
   const approvals=(await input.admin.query('select * from agent_approval where user_id=$1 and run_id=$2',[input.owner,task.id])).rows;assert.equal(approvals.length,1);
   const approval=approvals[0];assert.equal(approval.status,'pending');assert.equal(approval.tool_id,spec.id);assert.equal(approval.tool_version,spec.version);assert.deepEqual(approval.payload,args);
   assert.equal(approval.parameter_hash,digest({tool:spec.id,version:spec.version,input:args}));
   const readCalls=async()=>(await input.admin.query('select id,call_key,tool_id,effect,status,output,approval_id from agent_tool_call where run_id=$1 order by id',[task.id])).rows;
   assert.deepEqual(await readCalls(),[]);assert.deepEqual(await readDocument(),before);
   const endpoint=`${input.base}/api/assistant/approvals/${approval.id}`;
   const post=async(cookie:string|undefined,parameterHash:string)=>fetch(endpoint,{method:'POST',headers:{...(cookie?{cookie}:{}),'content-type':'application/json'},body:JSON.stringify({decision:'approve',parameterHash})});
   assert.equal((await post(undefined,approval.parameter_hash)).status,401);
   assert.equal((await post(input.peerCookie,approval.parameter_hash)).status,409);
   assert.equal((await post(input.ownerCookie,'0'.repeat(64))).status,409);
   assert.equal((await input.admin.query('select status from agent_approval where id=$1',[approval.id])).rows[0].status,'pending');
   assert.equal((await page.goto(`${base}/c/${task.conversation_id}`))?.status(),200);
   const card=page.locator('.agent-approval').filter({hasText:'确认删除私有知识'});await expect(card).toBeVisible();await expect(card).toContainText(document);
   const decide=async(name:string)=>{const response=page.waitForResponse(value=>value.url()===`${base}/api/assistant/approvals/${approval.id}`&&value.request().method()==='POST');await card.getByRole('button',{name,exact:true}).click();assert.equal((await response).status(),200);};
   await decide(kind==='deny'?'拒绝':'确认此内容');
   if(kind==='revoke'){
    await page.reload();await expect(card).toContainText('已批准，等待执行结果');await decide('撤销');
   }
   if(kind==='changed-hash')await input.admin.query('update knowledge_document set content_sha256=$2 where id=$1 and owner_id=$3',[document,digest('Synthetic changed revision'),input.owner]);
   const decisionStatus=kind==='deny'?'denied':kind==='revoke'?'revoked':'approved';
   assert.equal((await input.admin.query('select status from agent_approval where id=$1',[approval.id])).rows[0].status,decisionStatus);
   assert.equal((await input.admin.query('select status from agent_run where id=$1',[task.id])).rows[0].status,'queued');
   assert.equal((await readDocument()).length,1,'A browser decision cannot execute the action');assert.deepEqual(await readCalls(),[]);
   if(kind==='approve'){const screenshot=`tmp/ma24-approved-local-action-${task.id}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);}
   await input.runWorker();
   const calls=await readCalls(),shouldExecute=kind==='approve'||kind==='changed-hash';assert.equal(calls.length,shouldExecute?1:0);
   if(shouldExecute){assert.equal(calls[0].call_key,`approval:${approval.id}`);assert.equal(calls[0].approval_id,approval.id);assert.equal(calls[0].tool_id,spec.id);assert.equal(calls[0].effect,'destructive');assert.equal(calls[0].status,'completed');assert.equal(calls[0].output.status,kind==='approve'?'success':'missing_input');}
   if(kind==='approve'){
    assert.deepEqual(await readDocument(),[]);assert.equal((await input.admin.query('select count(*)::int n from knowledge_chunk where id=$1',[chunk])).rows[0].n,0);
    assert.equal(calls[0].output.data.deleted,true);
   }else assert.equal((await readDocument()).length,1);
   const taskRow=(await input.admin.query('select status,result from agent_run where id=$1',[task.id])).rows[0];assert.equal(taskRow.status,'partial');
   const state=(await seed.getState(config)).values as {messages:ModelMessage[];pending:unknown[]};assert.deepEqual(state.pending,[]);
   const echoed:ModelMessage[]=state.messages.filter(message=>message.role==='tool'&&message.tool_call_id===call.id);assert.equal(echoed.length,1);
   const output=JSON.parse(echoed[0].content!);assert.equal(output.status,kind==='approve'?'success':kind==='changed-hash'?'missing_input':'unavailable');
   const rows=(await input.admin.query('select to_jsonb(a) value from agent_approval a where id=$1',[approval.id])).rows;
   assert.equal(rows[0].value.status,shouldExecute?'consumed':decisionStatus);
   const documentAfter=await readDocument();await input.runWorker();assert.deepEqual(await readCalls(),calls);assert.deepEqual(await readDocument(),documentAfter);
   assert.deepEqual((await input.admin.query('select to_jsonb(a) value from agent_approval a where id=$1',[approval.id])).rows,rows);
   assert.deepEqual((await input.admin.query('select status,result from agent_run where id=$1',[task.id])).rows[0],taskRow);
   assert.equal((await post(input.ownerCookie,approval.parameter_hash)).status,409);
   assert.equal((await input.admin.query("select count(*)::int n from agent_run_event where run_id=$1 and kind='model_attempt'",[task.id])).rows[0].n,0);
   assert.equal((await input.admin.query("select count(*)::int n from agent_tool_call where run_id=$1 and tool_id='main_model'",[task.id])).rows[0].n,0);
   results.push({kind,approvalRequestedByCompiledWorker:true,browserDecision:true,status:rows[0].value.status,toolReceipts:calls.length,toolStatus:output.status,
    noExecutionBeforeDecision:true,browserDecisionOnlyQueues:true,subsequentEmptyWorkerNoReplay:true,duplicateDecisionRejected:true,actualModelCalls:0});
  }
  assert.deepEqual(errors,[]);await context.close();
  return {approvedLocalAction:'passed',actualChromeAndCompiledWebAndApiAndWorker:true,results,screenshots,noPageErrors:true,
   syntheticDocumentsOnly:true,syntheticPendingCheckpoint:true,nextModelStoppedAtExistingStepLimit:true,naturalModelAnswerVerified:false,
   anonymousPeerAndWrongHashRejected:true,realHumanApproval:false,realBusinessQualityApproved:false,actualModelCalls:0,externalActions:0,productionQualified:false};
 }finally{await browser?.close();await new Promise<void>((done,reject)=>proxy.close(error=>error?reject(error):done()));}
}
