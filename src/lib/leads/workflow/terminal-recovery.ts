import {tenantQuery} from "@/lib/rag/db";
import {processingRecoveryWork} from "./processing-recovery";
import {routeCorrectedCandidates} from "./candidate-routing";
import type {LeadWorkflowState} from "./types";

/** Only explicit incomplete processing with retained inputs; unknown terminal history is not inferred. */
export function canRecoverUnpersistedTerminal(values:Record<string,unknown>):boolean {
  if(values.result||values.targetCompletionReason!=="processing-incomplete"||!values.plan||!values.playbook
    ||typeof values.runId!=="string"||typeof values.workspaceId!=="string"
    ||!Number.isSafeInteger(values.creditsUsed)||Number(values.creditsUsed)<0)return false;
  for(const key of ["candidates","correctedCandidates","assessments","ragContext","assessmentReviews","handoffs","modelUsage","stageMetrics","warnings"]){
    if(!Array.isArray(values[key]))return false;
  }
  try {
    const state=values as unknown as LeadWorkflowState;
    if(processingRecoveryWork(state).candidates.length)return true;
    return routeCorrectedCandidates(state.correctedCandidates,state.plan,state.assessments).queued.some(candidate=>
      !state.assessments.some(assessment=>assessment.candidateId===candidate.candidateId&&assessment.scoringStatus==="completed"));
  }catch{return false;}
}

/** Never reuse this path to rewrite a run that already saved any business assessment. */
export async function assertTerminalRunUnpersisted(userId:string,actionId:string,threadId:string,state:LeadWorkflowState){
  const rows=await tenantQuery(userId,`select r.id from lead_search_run r join market_workspace w on w.id=r.workspace_id
    where r.id=$1 and r.workspace_id=$2 and w.owner_id=$3 and r.country_code=$4
      and r.metadata->>'assistantActionId'=$5 and r.metadata->>'graphThreadId'=$6
      and r.status<>'completed' and not(r.metadata ? 'deliveryCounts') and not(r.metadata ? 'persistenceInputFingerprint')
      and not exists(select 1 from lead_candidate_assessment a where a.run_id=r.id)
      and exists(select 1 from assistant_action a where a.id=$5::uuid and a.user_id=$3 and a.result='{}'::jsonb)`,
    [state.runId,state.workspaceId,userId,state.plan.countryCode,actionId,threadId]);
  if(rows.length!==1)throw new Error("Terminal recovery requires an unpersisted original run; preserve saved or ambiguous history");
}
