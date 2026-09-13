import {expect,it} from "vitest";
import {validateSavedRecoverySource} from "./saved-recovery-source";
import {plan,playbook,candidate,correctedCandidate} from "../../../../scripts/workflow-recovery-fixtures";
import type {LeadWorkflowResult} from "./types";
const result:LeadWorkflowResult={runId:"r",graphThreadId:"t",countryCode:plan.countryCode,countryName:plan.countryName,
  requested:plan.targetCount,accepted:0,discovered:1,assessed:0,qualified:0,creditsUsed:13,ragCitationCount:0,warnings:[],targetCompletionReason:"processing-incomplete"};
const values={userId:"u",actionId:"a",workspaceId:"w",runId:"r",graphThreadId:"t",plan,playbook,result,
  candidates:[candidate],correctedCandidates:[correctedCandidate],assessments:[],creditsUsed:13,
  ragContext:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[]};
const input={userId:"u",actionId:"a",workspaceId:"w",threadId:"t",runId:"r",plan,result,
  snapshot:{values,next:[],checkpointId:"checkpoint"},selectedDomains:[],taskBudget:null};
it("binds exact saved checkpoint and result without refreshing evidence or modifying original state",()=>{
  const before=JSON.stringify(input),prepared=validateSavedRecoverySource(input);
  expect(prepared.proof).toMatchObject({version:"saved-processing-source-v1",checkpointId:"checkpoint",sourceActionId:"a"});
  expect(prepared.scope.companies).toHaveLength(1);
  prepared.state.candidates[0].evidence=[];
  expect(JSON.stringify(input)).toBe(before);
  expect(validateSavedRecoverySource(input).proof).toEqual(prepared.proof);
});
it.each(["userId","actionId","workspaceId","threadId","runId"])("rejects mismatched %s",key=>{
  expect(()=>validateSavedRecoverySource({...input,[key]:"other"})).toThrow("mismatch");
});
it("rejects pending, unidentified, incomplete or changed source history",()=>{
  for(const snapshot of [{...input.snapshot,next:["score_candidates"]},{...input.snapshot,checkpointId:null},
    {...input.snapshot,values:{...values,plan:{...plan,targetCount:1}}},
    {...input.snapshot,values:{...values,result:{...result,creditsUsed:0}}},
    {...input.snapshot,values:{...values,playbook:undefined}},
    {...input.snapshot,values:{...values,assessments:undefined}}]){
    expect(()=>validateSavedRecoverySource({...input,snapshot})).toThrow();
  }
});
