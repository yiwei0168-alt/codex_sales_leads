import {startOperation,finishOperation,bestEffortMetric,type OperationMetrics} from "./operation-metrics";
import {currentSpendContext,withProductSpend} from "./billing/context";
type Outcome=Pick<OperationMetrics,"outputItems"|"validOutputItems"|"downstreamUsedItems"|"usageBoundary"|"optimizationOpportunity">&Partial<Pick<OperationMetrics,"costUsd"|"inputTokens"|"outputTokens"|"retries"|"discardedReasonCounts">>;
/** Only aggregate projections, never result bodies. HTTP billing is a separate, overlapping ledger. */
export async function trackedOperation<T>(userId:string,stage:string,inputItems:number,inputCharacters:number,run:()=>Promise<T>,describe:(value:T)=>Outcome):Promise<T>{
  const parent=currentSpendContext();
  return withProductSpend(userId,stage,async()=>{
    const started=Date.now(),id=await startOperation(userId,stage,inputItems,inputCharacters);
    let result:T|undefined,completed=false;
    // Nested metrics get their own row, but cannot escape the enclosing task's spend ceiling.
    try{result=await withProductSpend(userId,stage,run,parent?.operationId??id);completed=true;return result;}
    finally{await bestEffortMetric(async()=>{
      const outcome=completed?describe(result as T):undefined;
      await finishOperation(userId,id,completed?"completed":"failed",{
        inputItems,inputCharacters,outputItems:outcome?.outputItems??0,validOutputItems:outcome?.validOutputItems??0,
        downstreamUsedItems:outcome?.downstreamUsedItems??null,inputTokens:outcome?.inputTokens??null,
        cachedInputTokens:null,outputTokens:outcome?.outputTokens??null,apiCredits:null,costUsd:outcome?.costUsd??null,
        latencyMs:Date.now()-started,retries:outcome?.retries??null,
        discardedReasonCounts:outcome?.discardedReasonCounts??(completed?{}:{operationFailed:1}),
        utilizationEfficiency:outcome&&outcome.outputItems>0?outcome.validOutputItems/outcome.outputItems:null,
        usageBoundary:outcome?.usageBoundary??"failed-or-unsettled-operation-not-zero-cost",
        optimizationOpportunity:outcome?.optimizationOpportunity??"Inspect existing output and transport accounting before an explicit retry",
      });
    });}
  });
}
