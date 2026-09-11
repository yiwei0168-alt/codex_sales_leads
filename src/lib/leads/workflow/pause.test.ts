import { expect,it } from "vitest";
import { checkpointInvocation } from "./pause";
it("starts only when no checkpoint exists",()=>expect(checkpointInvocation({values:{}},"u","a")).toBe("fresh"));
it("resumes pending stages without resetting prior paid results",()=>expect(checkpointInvocation({values:{userId:"u",actionId:"a",creditsUsed:20},next:["score_candidates"]},"u","a")).toBe("resume"));
it("reuses a completed checkpoint after receipt persistence failure",()=>expect(checkpointInvocation({values:{userId:"u",actionId:"a",result:{}},next:[]},"u","a")).toBe("complete"));
it("rejects foreign checkpoints and incomplete terminal state",()=>{
  expect(()=>checkpointInvocation({values:{userId:"other",actionId:"a"},next:["score"]},"u","a")).toThrow("ownership");
  expect(()=>checkpointInvocation({values:{userId:"u",actionId:"a"},next:[]},"u","a")).toThrow("no resumable");
});
