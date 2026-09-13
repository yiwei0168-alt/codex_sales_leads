import type {PoolClient} from "pg";
import {tenantTransaction} from "@/lib/rag/db";
import {readRecoveryTaskLimits} from "@/lib/billing/recovery-task-budget";
import {BudgetDeniedError} from "@/lib/billing/policy";
import type {LeadSearchPlan} from "./types";
import type {LeadWorkflowResult} from "@/lib/leads/workflow/types";
import {validateSavedRecoverySource,type SavedRecoverySnapshot} from "@/lib/leads/workflow/saved-recovery-source";
import {persistenceInputFingerprint} from "@/lib/leads/workflow/persistence-identity";
import {readRecoveryEvidenceReadiness} from "@/lib/leads/workflow/recovery-evidence-readiness";
import {ACTIVE_LEAD_SCORING_POLICY,scoringPolicyChecksum} from "@/lib/leads/scoring-policy";

type ReadCheckpoint=(userId:string,actionId:string,threadId:string,plan:LeadSearchPlan)=>Promise<SavedRecoverySnapshot>;
const productionCheckpoint:ReadCheckpoint=async(...args)=>{
  const {readSavedWorkflowRecoveryCheckpoint}=await import("@/lib/leads/workflow/graph");
  return readSavedWorkflowRecoveryCheckpoint(...args);
};

/** Read-only preparation. Does not create an executable action or call a provider. */
export async function readSavedProcessingRecovery(userId:string,parentId:string){
  return tenantTransaction(userId,client=>readSavedProcessingRecoveryInTransaction(client,userId,parentId,productionCheckpoint));
}

export async function proposeProcessingRecovery(userId:string,parentId:string){
  return tenantTransaction(userId,client=>proposeProcessingRecoveryInTransaction(client,userId,parentId,productionCheckpoint));
}

