import type {PoolClient} from "pg";
import {tenantTransaction} from "@/lib/rag/db";
import {readRecoveryTaskLimits} from "@/lib/billing/recovery-task-budget";
import {BudgetDeniedError} from "@/lib/billing/policy";
import type {LeadSearchPlan} from "./types";
import type {LeadWorkflowResult} from "@/lib/leads/workflow/types";
import {validateSavedRecoverySource,type SavedRecoverySnapshot} from "@/lib/leads/workflow/saved-recovery-source";

type ReadCheckpoint=(userId:string,actionId:string,threadId:string,plan:LeadSearchPlan)=>Promise<SavedRecoverySnapshot>;
const productionCheckpoint:ReadCheckpoint=async(...args)=>{
  const {readSavedWorkflowRecoveryCheckpoint}=await import("@/lib/leads/workflow/graph");
  return readSavedWorkflowRecoveryCheckpoint(...args);
};

/** Read-only preparation. Does not create an executable action or call a provider. */
export async function readSavedProcessingRecovery(userId:string,parentId:string){
  return tenantTransaction(userId,client=>readSavedProcessingRecoveryInTransaction(client,userId,parentId,productionCheckpoint));
}

export async function readSavedProcessingRecoveryInTransaction(client:PoolClient,userId:string,parentId:string,readCheckpoint:ReadCheckpoint){
  // Use the same ordering as lineage creation and reservations; keep cost observations stable.
  const budget=await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);
  if(!budget.rowCount)throw new BudgetDeniedError("missing-budget");
  const rows=await client.query<{conversation_id:string;payload:LeadSearchPlan;result:LeadWorkflowResult}>(`select conversation_id,payload,result from assistant_action
    where user_id=$1 and id=$2 and action_type='lead-search' and status='completed' for update`,[userId,parentId]);
  const parent=rows.rows[0];
  if(!parent)throw new Error("Saved recovery requires an owned completed action");
  const limits=await readRecoveryTaskLimits(client,userId,parentId);
  const own=limits.find(row=>row.action_id===parentId);
  const unresolved=await client.query(`select id from paid_call_reservation where user_id=$1 and operation_id=$2
    and (status in ('reserved','bound-exceeded') or (status='unknown' and settled_micros is null)) limit 1`,[userId,parentId]);
  if(limits.some(row=>row.blocking_prior_request)||unresolved.rows.length)throw new BudgetDeniedError("paid-request-already-recorded");
  const runs=await client.query<{id:string;workspace_id:string;graph_thread_id:string}>(`select r.id,r.workspace_id,r.graph_thread_id
    from lead_workflow_job j join lead_search_run r on r.graph_thread_id=j.graph_thread_id
    join market_workspace w on w.id=r.workspace_id
    where j.user_id=$1 and j.action_id=$2 and j.status='completed' and w.owner_id=$1 and r.status='completed'
      and r.id::text=$3 and r.country_code=$4 and r.metadata->>'assistantActionId'=$2::text
      and r.metadata->>'graphThreadId'=r.graph_thread_id and r.metadata ? 'persistenceInputFingerprint'`,
    [userId,parentId,parent.result.runId??"",parent.payload.countryCode]);
  const run=runs.rows[0];
  if(runs.rows.length!==1||!run.graph_thread_id||run.graph_thread_id!==parent.result.graphThreadId)throw new Error("Saved recovery requires one verified persisted source run");
  const selected=await client.query<{domain:string}>(`select domain from lead_candidate_assessment
    where run_id=$1 and user_id=$2 and selected=true order by selected_rank`,[run.id,userId]);
  const snapshot=await readCheckpoint(userId,parentId,run.graph_thread_id,parent.payload);
  const prepared=validateSavedRecoverySource({userId,actionId:parentId,workspaceId:run.workspace_id,threadId:run.graph_thread_id,
    runId:run.id,plan:parent.payload,result:parent.result,snapshot,selectedDomains:selected.rows.map(row=>row.domain),
    taskBudget:own&&own.limit_micros!==null?{limitMicros:own.limit_micros,occupiedMicros:own.occupied_micros}:null});
  return {...prepared,conversationId:parent.conversation_id};
}
