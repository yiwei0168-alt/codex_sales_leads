import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {auditRecordedGraphExecution} from '../src/lib/assistant/main/recorded-graph-audit';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import {initialTaskMessages} from '../src/lib/assistant/main/initial-task-messages';
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
import {verifyAcceptanceBaselineFixture} from './fixtures/skill-acceptance-baseline-clone';
import {verifyCandidateSourceFixture} from './fixtures/skill-candidate-source-clone';
import {verifySkillModelJournalFixture} from './fixtures/skill-model-journal-clone';
import {verifyAcceptanceFreezeFixture} from './fixtures/skill-acceptance-freeze-clone';
import {hashPassword} from '../src/lib/auth/password';
nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const applicationBase=process.env.DATABASE_URL;assert(applicationBase&&['localhost','127.0.0.1','::1'].includes(new URL(applicationBase).hostname));
const applicationUrl=new URL(applicationBase);applicationUrl.pathname=`/${state.database}`;
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),conversation=randomUUID(),runId=randomUUID(),callId=randomUUID(),memoryId=randomUUID(),readCallId=randomUUID();
const skillReviewUiPassword=process.argv.includes('--skill-review-ui')?randomBytes(24).toString('base64url'):null;
globalThis.fetch=async()=>{throw Error('No network in clone verification');};
try{
 await pool.query(await readFile('db/migrations/130_skill_acceptance_evidence.sql','utf8'));
 await pool.query(await readFile('db/migrations/131_skill_model_attempt_journal.sql','utf8'));
 await pool.query(await readFile('db/migrations/132_skill_bundle_collector.sql','utf8'));
 await pool.query(await readFile('db/migrations/133_skill_acceptance_freeze.sql','utf8'));
 await pool.query(await readFile('db/migrations/134_skill_model_freeze_binding.sql','utf8'));
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Model source fixture',$3,'member','active')",[id,`${id}@example.invalid`,id===owner&&skillReviewUiPassword?hashPassword(skillReviewUiPassword):'!']);
 console.log(JSON.stringify({skillModelJournal:await verifySkillModelJournalFixture(pool,owner,other),cloneOnly:true}));
 console.log(JSON.stringify({skillAcceptanceFreeze:await verifyAcceptanceFreezeFixture(pool,owner,other),cloneOnly:true}));
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Model source fixture')",[conversation,owner]);
 await pool.query("insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind) values($1,$2,'account','preference','synthetic-replay','explicit')",[memoryId,owner]);
 await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic preference','{}')",[memoryId]);
 const memories=await loadDecisionMemory(owner);
 assert(memories.some(row=>row.id===memoryId));
 const config=modeModelConfig('standard'),profile=config.profile!;
 const initial=initialTaskMessages({userId:owner,role:'member',mode:'standard'},{content:'Synthetic original task',attachments:[]},config,[]);
 const messages=[initial[0],decisionMemoryMessage(memories),...initial.slice(1),
  {role:'assistant' as const,content:null,tool_calls:[{id:'describe-1',type:'function' as const,function:{name:'describe_tool',arguments:JSON.stringify({tool:'memory_read'})}}]},
  {role:'tool' as const,tool_call_id:'describe-1',content:JSON.stringify({status:'success',data:describeTool(productTools.find(t=>t.id==='memory_read')!)})},
  {role:'assistant' as const,content:null,tool_calls:[{id:'memory-1',type:'function' as const,function:{name:'execute_tool',arguments:JSON.stringify({tool:'memory_read',arguments:{}})}}]},
  {role:'tool' as const,tool_call_id:'memory-1',content:JSON.stringify({status:'success',data:memories,callId:readCallId})}],input={profile,index:1,messages};
 const body={model:profile.routes[1].model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[1].effort}};
 const output={status:'success',data:{value:{requestManifest:modelRequestManifest(body,{model:body.model,provider:'fixture',id:'synthetic-generation'})}}};
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
 values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,$5,'completed','main-agent')`,[runId,owner,conversation,JSON.stringify({content:'Synthetic original task'}),JSON.stringify(config)]);
 await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general','Synthetic original task',$3)",[owner,conversation,JSON.stringify({runId})]);
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
 assert.equal(chain.journalClosure.completeReadOnlyJournalVerified,true);assert.equal(chain.journalClosure.consumedReads,1);
 const hiddenId=randomUUID();
 for(const effect of ['write','read']){
  await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
   values($1,$2,$3,$1::uuid::text,'synthetic_unconsumed','1',$4,'{}',$5,'completed',$6)`,[hiddenId,owner,runId,digest({}),effect,JSON.stringify({status:'success',data:{synthetic:true}})]);
  await assert.rejects(loadRecordedTaskChain(context,{runId}),/unconsumed operation/);
  await pool.query('delete from agent_tool_call where id=$1 and user_id=$2',[hiddenId,owner]);
 }
 const graphAudit=await auditRecordedGraphExecution(context,{runId});assert.equal(graphAudit.recordedDecisions,3);assert.equal(graphAudit.recordedTools,2);assert.equal(graphAudit.modelCalls,0);
 const acceptanceBaseline=await verifyAcceptanceBaselineFixture(pool,owner,other,runId);
 console.log(JSON.stringify({acceptanceBaseline,cloneOnly:true,modelCalls:0}));
 const candidateSource=await verifyCandidateSourceFixture(pool,owner,other,runId,skillReviewUiPassword?async(bundleId,skillId)=>{
  const {verifyMa24SkillReviewUiClone}=await import('./lib/verify-ma24-skill-review-ui-clone');
  console.log(JSON.stringify({skillReviewUi:await verifyMa24SkillReviewUiClone({pool,owner,email:`${owner}@example.invalid`,password:skillReviewUiPassword,applicationDatabaseUrl:applicationUrl.toString(),migrationDatabaseUrl:url.toString(),bundleId,skillId}),cloneOnly:true}));
 }:undefined);
 console.log(JSON.stringify({candidateSource,cloneOnly:true,modelCalls:0}));
 const clarification='Synthetic clarification after recorded reads';
 await pool.query('update agent_run set instructions=$2 where id=$1',[runId,JSON.stringify([{id:randomUUID(),content:clarification}])]);
 const lastAttempts=(await pool.query("select id,input,output,call_key from agent_tool_call where run_id=$1 and call_key like 'mode-model:2:0:%'",[runId])).rows;
 for(const row of lastAttempts){
  const revisedInput={...row.input,messages:[...row.input.messages,{role:'user',content:clarification}]};
  const revisedOutput=row.input.index===1?{...row.output,data:{value:{...row.output.data.value,requestManifest:modelRequestManifest({...body,messages:transportMessages(revisedInput.messages)},{model:body.model,provider:'fixture',id:'synthetic-revision'})}}}:row.output;
  await pool.query('update agent_tool_call set input=$2,input_hash=$3,output=$4,call_key=$5 where id=$1',[row.id,JSON.stringify(revisedInput),digest(revisedInput),JSON.stringify(revisedOutput),row.call_key.replace('mode-model:2:0:','mode-model:2:1:')]);
 }
 const revisedAudit=await auditRecordedGraphExecution(context,{runId});assert.equal(revisedAudit.recordedBoundaryChanges,1);assert.equal(revisedAudit.recordedTools,2);
 await pool.query("update assistant_message set content='Changed original' where user_id=$1",[owner]);
 await assert.rejects(loadRecordedTaskChain(context,{runId}),/original user message changed/);
 await pool.query("update assistant_message set content='Synthetic original task' where user_id=$1",[owner]);
 await pool.query("update agent_tool_call set output=jsonb_set(output,'{data,value,message,content}','\"Altered historical reply\"'::jsonb) where id=$1",[earlierIds[0]]);
 await assert.rejects(loadRecordedTaskChain(context,{runId}),/history diverged/);
 await assert.rejects(loadRecordedTaskChain({userId:other},{runId}),/unavailable/);
 console.log(JSON.stringify({cloneOnly:true,completeReadOnlyJournalVerified:true,unconsumedWriteRejected:true,unconsumedReadRejected:true,threeTurnChainBound:true,productionGraphReceiptReplay:true,instructionBoundaryReplay:true,initialSourceBound:true,changedUserMessageDenied:true,missingFallbackPredecessorDenied:true,fallbackChainBound:true,alteredEarlierReplyDenied:true,localEvidenceGuardsPassed:true,currentToolContractsChecked:true,readReceiptBound:true,substitutedReceiptDenied:true,revokedDecisionMemoryDenied:true,exactRequest:true,tenantIsolation:true,wrongRunDenied:true,changedInstructionsDenied:true,cancelledRunDenied:true,inputHashTamperingDenied:true,modelCalls:0,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false}));
}finally{
 await pool.query('delete from agent_memory_version where memory_id=$1',[memoryId]);
 await pool.query('delete from agent_memory where id=$1 and owner_id=$2',[memoryId,owner]);
 await pool.query('delete from agent_tool_call where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run_event where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from agent_run where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from assistant_message where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from assistant_conversation where user_id=any($1::uuid[])',[[owner,other]]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
 await pool.end();await getPool().end();
}
