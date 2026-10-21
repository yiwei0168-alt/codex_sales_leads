import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest,type ModelMessage} from './contracts';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {modeConfigSchema} from './mode-config';
import {modelFunctions,transportMessages} from './model';
import {assertModelRequestManifest,modelRequestManifestSchema} from './model-request-manifest';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {verifyConfiguredTaskTransportReceipt} from './task-model-transport-receipt';
import {verifyConfiguredTaskTransportFailure} from './task-model-transport-failure-receipt';
import {mergeSkillSigningEnrollments,mergeSkillSigningEnrollmentWindows,type SkillSigningEnrollment,type SkillSigningEnrollmentWindow} from './skill-signing-enrollment';
import {transportRuntimeProcessRecord,type RuntimeProcessRecord} from './runtime-process-coverage';

type Row={id:string;call_key:string;tool_id:string;effect:string;status:string;input:unknown;input_hash:string;output:unknown;started_at:string;completed_at:string};
/** Read-only audit of all stored mode-model chains. Does not authenticate the
 * deployed binary or prove that every expected task decision was recorded. */
export async function verifyOwnedTaskModelTransports(context:{userId:string},input:{runId:string},validationTime?:Date){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);z.object({runId:z.uuid()}).strict().parse(input);
 const read=()=>tenantTransaction(context.userId,async client=>{
  const task=(await client.query<{created_at:string}>(`select created_at::text from agent_run
   where id=$1 and user_id=$2 and status='completed' and execution_kind='main-agent'`,[input.runId,context.userId])).rows[0];
  if(!task)throw new Error('Completed owned task required');
  const rows=(await client.query<Row>(`select id,call_key,tool_id,effect,status,input,input_hash,output,
   created_at::text started_at,updated_at::text completed_at from agent_tool_call
   where run_id=$1 and user_id=$2 and (effect='model' or tool_id='main_model') order by call_key,id`,[input.runId,context.userId])).rows;
  return {task,rows};
 });
 const saved=await read();if(!saved.rows.length)throw new Error('Task model journal empty');
 const collectorId=z.string().min(1).parse(process.env.TASK_MODEL_TRANSPORT_COLLECTOR_ID),deploymentHash=z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256);
 const chains=new Map<string,Array<{row:Row;index:number}>>();
 for(const row of saved.rows){
  const match=/^mode-model:(\d+):(\d+):([012])$/.exec(row.call_key);
  if(!match||row.tool_id!=='main_model'||row.effect!=='model'||row.status!=='completed'||row.input_hash!==digest(row.input))throw new Error('Unsupported or incomplete task model journal');
  const group=match[1]+':'+match[2],chain=chains.get(group)??[];chain.push({row,index:Number(match[3])});chains.set(group,chain);
 }
 const hashes:string[]=[],expiries:string[]=[],enrollments:SkillSigningEnrollment[]=[],windows:SkillSigningEnrollmentWindow[]=[],generations=new Set<string>();let registryHash:string|undefined;
 const runtimeProcessClaims:RuntimeProcessRecord[]=[];
 for(const chain of chains.values()){
  chain.sort((a,b)=>a.index-b.index);let requestHash:string|undefined,previousFinish=-Infinity;
  for(let position=0;position<chain.length;position++){
   const {row,index}=chain[position];if(index!==position)throw new Error('Task fallback chain has gaps or duplicates');
   const request=z.object({messages:z.array(z.unknown()).min(1),profile:modeConfigSchema,index:z.number().int().min(0).max(2)}).strict().parse(row.input);
   if(request.index!==index)throw new Error('Task route index changed');
   const common=digest({messages:request.messages,profile:request.profile});
   if(requestHash&&requestHash!==common)throw new Error('Task fallback request changed');requestHash=common;
   const started=Date.parse(row.started_at),finished=Date.parse(row.completed_at);
   if(!Number.isFinite(started)||!Number.isFinite(finished)||started<previousFinish||finished<started)throw new Error('Task fallback order invalid');previousFinish=finished;
   const expected={binding:{ownerId:context.userId,runId:input.runId,callId:row.id,callKey:row.call_key,inputHash:row.input_hash,collectorId,deploymentHash},
    taskCreatedAt:new Date(saved.task.created_at).toISOString(),callStartedAt:new Date(row.started_at).toISOString(),callCompletedAt:new Date(row.completed_at).toISOString()};
   const outcome=z.object({status:z.enum(['success','unavailable']),data:z.unknown()}).passthrough().parse(row.output);
   let checked:{registryHash:string;statementHash:string;validBefore:string;signingEnrollment:SkillSigningEnrollment;runtimeProcessClaim?:unknown};
   if(position<chain.length-1){
    if(outcome.status!=='unavailable')throw new Error('Task fallback predecessor must fail');
    const data=z.object({retryable:z.literal(true),reason:z.string(),transportFailureReceipt:z.unknown()}).parse(outcome.data);
    checked=await verifyConfiguredTaskTransportFailure(data.transportFailureReceipt,{...expected,request:row.input,reason:data.reason},validationTime);
   }else{
    if(outcome.status!=='success')throw new Error('Task fallback chain has no successful result');
    const value=z.object({value:z.object({message:z.unknown(),requestManifest:modelRequestManifestSchema,transportReceipt:z.unknown()}).passthrough()}).parse(outcome.data).value;
    const m=value.requestManifest,route=request.profile.routes[index];
    assertModelRequestManifest({...m.settings,messages:transportMessages(request.messages as ModelMessage[]),tools:modelFunctions},m);
    if(!route||m.requestedModel!==route.model||m.settings.stream!==true||(m.settings.reasoning as {effort?:unknown}|undefined)?.effort!==route.effort||m.toolSchemaHash!==digest(modelFunctions))throw new Error('Task success request changed');
    const generation=m.response.generationId;if(!generation||generations.has(generation))throw new Error('Task generation missing or reused');generations.add(generation);
    checked=await verifyConfiguredTaskTransportReceipt(value.transportReceipt,{...expected,manifest:m,message:value.message},validationTime);
   }
   if(registryHash&&registryHash!==checked.registryHash)throw new Error('Task transport trust changed');registryHash=checked.registryHash;hashes.push(checked.statementHash);expiries.push(checked.validBefore);enrollments.push(checked.signingEnrollment);
   runtimeProcessClaims.push(transportRuntimeProcessRecord(checked));
   windows.push({...checked.signingEnrollment,requiredFrom:new Date(row.started_at).toISOString(),requiredThrough:new Date(row.completed_at).toISOString()});
  }
 }
 if(digest(await read())!==digest(saved)||digest(await loadConfiguredSkillRunnerTrustRegistry(context.userId))!==registryHash)throw new Error('Task journal or trust changed during audit');
 return {transportValidBefore:new Date(Math.min(...expiries.map(Date.parse))).toISOString(),journalHash:digest(saved),transportReceiptHashes:hashes,registryHash,storedModeChainsVerified:true as const,
  runtimeProcessClaims,
  signingEnrollments:mergeSkillSigningEnrollments(enrollments),
  signingEnrollmentWindows:mergeSkillSigningEnrollmentWindows(windows),
  completeTaskProvenanceVerified:false as const,binaryVerified:false as const,automaticActivation:false as const};
}
