import {expect,it} from "vitest";
import {canRecoverUnpersistedTerminal} from "./terminal-recovery";
import {checkpointInvocation} from "./pause";
import {plan,playbook,candidate,correctedCandidate,assessment} from "../../../../scripts/workflow-recovery-fixtures";
const state={userId:"u",actionId:"a",workspaceId:"w",runId:"r",plan,playbook,candidates:[candidate],correctedCandidates:[correctedCandidate],
  assessments:[],creditsUsed:13,ragContext:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[],targetCompletionReason:"processing-incomplete"};
it("recognizes explicit terminal missing work with retained original inputs only",()=>{
  expect(checkpointInvocation({values:state,next:[]},"u","a",plan)).toBe("recover-terminal");
  expect(canRecoverUnpersistedTerminal({...state,correctedCandidates:[]})).toBe(true);
  for(const changed of [{...state,assessments:[assessment]},{...state,result:{}},{...state,playbook:undefined},
    {...state,targetCompletionReason:undefined},{...state,targetCompletionReason:"role-unresolved"},{...state,creditsUsed:undefined},
    {...state,modelUsage:undefined}])expect(canRecoverUnpersistedTerminal(changed)).toBe(false);
  expect(()=>checkpointInvocation({values:state,next:[]},"other","a",plan)).toThrow("ownership");
  expect(()=>checkpointInvocation({values:state,next:[]},"u","a",{...plan,countryCode:"MX"})).toThrow("plan mismatch");
});
