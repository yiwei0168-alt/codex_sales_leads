import type { IntentPlan } from "./types";
import type { OperationMetrics } from "@/lib/operation-metrics";
export function intentMetrics(plan:IntentPlan|undefined,inputItems:number,inputCharacters:number,latencyMs:number):OperationMetrics{
  const calls=plan?.plannerCalls??[];
  const known=calls.length>0&&calls.every(call=>call.usageAvailable===true);
  const sum=(key:"inputTokens"|"cachedInputTokens"|"outputTokens")=>known?calls.reduce((total,call)=>total+call[key],0):null;
  const failed=calls.filter(call=>call.succeeded===false).length;
  return {inputItems,inputCharacters,outputItems:plan?1:0,validOutputItems:plan?1:0,downstreamUsedItems:plan?1:0,
    inputTokens:sum("inputTokens"),cachedInputTokens:sum("cachedInputTokens"),outputTokens:sum("outputTokens"),
    apiCredits:0,costUsd:null,latencyMs,retries:calls.length?calls.reduce((total,call)=>total+call.retries,0):null,
    discardedReasonCounts:failed?{failedModelCalls:failed}:{},utilizationEfficiency:calls.length?(calls.filter(call=>call.succeeded===true).length/calls.length):null,
    usageBoundary:"intent-consumed-by-router-not-final-delivery",optimizationOpportunity:failed?"Investigate failed calls before changing model capacity":"Reuse standard plans; retain one lightweight multi-turn intent call",
    modelCalls:calls.map(call=>({requestedModel:call.requestedModel,actualModel:call.actualModel,inputTokens:call.usageAvailable?call.inputTokens:null,cachedInputTokens:call.usageAvailable?call.cachedInputTokens:null,outputTokens:call.usageAvailable?call.outputTokens:null,latencyMs:call.latencyMs,attempts:call.attempts,retries:call.retries,succeeded:call.succeeded??null}))};
}
