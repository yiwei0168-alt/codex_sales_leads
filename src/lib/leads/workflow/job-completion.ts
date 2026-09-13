import type {PoolClient} from "pg";
import {tenantTransaction} from "@/lib/rag/db";
import {searchStopReasonLabels} from "@/lib/assistant/task-summary";
import {persistenceInputFingerprint} from "./persistence-identity";
import type {LeadWorkflowJobClaim} from "./jobs";
import type {LeadWorkflowResult} from "./types";
import {WorkflowPausedError} from "./pause";

/** Shared action→job lock order with confirmation and pause. */
export async function lockWorkflowOutcome(client:PoolClient,claim:LeadWorkflowJobClaim){
  const action=await client.query("select id from assistant_action where id=$1 and user_id=$2 and conversation_id=$3 for update",[claim.actionId,claim.userId,claim.conversationId]);
  if(action.rowCount!==1)throw new Error("Workflow outcome action ownership mismatch");
  const job=await client.query<{status:string;result:LeadWorkflowResult|null}>("select status,result from lead_workflow_job where id=$1 and user_id=$2 and action_id=$3 and graph_thread_id=$4 for update",[claim.jobId,claim.userId,claim.actionId,claim.graphThreadId]);
  if(job.rowCount!==1)throw new Error("Workflow outcome job identity mismatch");
  return job.rows[0];
}

export async function recordWorkflowCompletion(client:PoolClient,claim:LeadWorkflowJobClaim,result:LeadWorkflowResult){
  const startedAt=Date.now();
  const job=await lockWorkflowOutcome(client,claim);
  if(result.graphThreadId!==claim.graphThreadId)throw new Error("Workflow result thread mismatch");
  const fingerprint=persistenceInputFingerprint(result);
  if(job.status==="completed"&&persistenceInputFingerprint(job.result)!==fingerprint)throw new Error("Completed workflow result conflict; preserve original receipt");
  // Includes old receipts without a dedicated completion marker; never invent or rewrite their observations.
  const receipts=await client.query<{metadata:{searchResult:LeadWorkflowResult}}>("select metadata from assistant_message where user_id=$1 and conversation_id=$2 and role='assistant' and intent='lead-search' and metadata->'searchResult'->>'graphThreadId'=$3",[claim.userId,claim.conversationId,claim.graphThreadId]);
  if(receipts.rows.some(row=>persistenceInputFingerprint(row.metadata.searchResult)!==fingerprint))throw new Error("Workflow completion receipt conflict; preserve original receipt");
  if(!receipts.rows.length){
    const content=`${result.countryName} 搜索${result.accepted>=result.requested?"达到目标":"部分完成"}：发现 ${result.discovered} 家、评估 ${result.assessed} 家、合格 ${result.qualified} 家，最终保存 ${result.accepted}/${result.requested} 家，缺口 ${Math.max(0,result.requested-result.accepted)} 家。${searchStopReasonLabels[result.targetCompletionReason??""]??"停止原因未记录"}。共使用 ${result.creditsUsed} 个付费搜索/证据 credits。`;
    await client.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'assistant','lead-search',$3,$4)",[claim.userId,claim.conversationId,content,JSON.stringify({searchResult:result,completionJobId:claim.jobId,
      completionObservation:{inputItems:1,generatedOutputItems:1,validOutputItems:1,savedOutputItems:1,downstreamUsedItems:null,
        inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-startedAt,retries:null,
        discardedReasonCounts:{},utilizationEfficiency:null,usageBoundary:"completion-receipt-saved-not-user-viewed-or-adopted",
        optimizationOpportunity:"Reuse one committed receipt; retain original business result on late failures"}})]);
    await client.query("update assistant_conversation set updated_at=now() where id=$1 and user_id=$2",[claim.conversationId,claim.userId]);
  }
  await client.query("update lead_workflow_job set status='completed',phase='completed',result=$3,error_message=null,lease_until=null,finished_at=coalesce(finished_at,now()),updated_at=now() where id=$1 and user_id=$2",[claim.jobId,claim.userId,JSON.stringify(result)]);
  await client.query("update assistant_action set status='completed',result=$3,error_message=null,finished_at=coalesce(finished_at,now()),updated_at=now() where id=$1 and user_id=$2",[claim.actionId,claim.userId,JSON.stringify(result)]);
}

export async function completeWorkflowJob(claim:LeadWorkflowJobClaim,result:LeadWorkflowResult){
  return tenantTransaction(claim.userId,client=>recordWorkflowCompletion(client,claim,result));
}

export async function failWorkflowJob(claim:LeadWorkflowJobClaim,error:unknown){
  return tenantTransaction(claim.userId,async client=>{
    const job=await lockWorkflowOutcome(client,claim);
    // A lost commit acknowledgement or a late runner must not downgrade a committed completion.
    if(job.status==="completed")return;
    const paused=error instanceof WorkflowPausedError;
    const message=(error instanceof Error?error.message:String(error)).slice(0,2000);
    await client.query(`update lead_workflow_job set status=$3,phase=case when $4 then phase else 'failed' end,
      paused_at=case when $4 then now() else paused_at end,error_message=$5,lease_until=null,
      finished_at=case when $4 then finished_at else now() end,updated_at=now() where id=$1 and user_id=$2`,
      [claim.jobId,claim.userId,paused?'cancelled':'failed',paused,message]);
    await client.query("update assistant_action set status=$3,error_message=$4,finished_at=now(),updated_at=now() where id=$1 and user_id=$2",[claim.actionId,claim.userId,paused?'cancelled':'failed',message]);
    if(!paused){
      await client.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'assistant','lead-search',$3,$4)",[claim.userId,claim.conversationId,
        `LangGraph 搜索未完成：${message}。工作流 checkpoint 已保留；没有使用模拟公司替代真实结果。`,JSON.stringify({workflowFailureJobId:claim.jobId})]);
      await client.query("update assistant_conversation set updated_at=now() where id=$1 and user_id=$2",[claim.conversationId,claim.userId]);
    }
  });
}
