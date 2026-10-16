import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {beginCall} from '../../src/lib/assistant/main/repository';
import {verifyOwnedTaskModelTransports} from '../../src/lib/assistant/main/task-model-transport-journal';

/** Real signing closures and app-role persistence with synthetic network/billing.
 * Does not qualify production network, billing or deployment identity. */
export async function verifyTaskTransportJournalDatabase(pool:Pool,owner:string,other:string,directory:string){
 const runId=randomUUID(),conversationId=randomUUID(),leaseToken=randomUUID(),config=modeModelConfig('quick');
 const context={userId:owner,runId,leaseToken,role:'member' as const};
 await pool.query('insert into assistant_conversation(id,user_id,title) values($1,$2,$3)',[conversationId,owner,'Synthetic original transport']);
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind,lease_token,lease_until)
  values($1,$2,$3,$7,$4,'{}',$5,'running','main-agent',$6,now()+interval '10 minutes')`,[runId,owner,conversationId,digest('synthetic'),JSON.stringify(config),leaseToken,runId]);
 const pair=generateKeyPairSync('ed25519'),collectorId='synthetic-original-task',deploymentHash=digest('synthetic-original-deployment');
 const key={keyId:randomUUID(),collectorId,deploymentHash,enabled:true,purposes:['task-model-transport'],
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const registry={protocol:'skill-runner-trust-registry-v1',keys:[key]},path=join(directory,'original-task-public-registry.json');
 await writeFile(path,JSON.stringify(registry));process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE=path;
 process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID=collectorId;process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256=deploymentHash;
 const keyPath=join(directory,'original-task-private.pem'),runnerPath=join(directory,'task-admission.cjs');
 await writeFile(keyPath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 // Output stays under the project so external packages resolve from its node_modules.
 const compiledPath=join(process.cwd(),'tmp','task-transport-admission.cjs');
 await build({entryPoints:['scripts/fixtures/task-transport-preflight-runner.ts'],outfile:compiledPath,bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning',
  banner:{js:String.raw`globalThis.fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const body=JSON.parse(init.body);const success=process.env.MA24_SYNTHETIC_RESPONSE==='success';const chunk={id:'synthetic-'+body.model,model:body.model,provider:'synthetic',choices:[{index:0,delta:{content:'Synthetic streamed reply'},finish_reason:'stop'}]};const response=success?new Response('data: '+JSON.stringify(chunk)+'\n\ndata: [DONE]\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}}):new Response('{}',{status:503});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const outputs:unknown[]=[],ids:string[]=[];
 for(let index=0;index<2;index++){
  const request={messages:[{role:'user' as const,content:'Synthetic stored request'}],profile:config.profile!,index};
  const callKey=`mode-model:0:0:${index}`,attempt=await beginCall(context,{key:callKey,tool:'main_model',version:request.profile.version,input:request,effect:'model'});
  assert.equal(attempt.fresh,true);ids.push(attempt.id);
  {
   await writeFile(runnerPath,JSON.stringify({userId:owner,runId,callId:attempt.id,callKey,otherUserId:other}));
   const exit=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,[compiledPath,runnerPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
     NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
     OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
     TASK_MODEL_TRANSPORT_KEY_ID:key.keyId,TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE:keyPath,MA24_SYNTHETIC_RESPONSE:index?'success':'failure'}});let output='';
    child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
   });
   assert.equal(exit.code,0,'Compiled original task admission failed');assert(exit.output.includes('"originalTaskCompiledAdmission":"passed"'));
  }
  const output=(await pool.query('select output from agent_tool_call where id=$1',[attempt.id])).rows[0].output;outputs.push(output);
  const recovered=await beginCall(context,{key:callKey,tool:'main_model',version:request.profile.version,input:request,effect:'model'});
  assert.equal(recovered.fresh,false);assert.deepEqual(recovered.output,output);
 }
 await pool.query("update agent_run set status='completed' where id=$1",[runId]);
 const checked=await verifyOwnedTaskModelTransports({userId:owner},{runId});assert.equal(checked.transportReceiptHashes.length,2);assert.equal(checked.automaticActivation,false);
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
 return {originalTaskJournalDatabase:true,originalTaskSignedFallbackReadback:true,originalTaskRecoveryReuse:true,
  originalTaskCrossAccountRejected:true,originalTaskKeyRevocationRejected:true,originalTaskTamperedSignatureRejected:true,originalTaskRouteGapRejected:true,
  originalTaskCompiledAdmissionVerified:true,originalTaskRequestFactoryAdmissionExecuted:true,originalTaskRequestClosureExecuted:true,
  originalTaskSyntheticFailureSignedAndPersisted:true,originalTaskSyntheticStreamSuccessSignedAndPersisted:true,
  originalTaskOtherBillingTaskRejected:true,billingAndNetworkAdaptersSynthetic:true,actualModelCalls:0};
}
