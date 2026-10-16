import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {beginCall} from '../../src/lib/assistant/main/repository';
import {verifyOwnedTaskModelTransports} from '../../src/lib/assistant/main/task-model-transport-journal';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {loadDecisionMemory} from '../../src/lib/assistant/main/memory-context';
import {decisionMemoryMessage} from '../../src/lib/assistant/main/decision-memory-message';
import {loadRecordedTaskChain} from '../../src/lib/assistant/main/recorded-task-source';
import {replayRecordedGraphTrace} from '../../src/lib/assistant/main/recorded-graph-audit';
import {dispatchTool} from '../../src/lib/assistant/main/executor';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {verifyConfiguredSignedCandidateDatabase} from './configured-signed-candidate-db';
import {registerSignedProspectiveFixture} from './signed-prospective-registration-db';
import {verifyConfiguredSignedSafetyDatabase} from './configured-signed-safety-db';
import {verifyCombinedConfiguredDatabase} from './configured-five-category-db';
export type SignedFixtureContext={owner:string;runId:string;skillId:string;directory:string;keyPath:string;keyId:string;collectorId:string;deploymentHash:string;trustKeys:unknown[]};
type Registration=Awaited<ReturnType<typeof registerSignedProspectiveFixture>>;
type Options={registration?:Registration;reuseCustomers?:boolean;additionalTrustKeys?:unknown[];onReady?:(context:SignedFixtureContext)=>Promise<Record<string,unknown>>};

/** Real signing closures and app-role persistence with synthetic network/billing.
 * Does not qualify production network, billing or deployment identity. */