/** Initialize an owned, confirmed recovery run without discovery or provider calls. */
export async function prepareProcessingRecoveryExecution(userId:string,childId:string,threadId:string,plan:LeadSearchPlan){
  return tenantTransaction(userId,async client=>{
    const started=Date.now();
    const links=await client.query<{parent_action_id:string;metadata:{sourceProof:unknown}}>(
      "select parent_action_id,metadata from lead_processing_recovery where user_id=$1 and child_action_id=$2",[userId,childId]);
    const link=links.rows[0];if(!link)return null;
    const prepared=await readSavedProcessingRecoveryInTransaction(client,userId,link.parent_action_id,productionCheckpoint);
    if(persistenceInputFingerprint(link.metadata.sourceProof)!==persistenceInputFingerprint(prepared.proof))throw new Error("Recovery source changed before execution");
    if(persistenceInputFingerprint(plan)!==persistenceInputFingerprint(prepared.scope.plan))throw new Error("Recovery execution plan mismatch");
    const child=await client.query(`select a.id from assistant_action a join lead_workflow_job j on j.action_id=a.id and j.user_id=a.user_id
      where a.user_id=$1 and a.id=$2 and a.conversation_id=$3 and a.action_type='lead-search'
        and a.status in ('confirmed','running') and a.confirmed_at is not null and a.payload=$4::jsonb
        and j.graph_thread_id=$5 and j.status='running' for update of a`,[userId,childId,prepared.conversationId,JSON.stringify(plan),threadId]);
    if(child.rowCount!==1)throw new Error("Recovery execution requires an owned confirmed task and claimed job");
    const unknown=await client.query(`select id from paid_call_reservation where user_id=$1 and operation_id=$2
      and (status in ('reserved','bound-exceeded') or (status='unknown' and settled_micros is null)) limit 1`,[userId,childId]);
    if(unknown.rows.length)throw new BudgetDeniedError("paid-request-already-recorded");
    const runs=await client.query<{id:string;workspace_id:string;country_code:string;metadata:{processingRecoverySource?:unknown}}>(`select id,workspace_id,country_code,metadata
      from lead_search_run where metadata->>'assistantActionId'=$1 and metadata->>'graphThreadId'=$2 for update`,[childId,threadId]);
    if(runs.rows.length>1)throw new Error("Recovery has multiple source runs; preserve history");
    let runId=runs.rows[0]?.id;
    const reused=Boolean(runId);
    if(runId){
      const existing=runs.rows[0];
      if(existing.workspace_id!==prepared.state.workspaceId||existing.country_code.trim()!==plan.countryCode
        ||persistenceInputFingerprint(existing.metadata.processingRecoverySource??null)!==persistenceInputFingerprint(prepared.proof))throw new Error("Recovery run identity mismatch");
    }else{
      const created=await client.query<{id:string}>(`insert into lead_search_run(workspace_id,provider,target_count,country_code,market_name,objective,
        graph_thread_id,status,scoring_policy_id,scoring_policy_version,scoring_policy_checksum,scoring_policy_snapshot,metadata)
        values($1,'langgraph-processing-recovery',$2,$3,$4,$5,$6,'running',
          (select id from lead_scoring_policy where policy_key=$7 and version=$8 limit 1),$8,$9,$10,$11) returning id`,
        [prepared.state.workspaceId,plan.targetCount,plan.countryCode,plan.countryName,plan.objective,threadId,
          ACTIVE_LEAD_SCORING_POLICY.policyKey,ACTIVE_LEAD_SCORING_POLICY.version,scoringPolicyChecksum(),JSON.stringify(ACTIVE_LEAD_SCORING_POLICY),
          JSON.stringify({assistantActionId:childId,graphThreadId:threadId,processingRecoverySource:prepared.proof,
            processingRecoveryParentActionId:link.parent_action_id,discoveryAllowed:false})]);
      runId=created.rows[0].id;
    }
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'processing-recovery',$3,'processing.recovery-run-prepared',$4)`,[prepared.state.workspaceId,userId,childId,
      JSON.stringify({runId,efficiency:{inputItems:1,outputItems:reused?0:1,validOutputItems:reused?0:1,savedOutputItems:reused?0:1,
        downstreamUsedItems:0,userAdoptedItems:null,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,
        latencyMs:Date.now()-started,cacheHit:reused,discardedReasonCounts:reused?{duplicateRunAvoided:1}:{},utilizationEfficiency:reused?null:1,
        usageBoundary:"recovery-run-initialized-before-processing",optimizationOpportunity:"Reuse one run after restart and preserve original invoices"}})]);
    return {...prepared,runId,childActionId:childId,graphThreadId:threadId};
  });
}

export async function proposeProcessingRecoveryInTransaction(client:PoolClient,userId:string,parentId:string,readCheckpoint:ReadCheckpoint){
  const started=Date.now();
  const prepared=await readSavedProcessingRecoveryInTransaction(client,userId,parentId,readCheckpoint);
  const existing=await client.query<{child_action_id:string;metadata:{sourceProof?:unknown}}>("select child_action_id,metadata from lead_processing_recovery where user_id=$1 and parent_action_id=$2",[userId,parentId]);
  if(existing.rows[0]&&persistenceInputFingerprint(existing.rows[0].metadata.sourceProof??null)!==persistenceInputFingerprint(prepared.proof)){
    throw new Error("Saved recovery source changed after proposal; preserve the existing proposal for reconciliation");
  }
  let childId=existing.rows[0]?.child_action_id;
  const reused=Boolean(childId);
  if(!childId){
    const child=await client.query<{id:string}>(`insert into assistant_action(user_id,conversation_id,action_type,payload)
      values($1,$2,'lead-search',$3) returning id`,[userId,prepared.conversationId,JSON.stringify(prepared.scope.plan)]);
    childId=child.rows[0].id;
    await client.query(`insert into lead_processing_recovery(user_id,parent_action_id,child_action_id,metadata) values($1,$2,$3,$4)`,
      [userId,parentId,childId,JSON.stringify({sourceProof:prepared.proof,scope:{
        companies:prepared.scope.companies.map(company=>({domain:company.domain,stage:company.stage,sourceCandidateIds:company.sourceCandidateIds})),
        selectedDomains:prepared.scope.selectedDomains,originalAcceptedCount:prepared.scope.originalAcceptedCount,
        targetCount:prepared.scope.plan.targetCount,discoveryAllowed:false}})]);
    await client.query(`insert into assistant_message(user_id,conversation_id,role,intent,content,metadata)
      values($1,$2,'assistant','lead-search',$3,$4)`,[userId,prepared.conversationId,
      `已保存处理恢复提案：仅处理原任务中 ${prepared.scope.companies.length} 家未完成公司，最多补足 ${prepared.scope.plan.targetCount} 家缺口。原结果与费用保留，恢复仍受原任务预算约束。提案尚未执行，须经专用恢复入口确认。`,
      JSON.stringify({processingRecoveryActionId:childId,parentActionId:parentId})]);
    await client.query("update assistant_conversation set updated_at=now() where user_id=$1 and id=$2",[userId,prepared.conversationId]);
  }
  await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
    values($1,$2,'processing-recovery',$3,$4,$5)`,[prepared.state.workspaceId,userId,childId,
    reused?"processing.recovery-reused":"processing.recovery-proposed",JSON.stringify({parentActionId:parentId,
      efficiency:{inputItems:1,outputItems:reused?0:1,validOutputItems:reused?0:1,savedOutputItems:reused?0:1,
        downstreamUsedItems:0,userAdoptedItems:null,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,
        latencyMs:Date.now()-started,cacheHit:reused,discardedReasonCounts:reused?{duplicateProposalAvoided:1}:{},
        utilizationEfficiency:reused?null:1,usageBoundary:"recovery-proposal-saved-not-executed",
        optimizationOpportunity:"Reuse one linked proposal and original completed work without duplicate paid requests"}})]);
  return {actionId:childId,reused,gap:prepared.scope.plan.targetCount,pendingCompanies:prepared.scope.companies.length};
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
  const evidenceReadiness=await readRecoveryEvidenceReadiness(client,userId,run.id,
    prepared.scope.companies.flatMap(company=>company.candidates));
  return {...prepared,evidenceReadiness,conversationId:parent.conversation_id};
}
