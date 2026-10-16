import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {currentSpendContext} from '@/lib/billing/context';
import {getOpenRouterConfig} from '@/providers/openrouter';
import {modelRoutedTransport} from '@/lib/network/model-transport';
import {digest,type ModelMessage} from './contracts';
import type {ModeConfig} from './mode-config';
import {requestModeModel,modelFunctions} from './model';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {skillTransportResponseHash} from './skill-model-transport-receipt';
import {taskTransportBindingSchema,taskTransportStatementSchema} from './task-model-transport-receipt';
import {mayFallback,modeFailureCode} from './mode-fallback';
import {attachModeTransportFailure} from './mode-transport-failure';
import {modelRequestManifest} from './model-request-manifest';
import {failureStatusMatches} from './skill-model-transport-failure-receipt';
import {taskTransportFailureStatementSchema} from './task-model-transport-failure-receipt';

const nativeTransport=fetch;
const settings=['TASK_MODEL_TRANSPORT_KEY_ID','TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE','TASK_MODEL_TRANSPORT_COLLECTOR_ID','TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256'] as const;
export function taskTransportSigningConfigured(){return settings.some(key=>Boolean(process.env[key]?.trim()));}
function controlled(){
 if(process.env.NODE_ENV!=='production'||process.execArgv.length||process.env.NODE_OPTIONS?.trim()
  ||process.env.NODE_EXTRA_CA_CERTS||process.env.SSL_CERT_FILE||process.env.SSL_CERT_DIR||process.env.NODE_USE_SYSTEM_CA==='1'
  ||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Controlled production task transport process required');
}
/** Original task signer, no caller transport or key. The durable graph must invoke
 * this only after a fresh beginCall. Recovery reuses the saved outcome instead.
 * The signature is audited against the completed database row after persistence. */
export async function createConfiguredTaskModeRequest(context:{userId:string;runId:string},input:{callId:string;callKey:string}){
 assertLocalAnalysisBoundary();controlled();z.uuid().parse(context.userId);z.uuid().parse(context.runId);
 const p=z.object({callId:z.uuid(),callKey:taskTransportBindingSchema.shape.callKey}).strict().parse(input);
 const spend=()=>{
  const scope=currentSpendContext();
  if(!scope||scope.userId!==context.userId||!z.uuid().safeParse(scope.operationId).success||!scope.stage.trim())throw new Error('Task transport requires an owned paid-call scope');
  return digest(scope);
 };
 const spendHash=spend(),requireSpend=()=>{if(spend()!==spendHash)throw new Error('Task transport paid-call scope changed');};
 const origin=new URL(getOpenRouterConfig().baseUrl);
 if(origin.origin!=='https://openrouter.ai'||origin.pathname!=='/api/v1'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Task transport requires the enrolled HTTPS origin');
 const read=()=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query<{input:unknown;input_hash:string;task_created_at:string;call_started_at:string}>(`select c.input,c.input_hash,r.created_at::text as task_created_at,c.created_at::text as call_started_at
   from agent_tool_call c join agent_run r on r.id=c.run_id and r.user_id=c.user_id
   where c.id=$1 and c.user_id=$2 and c.run_id=$3 and c.call_key=$4 and c.tool_id='main_model' and c.effect='model'
    and c.status='started' and r.status='running' and r.execution_kind='main-agent'`,[p.callId,context.userId,context.runId,p.callKey])).rows[0];
  if(!row||row.input_hash!==digest(row.input))throw new Error('Task transport stored call unavailable');
  const created=Date.parse(row.task_created_at),started=Date.parse(row.call_started_at);
  if(!Number.isFinite(created)||!Number.isFinite(started)||created>started||started>Date.now())throw new Error('Task transport stored time invalid');
  return row;
 });
 const saved=await read();
 const keyId=z.string().min(1).max(100).parse(process.env.TASK_MODEL_TRANSPORT_KEY_ID),path=process.env.TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE;
 if(!path)throw new Error('Task transport signing key not configured');
 const bytes=await readFile(/*turbopackIgnore: true*/ path);if(bytes.length>16384)throw new Error('Task transport key too large');
 const privateKey=createPrivateKey(bytes);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Task transport signing algorithm invalid');
 const publicKey=createPublicKey(privateKey).export({type:'spki',format:'der'});
 const binding=taskTransportBindingSchema.parse({ownerId:context.userId,runId:context.runId,...p,inputHash:saved.input_hash,
  collectorId:process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID,deploymentHash:process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256});
 const trust=async()=>{
  const registry=await loadConfiguredSkillRunnerTrustRegistry(),key=registry.keys.find(row=>row.keyId===keyId);
  if(!key?.enabled||!key.purposes.includes('task-model-transport')||key.collectorId!==binding.collectorId||key.deploymentHash!==binding.deploymentHash
   ||!createPublicKey(key.publicKeyPem).export({type:'spki',format:'der'}).equals(publicKey))throw new Error('Task transport enrollment unavailable');
  if(!(Date.parse(key.notBefore)<=Date.now()&&Date.now()<Date.parse(key.expiresAt)))throw new Error('Task transport enrollment expired');
  return {hash:digest(registry),expiresAt:key.expiresAt};
 };
 await trust();let invoked=false;
 return async(messages:ModelMessage[],profile:ModeConfig,index:number,signal?:AbortSignal)=>{
  if(invoked)throw new Error('Task transport request already invoked');invoked=true;
  assertLocalAnalysisBoundary();controlled();requireSpend();
  if(index!==Number(p.callKey.split(':').at(-1))||digest({messages,profile,index})!==saved.input_hash||digest(await read())!==digest(saved))throw new Error('Task transport stored input changed');
  const before=await trust(),capturedAt=new Date().toISOString();let observed=false,status:number|undefined,requestHash:string|undefined,observedBody:Record<string,unknown>|undefined;
  const transport:typeof fetch=async(url,init)=>{
   requireSpend();controlled();const target=new URL(url instanceof Request?url.url:String(url));
   if(observed||target.href!=='https://openrouter.ai/api/v1/chat/completions'||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string')throw new Error('Task transport request boundary changed');
   observed=true;observedBody=JSON.parse(init.body);requestHash=digest(observedBody);
   const response=await modelRoutedTransport(nativeTransport,url,init)(url,init);status=response.status;
   if(response.redirected||response.url!==target.href)throw new Error('Task transport response origin changed');
   return response;
  };
  let output:Awaited<ReturnType<typeof requestModeModel>>;
  try{output=await requestModeModel(messages,profile,index,transport,signal);}
  catch(error){
   try{
    requireSpend();controlled();assertLocalAnalysisBoundary();const after=await trust(),reason=modeFailureCode(error),httpStatus=status??null;
    if(observedBody&&mayFallback(error)&&!signal?.aborted&&before.hash===after.hash&&digest(await read())===digest(saved)&&failureStatusMatches(reason,httpStatus)){
     const manifest=modelRequestManifest(observedBody,null),completedAt=new Date().toISOString();
     if(manifest.toolSchemaHash!==digest(modelFunctions)||Date.parse(completedAt)>=Date.parse(after.expiresAt))throw new Error('Task failure boundary changed');
     const statement=taskTransportFailureStatementSchema.parse({...binding,protocol:'task-model-transport-failure-v1',keyId,
      requestHash:manifest.requestHash,manifestHash:digest(manifest),reason,retryable:true,httpStatus,origin:'https://openrouter.ai',
      path:'/api/v1/chat/completions',capturedAt,completedAt,expiresAt:after.expiresAt});
     attachModeTransportFailure(error,{statement,requestManifest:manifest,signature:sign(null,Buffer.from(digest(statement),'hex'),privateKey).toString('base64url')});
    }
   }catch{/* Preserve the original error; unsigned failures cannot qualify provenance. */}
   throw error;
  }
  requireSpend();controlled();const after=await trust();
  if(before.hash!==after.hash||digest(await read())!==digest(saved)||!observed||status!==200
   ||requestHash!==output.requestManifest.requestHash||output.requestManifest.toolSchemaHash!==digest(modelFunctions)
   ||!output.requestManifest.response.modelMatchesRequested||!output.requestManifest.response.model
   ||!output.requestManifest.response.provider||!output.requestManifest.response.generationId)throw new Error('Task transport request or trust changed');
  const completedAt=new Date().toISOString();if(Date.parse(completedAt)>=Date.parse(after.expiresAt))throw new Error('Task transport enrollment expired');
  const statement=taskTransportStatementSchema.parse({...binding,protocol:'task-model-transport-v1',keyId,requestHash,
   manifestHash:digest(output.requestManifest),responseHash:skillTransportResponseHash(output.message),origin:'https://openrouter.ai',
   path:'/api/v1/chat/completions',status:200,capturedAt,completedAt,expiresAt:after.expiresAt});
  return {...output,transportReceipt:{statement,signature:sign(null,Buffer.from(digest(statement),'hex'),privateKey).toString('base64url')}};
 };
}