export async function verifyTaskTransportJournalDatabase(pool:Pool,owner:string,other:string,directory:string,skillId:string,options:Options={}):Promise<Record<string,unknown>>{
 if(process.env.MA24_CONFIGURED_COMBINED==='1')for(const name of ['144_skill_task_origin_locks.sql','145_skill_attachment_source_locks.sql','147_skill_timeline_source_locks.sql','148_skill_decision_memory_source_locks.sql','149_skill_knowledge_source_locks.sql','150_skill_shadow_source_locks.sql'])await pool.query(await readFile(join('db/migrations',name),'utf8'));
 const runId=randomUUID(),conversationId=randomUUID(),leaseToken=randomUUID(),config=modeModelConfig('standard');
 const context={userId:owner,runId,leaseToken,role:'member' as const};
 const task={content:'Synthetic stored request',attachments:[] as []};
 const initial=initialTaskMessages({...context,mode:config.profile!.mode},task,config,[]);
 const messages=[initial[0],decisionMemoryMessage(await loadDecisionMemory(owner)),...initial.slice(1)];
 const prospective=options.registration??(process.env.MA24_CONFIGURED_PROSPECTIVE==='1'?await registerSignedProspectiveFixture(pool,{owner,skillId,task,config,messages}):undefined);
 await pool.query('insert into assistant_conversation(id,user_id,title) values($1,$2,$3)',[conversationId,owner,'Synthetic original transport']);
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind,lease_token,lease_until)
  values($1,$2,$3,$7,$4,$8,$5,'queued','main-agent',$6,now()+interval '10 minutes')`,[runId,owner,conversationId,digest(task),JSON.stringify(config),leaseToken,runId,JSON.stringify(task)]);
 await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversationId,task.content,JSON.stringify({runId})]);
 const capture=prospective?(await pool.query('select id,start_context from agent_skill_shadow_job where owner_id=$1 and run_id=$2',[owner,runId])).rows[0]:undefined;
 if(prospective){assert(capture);assert.equal(digest(capture.start_context),digest(prospective.start));}
 await pool.query("update agent_run set status='running' where id=$1",[runId]);
 if(!options.reuseCustomers)await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$3,'Synthetic signed read customer')",[randomUUID(),owner,randomUUID()]);
 const pair=generateKeyPairSync('ed25519'),collectorId='synthetic-original-task',deploymentHash=digest('synthetic-original-deployment');
 const key={keyId:randomUUID(),collectorId,deploymentHash,enabled:true,purposes:['task-model-transport','model-transport'],
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:new Date((prospective?Date.parse(prospective.frozen.plan.frozenAt):Date.now())-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const registry={protocol:'skill-runner-trust-registry-v1',keys:[...(options.additionalTrustKeys??[]),key]},path=join(directory,'original-task-public-registry.json');
 await writeFile(path,JSON.stringify(registry));process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE=path;
 process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID=collectorId;process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256=deploymentHash;
 const keyPath=join(directory,'original-task-private.pem'),runnerPath=join(directory,'task-admission.cjs');
 await writeFile(keyPath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 // Output stays under the project so external packages resolve from its node_modules.
 const compiledPath=join(process.cwd(),'tmp','task-transport-admission.cjs');
 await build({entryPoints:['scripts/fixtures/task-transport-preflight-runner.ts'],outfile:compiledPath,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning',
  banner:{js:String.raw`globalThis.fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body);const success=process.env.MA24_SYNTHETIC_RESPONSE!=='failure';const tool=process.env.MA24_SYNTHETIC_RESPONSE==='tool';const read=process.env.MA24_SYNTHETIC_RESPONSE==='read';const chunk={id:'synthetic-'+process.env.MA24_SYNTHETIC_RUN_ID+'-'+body.model+'-'+body.messages.length,model:body.model,provider:'synthetic',choices:[{index:0,delta:(tool||read)?{tool_calls:[{index:0,id:read?'synthetic-read':'synthetic-description',type:'function',function:{name:read?'execute_tool':'describe_tool',arguments:JSON.stringify(read?{tool:'customer_timeline',arguments:{}}:{tool:'customer_timeline'})}}]}:{content:'Synthetic streamed reply'},finish_reason:(tool||read)?'tool_calls':'stop'}]};const response=success?new Response('data: '+JSON.stringify(chunk)+'\n\ndata: [DONE]\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}}):new Response('{}',{status:503});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const outputs:unknown[]=[],ids:string[]=[];
 for(let ordinal=0;ordinal<4;ordinal++){
  const index=ordinal>=2?0:ordinal,step=ordinal>=2?ordinal-1:0;
  const request={messages:structuredClone(messages),profile:config.profile!,index};
  const callKey=`mode-model:${step}:0:${index}`,attempt=await beginCall(context,{key:callKey,tool:'main_model',version:request.profile.version,input:request,effect:'model'});
  assert.equal(attempt.fresh,true);ids.push(attempt.id);
  {
   await writeFile(runnerPath,JSON.stringify({userId:owner,runId,callId:attempt.id,callKey,otherUserId:other}));
   const exit=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,[compiledPath,runnerPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
     NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
     OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
     TASK_MODEL_TRANSPORT_KEY_ID:key.keyId,TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE:keyPath,MA24_SYNTHETIC_RUN_ID:runId,MA24_SYNTHETIC_RESPONSE:ordinal===0?'failure':ordinal===1?'tool':ordinal===2?'read':'success'}});let output='';
    child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
   });
   assert.equal(exit.code,0,'Compiled original task admission failed');assert(exit.output.includes('"originalTaskCompiledAdmission":"passed"'));
  }
  const output=(await pool.query('select output from agent_tool_call where id=$1',[attempt.id])).rows[0].output;outputs.push(output);
  const recovered=await beginCall(context,{key:callKey,tool:'main_model',version:request.profile.version,input:request,effect:'model'});
  assert.equal(recovered.fresh,false);assert.deepEqual(recovered.output,output);
  if(ordinal===1||ordinal===2){
   const reply=output.data.value.message;assert.equal(reply.tool_calls.length,1);messages.push(reply);
   const description=await dispatchTool(reply.tool_calls[0],{...context,mode:config.profile!.mode});assert.equal(description.status,'success');
   messages.push({role:'tool',tool_call_id:reply.tool_calls[0].id,content:JSON.stringify(description)});
  }
 }
 await pool.query("update agent_run set status='completed',result=$2 where id=$1",[runId,JSON.stringify({reply:'Synthetic streamed reply'})]);
 const checked=await verifyOwnedTaskModelTransports({userId:owner},{runId});assert.equal(checked.transportReceiptHashes.length,4);assert.equal(checked.automaticActivation,false);
 const taskChain=await loadRecordedTaskChain({userId:owner},{runId});assert.equal(taskChain.turns.length,3);assert.equal(taskChain.initialConversationProvenanceVerified,true);
 assert.equal(taskChain.journalClosure.consumedReads,1);
 await replayRecordedGraphTrace(taskChain);
 const baseline=await prepareSkillAcceptanceBaseline({userId:owner},{runId});assert.equal(baseline.baselineJournalVerified,true);
 assert.equal(baseline.projection.requests.length,3);
 const candidate=await prepareRecordedSkillCandidateSnapshot({userId:owner},{runId,skillId,version:1});
 assert.equal(candidate.snapshot.receipts.length,1);assert.equal(candidate.snapshot.candidate.listing.enabled,false);
 assert.equal(candidate.taskInputHash,baseline.projection.inputHash);assert.equal(candidate.modelConfigHash,baseline.projection.modelConfigHash);
 const readReceipt=(await pool.query("select id,output from agent_tool_call where run_id=$1 and tool_id='customer_timeline'",[runId])).rows[0];assert(readReceipt);
 await pool.query("update agent_tool_call set output=jsonb_set(output,'{data}','null'::jsonb) where id=$1",[readReceipt.id]);
 await assert.rejects(loadRecordedTaskChain({userId:owner},{runId}),/receipt mismatch/);
 await pool.query('update agent_tool_call set output=$2 where id=$1',[readReceipt.id,JSON.stringify(readReceipt.output)]);
 await pool.query("update assistant_message set content='Changed original message' where user_id=$1 and metadata->>'runId'=$2",[owner,runId]);
 await assert.rejects(loadRecordedTaskChain({userId:owner},{runId}),/original user message changed/);
 await pool.query("update assistant_message set content=$3 where user_id=$1 and metadata->>'runId'=$2",[owner,runId,task.content]);
 await pool.query('update agent_run set result=$2 where id=$1',[runId,JSON.stringify({reply:'Changed final reply'})]);
 await assert.rejects(loadRecordedTaskChain({userId:owner},{runId}),/final answer/);
 await pool.query('update agent_run set result=$2 where id=$1',[runId,JSON.stringify({reply:'Synthetic streamed reply'})]);
 await loadRecordedTaskChain({userId:owner},{runId});
 await assert.rejects(verifyOwnedTaskModelTransports({userId:other},{runId}),/Completed owned task/);
 key.enabled=false;await writeFile(path,JSON.stringify(registry));await assert.rejects(verifyOwnedTaskModelTransports({userId:owner},{runId}),/trust/);
 key.enabled=true;await writeFile(path,JSON.stringify(registry));
 await pool.query("update agent_tool_call set output=jsonb_set(output,'{data,transportFailureReceipt,signature}',to_jsonb($2::text)) where id=$1",[ids[0],'A'.repeat(86)]);
 await assert.rejects(verifyOwnedTaskModelTransports({userId:owner},{runId}),/signature/);
 await pool.query('update agent_tool_call set output=$2 where id=$1',[ids[0],JSON.stringify(outputs[0])]);
 await pool.query("update agent_tool_call set call_key='mode-model:0:0:2' where id=$1",[ids[1]]);
 await assert.rejects(verifyOwnedTaskModelTransports({userId:owner},{runId}),/gaps/);
 await pool.query("update agent_tool_call set call_key='mode-model:0:0:1' where id=$1",[ids[1]]);
 await verifyOwnedTaskModelTransports({userId:owner},{runId});
 const collectorInput={owner,runId,skillId,directory,keyPath,keyId:key.keyId,collectorId,deploymentHash,trustKeys:registry.keys};
 const configuredCandidate:Record<string,unknown>=options.onReady?await options.onReady(collectorInput)
  :process.env.MA24_CONFIGURED_COMBINED==='1'?await verifyCombinedConfiguredDatabase(pool,collectorInput,async(registration,onReady)=>
   verifyTaskTransportJournalDatabase(pool,owner,other,directory,skillId,{registration,reuseCustomers:true,additionalTrustKeys:registry.keys,onReady}))
  :process.env.MA24_CONFIGURED_SAFETY==='1'
  ?await verifyConfiguredSignedSafetyDatabase(pool,collectorInput)
  :await verifyConfiguredSignedCandidateDatabase(pool,{...collectorInput,prospective:prospective?{jobId:capture!.id,frozen:prospective.frozen}:undefined});
 return {originalTaskJournalDatabase:true,originalTaskSignedFallbackReadback:true,originalTaskRecoveryReuse:true,
  originalTaskCrossAccountRejected:true,originalTaskKeyRevocationRejected:true,originalTaskTamperedSignatureRejected:true,originalTaskRouteGapRejected:true,
  originalTaskCompiledAdmissionVerified:true,originalTaskRequestFactoryAdmissionExecuted:true,originalTaskRequestClosureExecuted:true,
  originalTaskSyntheticFailureSignedAndPersisted:true,originalTaskSyntheticStreamSuccessSignedAndPersisted:true,
  originalTaskOtherBillingTaskRejected:true,originalTaskContextChainVerified:true,originalTaskGraphReplayVerified:true,
  originalTaskChangedUserMessageRejected:true,originalTaskChangedFinalReplyRejected:true,originalTaskDescriptionTransitionVerified:true,
  originalTaskThreeDecisionBusinessReadVerified:true,originalTaskChangedReadReceiptRejected:true,
  signedTaskBaselineProjectionVerified:true,signedTaskCandidateSnapshotVerified:true,
  ...configuredCandidate,billingAndNetworkAdaptersSynthetic:true,actualModelCalls:0};
}
