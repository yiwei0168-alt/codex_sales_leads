import {expect,it} from "vitest";
import {planSavedProcessingRecovery} from "./saved-processing-recovery-plan";
import {plan,playbook,candidate,correctedCandidate,assessment} from "../../../../scripts/workflow-recovery-fixtures";
import type {LeadWorkflowState,LeadWorkflowResult} from "./types";
const state:LeadWorkflowState={userId:"u",actionId:"a",workspaceId:"w",runId:"r",graphThreadId:"t",plan,playbook,
  phase:"completed",candidates:[candidate],correctedCandidates:[correctedCandidate],assessments:[],creditsUsed:13,
  ragContext:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[]};
const result:LeadWorkflowResult={runId:"r",graphThreadId:"t",countryCode:plan.countryCode,countryName:plan.countryName,
  requested:plan.targetCount,accepted:1,discovered:2,assessed:1,qualified:1,creditsUsed:13,ragCitationCount:0,warnings:[],targetCompletionReason:"processing-incomplete"};
const input={state,result,selectedDomains:["already-saved.example.com"],taskBudget:{limitMicros:"30000000",occupiedMicros:"12324404"}};
it("preserves completed correction, original scope and costs while preparing only missing scoring",()=>{
  const before=JSON.stringify(input);const recovery=planSavedProcessingRecovery(input);
  expect(recovery.companies.map(item=>[item.domain,item.stage])).toEqual([[candidate.domain,"scoring"]]);
  expect(recovery.plan).toEqual({...plan,targetCount:plan.targetCount-1});
  expect(recovery.remainingTaskBudgetMicros).toBe("17675596");expect(recovery.discoveryAllowed).toBe(false);
  expect(JSON.stringify(input)).toBe(before);
  recovery.companies[0].candidates[0].companyName="Changed child";
  expect(JSON.stringify(input)).toBe(before);
});
it("keeps missing correction recoverable and rejects duplicate source identity",()=>{
  expect(planSavedProcessingRecovery({...input,state:{...state,correctedCandidates:[]}}).companies[0].stage).toBe("correction");
  expect(()=>planSavedProcessingRecovery({...input,state:{...state,candidates:[candidate,candidate]}})).toThrow("identity collision");
});
it("retains all conflicting role sources within one company rather than counting duplicates",()=>{
  const conflict={...correctedCandidate,candidateId:"conflict",correction:{...correctedCandidate.correction,
    resolvedRoles:["SI" as const],resolvedFamilies:["services" as const],primaryRole:"SI" as const,primaryFamily:"services" as const}};
  const recovery=planSavedProcessingRecovery({...input,state:{...state,correctedCandidates:[correctedCandidate,conflict]},result:{...result,targetCompletionReason:"role-unresolved"}});
  expect(recovery.companies).toHaveLength(1);expect(recovery.companies[0].stage).toBe("correction");
  expect(recovery.companies[0].sourceCandidateIds).toEqual([candidate.candidateId,"conflict"]);
});
it("never fills recovery with completed, out-of-scope, or already-selected companies",()=>{
  expect(()=>planSavedProcessingRecovery({...input,state:{...state,assessments:[assessment]}})).toThrow("No uncompleted company");
  expect(()=>planSavedProcessingRecovery({...input,state:{...state,plan:{...plan,roles:["SI"]}}})).toThrow("No uncompleted company");
  expect(()=>planSavedProcessingRecovery({...input,selectedDomains:[candidate.domain]})).toThrow("No uncompleted company");
});
it("rejects mismatched history and distinguishes an exhausted task limit from no task limit",()=>{
  for(const patch of [{countryCode:"MX"},{accepted:undefined},{runId:"other"},{requested:1},{targetCompletionReason:"maximum-rounds"}]){
    expect(()=>planSavedProcessingRecovery({...input,result:{...result,...patch} as LeadWorkflowResult})).toThrow();
  }
  expect(()=>planSavedProcessingRecovery({...input,selectedDomains:[]})).toThrow("do not reconcile");
  expect(planSavedProcessingRecovery({...input,taskBudget:null}).remainingTaskBudgetMicros).toBeNull();
  expect(planSavedProcessingRecovery({...input,taskBudget:{limitMicros:"7",occupiedMicros:"7"}}).remainingTaskBudgetMicros).toBe("0");
});
