import {startOperation,finishOperation,bestEffortMetric} from "@/lib/operation-metrics";
import type {DevelopmentGenerationMetrics} from "./types";
import {withProductSpend} from "@/lib/billing/context";

export async function recordGenerationAttempt<T>(userId:string,stage:"development-generation"|"development-revision",inputCharacters:number,run:()=>Promise<T>,usage:(result:T)=>DevelopmentGenerationMetrics):Promise<T>{
  const started=Date.now();const id=await startOperation(userId,stage,1,inputCharacters);
  let result:T|undefined;let completed=false;
  try{result=await withProductSpend(userId,stage,run,id);completed=true;return result;}
  finally{const metrics=completed?usage(result as T):undefined;
    await bestEffortMetric(()=>finishOperation(userId,id,completed?"completed":"failed",{
      inputItems:1,inputCharacters,outputItems:completed?1:0,validOutputItems:completed?1:0,downstreamUsedItems:completed?1:0,
      inputTokens:metrics?.promptTokens??null,cachedInputTokens:null,outputTokens:metrics?.completionTokens??null,apiCredits:0,costUsd:metrics?.accountCashCostUsd??null,
      latencyMs:Date.now()-started,retries:null,discardedReasonCounts:completed?{}:{generationOrPersistenceFailed:1},utilizationEfficiency:completed?1:0,
      usageBoundary:"persisted-draft-not-approved-or-sent",optimizationOpportunity:"Reuse persisted output; reconcile unknown failures instead of automatic paid retries"}));}
}
