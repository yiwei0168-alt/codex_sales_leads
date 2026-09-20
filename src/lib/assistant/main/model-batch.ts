import {tenantQuery,tenantTransaction,query} from "@/lib/rag/db";
import {reservePaidCallInTransaction,settlePaidCall} from "@/lib/billing/repository";
import {providerUsageObservation} from "@/lib/billing/provider-usage";
import {reportedDollarsToMicros} from "@/lib/billing/openrouter-cost-report";
import {batchPayload,submitOpenRouterBatch,readOpenRouterBatch,OpenRouterRequestError,BatchAdmissionResponseError,matchesBatchModel,type OpenRouterBatch} from "@/providers/openrouter-batch";
import {beginCall,completeCall,event} from "./repository";
import {modelFunctions,parseModelResponse} from "./model";
import {result,digest,type ExecutionContext,type ModelMessage,type ModelConfig} from "./contracts";
import {recordConsumedToolOutputs} from "./consumption";

export class ModelBatchPending extends Error {constructor(){super("Model batch is awaiting an asynchronous provider result");}}
type ModelResult=ReturnType<typeof parseModelResponse>;
interface BatchRow {id:string;user_id:string;run_id:string;call_id:string;reservation_id:string;model:string;provider:string;custom_id:string;remote_id:string|null;
  status:string;output:ModelResult|null;submitted_at:string;poll_count:number;poll_failures:number;http_latency_ms:string;poll_token:string|null}
const readJob=async(userId:string,callId:string)=>(await tenantQuery<BatchRow>(userId,"select * from agent_model_batch where user_id=$1 and call_id=$2",[userId,callId]))[0];

