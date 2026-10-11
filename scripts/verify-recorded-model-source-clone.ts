import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {loadRecordedTaskChain} from '../src/lib/assistant/main/recorded-task-source';
import {describeTool,productTools} from '../src/lib/assistant/main/tools';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {validateRecordedRequestEvidence} from '../src/lib/assistant/main/model-request-evidence';
import {digest} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {modelFunctions,transportMessages} from '../src/lib/assistant/main/model';
import {modelRequestManifest} from '../src/lib/assistant/main/model-request-manifest';
import {loadRecordedModeRequest,revalidateRecordedModeRequest} from '../src/lib/assistant/main/model-request-source';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),conversation=randomUUID(),runId=randomUUID(),callId=randomUUID(),memoryId=randomUUID(),readCallId=randomUUID();
globalThis.fetch=async()=>{throw Error('No network in clone verification');};
try{
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Model source fixture','!','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Model source fixture')",[conversation,owner]);
 await pool.query("insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind) values($1,$2,'account','preference','synthetic-replay','explicit')",[memoryId,owner]);
 await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic preference','{}')",[memoryId]);
 const memories=await loadDecisionMemory(owner);
 assert(memories.some(row=>row.id===memoryId));
 const config=modeModelConfig('standard'),profile=config.profile!,messages=[{role:'system' as const,content:'Synthetic product instructions'},decisionMemoryMessage(memories),{role:'user' as const,content:'Synthetic original task'},
  {role:'assistant' as const,content:null,tool_calls:[{id:'describe-1',type:'function' as const,function:{name:'describe_tool',arguments:JSON.stringify({tool:'memory_read'})}}]},
  {role:'tool' as const,tool_call_id:'describe-1',content:JSON.stringify({status:'success',data:describeTool(productTools.find(t=>t.id==='memory_read')!)})},
  {role:'assistant' as const,content:null,tool_calls:[{id:'memory-1',type:'function' as const,function:{name:'execute_tool',arguments:JSON.stringify({tool:'memory_read',arguments:{}})}}]},
  {role:'tool' as const,tool_call_id:'memory-1',content:JSON.stringify({status:'success',data:memories,callId:readCallId})}],input={profile,index:1,messages};
 const body={model:profile.routes[1].model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[1].effort}};
 const output={status:'success',data:{value:{requestManifest:modelRequestManifest(body,{model:body.model,provider:'fixture',id:'synthetic-generation'})}}};
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
 values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,'completed','main-agent')`,[runId,owner,conversation,JSON.stringify({content:'Synthetic original task'}),JSON.stringify(config)]);
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
 values($1,$2,$3,$1::uuid::text,'main_model','1',$4,$5,'model','completed',$6)`,[callId,owner,runId,digest(input),JSON.stringify(input),JSON.stringify(output)]);
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
 values($1,$2,$3,'memory-1','memory_read','1',$4,'{}','read','completed',$5)`,[readCallId,owner,runId,digest({}),JSON.stringify({status:'success',data:memories,callId:readCallId})]);
 const context={userId:owner},selection={runId,callId},snapshot=await loadRecordedModeRequest(context,selection);
 assert.equal(snapshot.serverProvenanceVerified,true);assert.equal(snapshot.executionAuthorized,false);assert.equal(snapshot.sourcePermissionsRevalidated,false);assert.deepEqual(snapshot.body,body);
 const checked=await validateRecordedRequestEvidence(context,selection);
 assert.equal(checked.toolContractsRevalidated,true);assert.equal(checked.evidenceSnapshotRevalidated,true);assert.equal(checked.sourcePermissionsRevalidated,false);assert.equal(checked.executionAuthorized,false);
 assert.equal(checked.receiptBinding.receipts.length,1);
 await pool.query("update agent_tool_call set output=$2 where id=$1",[readCallId,JSON.stringify({status:'success',data:[],callId:readCallId})]);
 await assert.rejects(validateRecordedRequestEvidence(context,selection),/receipt mismatch/);
 await pool.query("update agent_tool_call set output=$2 where id=$1",[readCallId,JSON.stringify({status:'success',data:memories,callId:readCallId})]);
 await pool.query('update agent_memory set active=false where id=$1',[memoryId]);
 await assert.rejects(validateRecordedRequestEvidence(context,selection),/decision memory changed/);
 await pool.query('update agent_memory set active=true where id=$1',[memoryId]);
 await assert.rejects(loadRecordedModeRequest({userId:other},selection));
 await assert.rejects(loadRecordedModeRequest(context,{runId:randomUUID(),callId}));
 await pool.query("update agent_run set instructions=$2 where id=$1",[runId,JSON.stringify([{content:'new instruction'}])]);
 await assert.rejects(revalidateRecordedModeRequest(context,selection,snapshot.sourceHash));
 await pool.query("update agent_run set status='cancelled' where id=$1",[runId]);await assert.rejects(loadRecordedModeRequest(context,selection));
 await pool.query("update agent_run set status='completed' where id=$1",[runId]);
 await pool.query('update agent_tool_call set input_hash=$2 where id=$1',[callId,'0'.repeat(64)]);await assert.rejects(loadRecordedModeRequest(context,selection));
 await pool.query("update agent_run set result=$2 where id=$1",[runId,JSON.stringify({reply:'Synthetic final answer'})]);
 const terminal={...output,data:{value:{...output.data.value,message:{role:'assistant',content:'Synthetic final answer'}}}};
 await pool.query("update agent_tool_call set input_hash=$2,call_key='mode-model:2:0:1',output=$3 where id=$1",[callId,digest(input),JSON.stringify(terminal)]);
 const earlierIds:string[]=[];
 for(const [step,end,replyIndex] of [[0,3,3],[1,5,5]]){
  const earlierId=randomUUID();earlierIds.push(earlierId);
  const priorInput={...input,messages:messages.slice(0,end)},priorBody={...body,messages:transportMessages(priorInput.messages)};
  const priorOutput={status:'success',data:{value:{message:messages[replyIndex],requestManifest:modelRequestManifest(priorBody,{model:body.model,provider:'fixture',id:`synthetic-${step}`})}}};
  await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
   values($1,$2,$3,$4,'main_model','1',$5,$6,'model','completed',$7)`,[earlierId,owner,runId,`mode-model:${step}:0:1`,digest(priorInput),JSON.stringify(priorInput),JSON.stringify(priorOutput)]);
 }
 await assert.rejects(loadRecordedTaskChain(context,{runId}),/predecessor missing/);
 const selected=(await pool.query("select call_key,input from agent_tool_call where run_id=$1 and tool_id='main_model'",[runId])).rows;
 for(const row of selected){
  const failedInput={...row.input,index:0};
  await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
   values($1,$2,$3,$4,'main_model','1',$5,$6,'model','completed',$7)`,[randomUUID(),owner,runId,row.call_key.replace(/:1$/,':0'),digest(failedInput),JSON.stringify(failedInput),JSON.stringify({status:'unavailable',data:{retryable:true,reason:'http-429'}})]);
 }
 const chain=await loadRecordedTaskChain(context,{runId});assert.equal(chain.turns.length,3);assert.equal(chain.serverTaskJournalVerified,true);assert.equal(chain.wholeTaskProvenanceVerified,false);
 await pool.query("update agent_tool_call set output=jsonb_set(output,'{data,value,message,content}','\"Altered historical reply\"'::jsonb) where id=$1",[earlierIds[0]]);
 await assert.rejects(loadRecordedTaskChain(context,{runId}),/history diverged/);
 await assert.rejects(loadRecordedTaskChain({userId:other},{runId}),/unavailable/);
 console.log(JSON.stringify({cloneOnly:true,threeTurnChainBound:true,missingFallbackPredecessorDenied:true,fallbackChainBound:true,alteredEarlierReplyDenied:true,localEvidenceGuardsPassed:true,currentToolContractsChecked:true,readReceiptBound:true,substitutedReceiptDenied:true,revokedDecisionMemoryDenied:true,exactRequest:true,tenantIsolation:true,wrongRunDenied:true,changedInstructionsDenied:true,cancelledRunDenied:true,inputHashTamperingDenied:true,modelCalls:0,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false}));
}finally{
 await pool.query('delete from agent_memory_version where memory_id=$1',[memoryId]);
 await pool.query('delete from agent_memory where id=$1 and owner_id=$2',[memoryId,owner]);
 await pool.query('delete from agent_tool_call where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run_event where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from assistant_conversation where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
 await pool.end();await getPool().end();
}
