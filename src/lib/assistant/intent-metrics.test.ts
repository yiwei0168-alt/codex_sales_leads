import { expect,it } from "vitest";
import { intentMetrics } from "./intent-metrics";
import type { IntentPlan } from "./types";
const plan:IntentPlan={intent:"general",confidence:0.9,externalQuestions:[],plannerSource:"kimi-light",plannerModel:"test",warnings:[],plannerCalls:[{requestedModel:"test",actualModel:"test",inputTokens:20,cachedInputTokens:4,outputTokens:5,totalTokens:25,latencyMs:80,attempts:2,retries:1,usageAvailable:true,succeeded:true}]};
it("preserves usage and retries but never fabricates a cash price",()=>{
  expect(intentMetrics(plan,2,60,100)).toMatchObject({inputTokens:20,cachedInputTokens:4,outputTokens:5,retries:1,costUsd:null,downstreamUsedItems:1});
});
it("retains partial call usage and unknown aggregate for a failed unmetered attempt",()=>{
  const result=intentMetrics({...plan,plannerCalls:[...plan.plannerCalls!,{...plan.plannerCalls![0],usageAvailable:false,succeeded:false,failureReason:"private error must not appear"}]},2,60,180);
  expect(result.inputTokens).toBeNull();expect(result.modelCalls?.[0].inputTokens).toBe(20);expect(result.modelCalls?.[1].inputTokens).toBeNull();expect(JSON.stringify(result)).not.toContain("private error");expect(result.discardedReasonCounts).toEqual({failedModelCalls:1});
});
it("does not label missing usage zero",()=>{expect(intentMetrics(undefined,1,10,50)).toMatchObject({costUsd:null,inputTokens:null,retries:null,validOutputItems:0});});