/** Validate identity and completion; a 202 acknowledgement is never a model answer. */
export function batchModelResult(batch:OpenRouterBatch,expected:{model:string;customId:string}):ModelResult|undefined {
  if(!matchesBatchModel(batch.model,expected.model))throw new Error("Batch model identity mismatch");
  if(batch.request_counts.total!==1)throw new Error("Unexpected batch request count");
  if(["validating","in_progress","finalizing","cancelling"].includes(batch.status))return undefined;
  if(batch.status!=="completed"||batch.request_counts.failed||batch.request_counts.completed!==1)throw new Error("Batch did not complete successfully");
  const rows=batch.results??[];
  if(rows.length!==1||rows[0].custom_id!==expected.customId||rows[0].error||rows[0].response?.status_code!==200)throw new Error("Batch result identity or status mismatch");
  const parsed=parseModelResponse(rows[0].response.body);
  return {...parsed,usage:batch.usage??parsed.usage};
}
async function defer(context:ExecutionContext):Promise<never> {
  await tenantQuery(context.userId,"update agent_run set next_attempt_at=now()+interval '30 seconds' where user_id=$1 and id=$2 and lease_token=$3",[context.userId,context.runId,context.leaseToken]);
  throw new ModelBatchPending();
}
export async function requestDurableBatchModel(context:ExecutionContext,messages:ModelMessage[],step:number,revision:number,config:ModelConfig,transport:typeof fetch=fetch):Promise<ModelMessage> {
  if(config.providers.length!==1)throw new Error("Batch requires one explicitly configured provider");
  const key=`model:${step}${revision?`:revision:${revision}`:""}:batch`;
  // Freeze the submitted prompt for this model turn. Policy/instruction revision
  // checks at the graph boundary decide whether its returned actions are stale.
  const existing=await tenantQuery<{input:{messages:ModelMessage[];config:ModelConfig}}>(context.userId,"select input from agent_tool_call where user_id=$1 and run_id=$2 and call_key=$3",[context.userId,context.runId,key]);
  const input=existing[0]?.input??{messages,config};
  const saved=await beginCall(context,{key,tool:"main_model",version:config.version,input,effect:"model"});
  if(saved.output?.status==="success") {
    await recordConsumedToolOutputs(context,input.messages);
    await tenantQuery(context.userId,"update agent_tool_call set metrics=metrics||'{\"downstreamUsedItems\":1,\"utilizationEfficiency\":1,\"usageBoundary\":\"model-output-consumed-by-graph\"}'::jsonb where user_id=$1 and id=$2",[context.userId,saved.id]);
    return (saved.output.data as {message:ModelMessage}).message;
  }
  if(saved.output)throw new Error("Saved batch did not return a usable model answer");
  const previous=await readJob(context.userId,saved.id);
  if(previous) {
    if(previous.status==="pending")return defer(context);
    throw new Error("Batch submission/result is uncertain; reconcile before submitting again");
  }
  if(!saved.fresh)throw new Error("Batch call started without a saved receipt; do not resubmit");
  const customId=`turn-${saved.id}`;
  const payload=batchPayload(config.model,config.providers[0],customId,{messages:input.messages,tools:modelFunctions,tool_choice:"auto",max_tokens:16384});
  const job=await tenantTransaction(context.userId,async client=>{
    const reservationId=await reservePaidCallInTransaction(client,context.userId,{operationId:context.runId,stage:"main-agent-batch",tariffKey:"openrouter-main-agent-batch",tariffVersion:"MA10",maximumChargeMicros:0,costBoundKnown:false,requestBytes:Buffer.byteLength(JSON.stringify(payload)),requestFingerprint:digest(payload),
      modelAttempt:{invocationId:saved.id,provider:config.providers[0],task:"main-agent-batch",promptVersion:config.version,attempt:1,requestedModel:config.model,gatewayHost:"openrouter.ai",endpointKind:"batch-chat-completions"}});
    return (await client.query<BatchRow>("insert into agent_model_batch(user_id,run_id,call_id,reservation_id,model,provider,custom_id,status) values($1,$2,$3,$4,$5,$6,$7,'submitting') returning *",[context.userId,context.runId,saved.id,reservationId,config.model,config.providers[0],customId])).rows[0];
  });
  const started=Date.now();
  try {
    const batch=await submitOpenRouterBatch(payload,transport);
    // Save late submission receipts even if a worker lease was lost meanwhile.
    await tenantQuery(context.userId,"update agent_model_batch set remote_id=$3,status='pending',provider_status=$4,http_latency_ms=$5,next_poll_at=now()+interval '15 seconds' where user_id=$1 and id=$2 and status='submitting'",[context.userId,job.id,batch.id,batch.status,Date.now()-started]);
  } catch(error) {
    if(error instanceof BatchAdmissionResponseError) {
      await tenantQuery(context.userId,"update agent_model_batch set remote_id=$3,status='pending',provider_status='acknowledgement-schema-changed',http_latency_ms=$4,next_poll_at=now()+interval '30 seconds' where user_id=$1 and id=$2 and status='submitting'",[context.userId,job.id,error.remoteId,Date.now()-started]);
      return defer(context);
    }
    const reason=error instanceof OpenRouterRequestError?error.reason:error instanceof Error&&error.message==="Batch admission identity mismatch"?"admission-identity-mismatch":"submission-unknown";
    await tenantQuery(context.userId,"update agent_model_batch set status=$3,provider_status=$4,http_latency_ms=$5 where user_id=$1 and id=$2 and status='submitting'",[context.userId,job.id,error instanceof OpenRouterRequestError?"failed":"unknown",reason,Date.now()-started]);
    await settlePaidCall(context.userId,job.reservation_id,{reportedMicros:null,latencyMs:Date.now()-started,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false});
    await completeCall(context,saved.id,result(null,{status:"unavailable",missing:[reason]}),batchMetrics(job,null,reason));
    throw error;
  }
  await event(context,"model_batch_submitted",{model:config.model,provider:config.providers[0],requestCount:1,completionWindow:"24h"});
  return defer(context);
}
function batchMetrics(job:BatchRow,output:ModelResult|null,reason?:string) {
  return {inputItems:1,validOutputItems:output?1:0,downstreamUsedItems:null,inputTokens:output?.usage?.prompt_tokens??null,outputTokens:output?.usage?.completion_tokens??null,
    apiCredits:output?.usage?.cost??null,costUsd:output?.usage?.cost??null,latencyMs:Math.max(0,Date.now()-new Date(job.submitted_at).getTime()),retries:0,pollCount:job.poll_count,
    discardedReasonCounts:reason?{[reason]:1}:{},utilizationEfficiency:null,usageBoundary:"async-model-result-persisted-before-graph-use",optimizationOpportunity:"Reuse batch receipts; keep polling separate from paid inference and batch independent reads where possible"};
}
/** Receipt-only worker. Never starts inference and never exposes another tenant's batch list. */
export async function pollDueModelBatch(id?:string,transport:typeof fetch=fetch) {
  const claim=(await query<{id:string;user_id:string;poll_token:string}>("select * from claim_next_agent_model_batch($1)",[id??null]))[0];
  if(!claim)return false;
  const job=(await tenantQuery<BatchRow>(claim.user_id,"select * from agent_model_batch where user_id=$1 and id=$2 and poll_token=$3",[claim.user_id,claim.id,claim.poll_token]))[0];
  if(!job?.remote_id)return false;
  const started=Date.now();let batch:OpenRouterBatch;
  try {batch=await readOpenRouterBatch(job.remote_id,transport);}
  catch {
    await tenantQuery(job.user_id,"update agent_model_batch set poll_count=poll_count+1,poll_failures=poll_failures+1,poll_lease_until=null,next_poll_at=now()+least(600,30*power(2,least(poll_failures,4))) * interval '1 second',http_latency_ms=http_latency_ms+$4 where user_id=$1 and id=$2 and poll_token=$3",[job.user_id,job.id,claim.poll_token,Date.now()-started]);
    return true;
  }
  let output:ModelResult|undefined,reason:string|undefined;
  try {output=batchModelResult(batch,{model:job.model,customId:job.custom_id});}
  catch {reason="batch-result-unavailable";}
  if(!output&&!reason) {
    await tenantQuery(job.user_id,"update agent_model_batch set provider_status=$4,poll_count=poll_count+1,poll_failures=0,poll_lease_until=null,next_poll_at=now()+interval '30 seconds',http_latency_ms=http_latency_ms+$5 where user_id=$1 and id=$2 and poll_token=$3",[job.user_id,job.id,claim.poll_token,batch.status,Date.now()-started]);
    return true;
  }
  if(output?.message.tool_calls)output.message.tool_calls=output.message.tool_calls.map((call,index)=>({...call,id:`call_${digest({call:job.call_id,index,id:call.id}).slice(0,40)}`}));
  // Settle once only from a final matched result. 202 and status polls have no
  // valid model output, and never create additional paid reservations.
  await settlePaidCall(job.user_id,job.reservation_id,{reportedMicros:reportedDollarsToMicros(batch.usage?.cost),latencyMs:Date.now()-new Date(job.submitted_at).getTime(),responseBytes:Buffer.byteLength(JSON.stringify(batch)),
    inputTokens:batch.usage?.prompt_tokens??null,outputTokens:batch.usage?.completion_tokens??null,succeeded:Boolean(output),providerUsage:providerUsageObservation(batch,{httpStatus:200})});
  const context:ExecutionContext={userId:job.user_id,runId:job.run_id,leaseToken:"receipt-only",role:"member"};
  await completeCall(context,job.call_id,output?result({message:output.message}):result(null,{status:"unavailable",missing:[reason!]}),batchMetrics({...job,poll_count:job.poll_count+1},output??null,reason));
  await tenantQuery(job.user_id,"update agent_model_batch set status=$4,provider_status=$5,output=$6,finished_at=now(),poll_lease_until=null,poll_count=poll_count+1,http_latency_ms=http_latency_ms+$7 where user_id=$1 and id=$2 and poll_token=$3",[job.user_id,job.id,claim.poll_token,output?"completed":"failed",batch.status,output?JSON.stringify(output):null,Date.now()-started]);
  await tenantQuery(job.user_id,"update agent_run set next_attempt_at=now() where user_id=$1 and id=$2 and status='queued'",[job.user_id,job.run_id]);
  await event(context,"model_batch_result",{status:batch.status,validOutputItems:output?1:0});
  return true;
}
