import {bestEffortMetric,startOperation,finishOperation} from "@/lib/operation-metrics";
import type {SpendContext} from "./context";
import type {BudgetDeniedError} from "./policy";

/** A blocked HTTP attempt cost zero; earlier attempts in the operation may not have. */
export async function recordBudgetDenial(scope:SpendContext,error:BudgetDeniedError,latencyMs:number){
  await bestEffortMetric(async()=>{
    const id=await startOperation(scope.userId,`budget-denied:${scope.stage}`,1,0);
    await finishOperation(scope.userId,id,"failed",{
      inputItems:1,inputCharacters:0,outputItems:0,validOutputItems:0,downstreamUsedItems:0,
      inputTokens:0,cachedInputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,
      latencyMs,retries:0,discardedReasonCounts:{[error.code]:1},utilizationEfficiency:0,
      usageBoundary:"blocked-http-attempt-only-not-entire-operation",
      optimizationOpportunity:"Correct verified request bounds or review the budget; never retry a budget denial",
    });
  });
}
