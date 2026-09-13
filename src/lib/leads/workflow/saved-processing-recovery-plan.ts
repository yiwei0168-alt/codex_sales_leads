import {normalizedCompanyDomain} from "./candidate-registry";
import {processingRecoveryWork} from "./processing-recovery";
import {routeCorrectedCandidates} from "./candidate-routing";
import type {LeadWorkflowCandidate,LeadWorkflowState,LeadWorkflowResult} from "./types";

export interface RecoveryCompany {
  domain:string;
  stage:"correction"|"scoring";
  sourceCandidateIds:string[];
  candidates:LeadWorkflowCandidate[];
}

/** Prepares a reviewable recovery scope only. No new company discovery, inference, or mutation. */
export function planSavedProcessingRecovery(input:{state:LeadWorkflowState;result:LeadWorkflowResult;
  selectedDomains:string[];taskBudget:{limitMicros:string;occupiedMicros:string}|null}){
  const {state,result}=input;
  if(result.graphThreadId!==state.graphThreadId||result.runId!==state.runId
    ||result.countryCode!==state.plan.countryCode||result.requested!==state.plan.targetCount
    ||!Number.isSafeInteger(result.accepted)||result.accepted<0||result.accepted>=result.requested) {
    throw new Error("Original recovery scope or saved count is incomplete or inconsistent");
  }
  if(!["processing-incomplete","role-unresolved"].includes(result.targetCompletionReason??""))throw new Error("Original result is not an incomplete-processing result");
  for(const items of [state.candidates,state.correctedCandidates]){
    if(new Set(items.map(item=>item.candidateId)).size!==items.length)throw new Error("Recovery source candidate identity collision");
  }
  const domain=(value:string)=>{
    const key=normalizedCompanyDomain(value.includes("://")?value:`https://${value}/`);
    if(!key)throw new Error("Recovery company identity is ambiguous");
    return key;
  };
  const selected=new Set(input.selectedDomains.map(domain));
  if(selected.size!==result.accepted||selected.size!==input.selectedDomains.length)throw new Error("Saved selection identities do not reconcile with accepted count");
  const companies=new Map<string,RecoveryCompany>();
  const add=(candidate:LeadWorkflowCandidate,stage:RecoveryCompany["stage"])=>{
    const key=domain(candidate.domain);
    if(selected.has(key))return;
    const company=companies.get(key)??{domain:key,stage,sourceCandidateIds:[],candidates:[]};
    if(stage==="correction")company.stage="correction";
    if(!company.sourceCandidateIds.includes(candidate.candidateId)){
      company.sourceCandidateIds.push(candidate.candidateId);company.candidates.push(candidate);
    }
    companies.set(key,company);
  };
  for(const candidate of processingRecoveryWork(state).candidates)add(candidate,"correction");
  const routed=routeCorrectedCandidates(state.correctedCandidates,state.plan,state.assessments);
  const byId=new Map(state.correctedCandidates.map(candidate=>[candidate.candidateId,candidate]));
  for(const route of routed.routes){
    if(route.status==="pending-role")add(byId.get(route.candidateId)!,"correction");
  }
  for(const candidate of routed.queued){
    if(!state.assessments.some(assessment=>assessment.candidateId===candidate.candidateId&&assessment.scoringStatus==="completed"))add(candidate,"scoring");
  }
  if(!companies.size)throw new Error("No uncompleted company remains outside the saved selection");
  let remainingTaskBudgetMicros:string|null=null;
  if(input.taskBudget){
    const {limitMicros,occupiedMicros}=input.taskBudget;
    if(!/^\d{1,13}$/.test(limitMicros)||!/^\d{1,13}$/.test(occupiedMicros)
      ||BigInt(limitMicros)>BigInt(1_000_000_000_000)||BigInt(occupiedMicros)>BigInt(1_000_000_000_000))throw new Error("Original task budget observation is invalid");
    const remaining=BigInt(limitMicros)-BigInt(occupiedMicros);
    remainingTaskBudgetMicros=(remaining>BigInt(0)?remaining:BigInt(0)).toString();
  }
  return {sourceActionId:state.actionId,sourceRunId:result.runId,sourceThreadId:state.graphThreadId,
    plan:{...structuredClone(state.plan),targetCount:result.requested-result.accepted},
    companies:structuredClone([...companies.values()]),selectedDomains:[...selected].sort(),remainingTaskBudgetMicros,
    originalAcceptedCount:result.accepted,discoveryAllowed:false as const};
}
