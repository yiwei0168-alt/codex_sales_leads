import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {digest,result} from '../../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {modelFunctions} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {beginCall,completeCall} from '../../src/lib/assistant/main/repository';
import {skillTransportResponseHash} from '../../src/lib/assistant/main/skill-model-transport-receipt';
import {verifyOwnedTaskModelTransports} from '../../src/lib/assistant/main/task-model-transport-journal';

/** Synthetic signatures exercise actual app-role journal persistence and audit,
 * not the request factory, provider network or production deployment identity. */
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
  banner:{js:`globalThis.fetch=async(url)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Synthetic destination rejected');const response=new Response('{}',{status:503});Object.defineProperty(response,'url',{value:String(url)});return response;};`},
  plugins:[{name:'explicit-synthetic-network-and-billing',setup(builder){
   builder.onResolve({filter:/(?:billing\/paid-fetch|network\/model-transport)$/},()=>({path:'synthetic-adapters',namespace:'ma24-fixture'}));
   builder.onLoad({filter:/.*/,namespace:'ma24-fixture'},()=>({contents:'export const budgetedFetch=(transport)=>transport; export const modelRoutedTransport=(transport)=>transport;',loader:'js'}));
  }}]});
 const envelope=(statement:unknown)=>({statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')});
 const outputs:unknown[]=[],ids:string[]=[];
 for(let index=0;index<2;index++){
  const request={messages:[{role:'user' as const,content:'Synthetic stored request'}],profile:config.profile!,index};
  const callKey=`mode-model:0:0:${index}`,attempt=await beginCall(context,{key:callKey,tool:'main_model',version:request.profile.version,input:request,effect:'model'});
  assert.equal(attempt.fresh,true);ids.push(attempt.id);
  if(index===0){
   await writeFile(runnerPath,JSON.stringify({userId:owner,runId,callId:attempt.id,callKey,otherUserId:other}));
   const exit=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,[compiledPath,runnerPath],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
     NODE_ENV:'production',NODE_OPTIONS:'',NODE_EXTRA_CA_CERTS:'',SSL_CERT_FILE:'',SSL_CERT_DIR:'',NODE_USE_SYSTEM_CA:'0',NODE_TLS_REJECT_UNAUTHORIZED:'1',
     OPENROUTER_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL',OPENROUTER_BASE_URL:'https://openrouter.ai/api/v1',OPENROUTER_HTTP_REFERER:'',
     TASK_MODEL_TRANSPORT_KEY_ID:key.keyId,TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE:keyPath}});let output='';
    child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
   });
   assert.equal(exit.code,0,'Compiled original task admission failed');assert(exit.output.includes('"originalTaskCompiledAdmission":"passed"'));
  }
  const route=request.profile.routes[index],body={model:route.model,messages:request.messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  const capturedAt=new Date().toISOString(),completedAt=new Date().toISOString(),message={role:'assistant',content:'Synthetic stored reply'};
  const manifest=modelRequestManifest(body,index?{model:route.model,provider:'synthetic',id:randomUUID()}:null);
  const common={ownerId:owner,runId,callId:attempt.id,callKey,inputHash:digest(request),collectorId,deploymentHash,keyId:key.keyId,
   requestHash:manifest.requestHash,manifestHash:digest(manifest),origin:'https://openrouter.ai',path:'/api/v1/chat/completions',capturedAt,completedAt,expiresAt:key.expiresAt};
  const output=index?result({value:{message,requestManifest:manifest,transportReceipt:envelope({...common,protocol:'task-model-transport-v1',status:200,responseHash:skillTransportResponseHash(message)})}})
   :(await pool.query('select output from agent_tool_call where id=$1',[attempt.id])).rows[0].output;
  await completeCall(context,attempt.id,output,{});outputs.push(output);
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
  originalTaskSyntheticFailureSignedAndPersisted:true,billingAndNetworkAdaptersSynthetic:true,actualModelCalls:0};
}
