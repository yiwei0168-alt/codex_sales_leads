import type {LeadSearchPlan} from "@/lib/assistant/types";
import type {LeadWorkflowState,LeadWorkflowResult} from "./types";
import {persistenceInputFingerprint} from "./persistence-identity";
import {planSavedProcessingRecovery} from "./saved-processing-recovery-plan";

export interface SavedRecoverySnapshot {
  values:Record<string,unknown>;
  next:readonly string[];
  checkpointId:string|null;
}

/** Bind a saved result to an immutable checkpoint; do not infer missing history. */
export function validateSavedRecoverySource(input:{userId:string;actionId:string;workspaceId:string;
  threadId:string;runId:string;plan:LeadSearchPlan;result:LeadWorkflowResult;snapshot:SavedRecoverySnapshot;
  selectedDomains:string[];taskBudget:{limitMicros:string;occupiedMicros:string}|null}){
  const {snapshot}=input;
  const state=snapshot.values as unknown as LeadWorkflowState;
  if(!snapshot.checkpointId||snapshot.next.length||state.userId!==input.userId||state.actionId!==input.actionId
    ||state.workspaceId!==input.workspaceId||state.graphThreadId!==input.threadId||state.runId!==input.runId
    ||!state.result||!state.plan||persistenceInputFingerprint(state.plan)!==persistenceInputFingerprint(input.plan)
    ||persistenceInputFingerprint(state.result)!==persistenceInputFingerprint(input.result)){
    throw new Error("Saved recovery checkpoint, owner, plan or result mismatch");
  }
  if(!state.playbook||!Number.isSafeInteger(state.creditsUsed)||state.creditsUsed<0)throw new Error("Saved recovery checkpoint is incomplete");
  for(const key of ["candidates","correctedCandidates","assessments","ragContext","assessmentReviews","handoffs","modelUsage","stageMetrics","warnings"]){
    if(!Array.isArray(snapshot.values[key]))throw new Error("Saved recovery checkpoint is incomplete");
  }
  const scope=planSavedProcessingRecovery({state,result:input.result,selectedDomains:input.selectedDomains,taskBudget:input.taskBudget});
  return {scope,state:structuredClone(state),proof:{version:"saved-processing-source-v1" as const,
    checkpointId:snapshot.checkpointId,checkpointFingerprint:persistenceInputFingerprint(snapshot.values),
    resultFingerprint:persistenceInputFingerprint(input.result),selectionFingerprint:persistenceInputFingerprint(scope.selectedDomains),
    sourceActionId:input.actionId,sourceRunId:input.runId,sourceThreadId:input.threadId}};
}
