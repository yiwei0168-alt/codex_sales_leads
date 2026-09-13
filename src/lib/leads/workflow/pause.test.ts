import { expect,it } from "vitest";
import { checkpointInvocation } from "./pause";
import type { LeadSearchPlan } from "@/lib/assistant/types";
const plan:LeadSearchPlan={countryCode:'CO',countryName:'Colombia',objective:'new-market',roles:['SI'],targetCount:1,queryLanguage:'es',userRequest:'Find one SI'};
it("checks the original plan before resuming or returning completed work",()=>{
  for(const next of [[],['score_candidates']]){
    const snapshot={values:{userId:'u',actionId:'a',plan,result:{}},next};
    expect(checkpointInvocation(snapshot,'u','a',{...plan})).toBe(next.length?'resume':'complete');
    for(const changed of [{...plan,countryCode:'MX'},{...plan,targetCount:2},{...plan,roles:['MSP'] as LeadSearchPlan['roles']},
      {...plan,userRequest:'Different request'},{...plan,verifiedOnly:true}]){
      expect(()=>checkpointInvocation(snapshot,'u','a',changed)).toThrow('plan mismatch');
    }
    expect(()=>checkpointInvocation({...snapshot,values:{...snapshot.values,plan:undefined}},'u','a',plan)).toThrow('plan mismatch');
  }
});
it("starts only when no checkpoint exists",()=>expect(checkpointInvocation({values:{}},"u","a")).toBe("fresh"));
it("resumes pending stages without resetting prior paid results",()=>expect(checkpointInvocation({values:{userId:"u",actionId:"a",creditsUsed:20},next:["score_candidates"]},"u","a")).toBe("resume"));
it("reuses a completed checkpoint after receipt persistence failure",()=>expect(checkpointInvocation({values:{userId:"u",actionId:"a",result:{}},next:[]},"u","a")).toBe("complete"));
it("rejects foreign checkpoints and incomplete terminal state",()=>{
  expect(()=>checkpointInvocation({values:{userId:"other",actionId:"a"},next:["score"]},"u","a")).toThrow("ownership");
  expect(()=>checkpointInvocation({values:{userId:"u",actionId:"a"},next:[]},"u","a")).toThrow("no resumable");
});
