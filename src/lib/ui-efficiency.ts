// Aggregate service event only: never send user IDs, addresses, text or credentials here.
export function uiEfficiency(stage:string,startedAt:number,inputItems:number,usedItems:number,failed=false){
  console.info(JSON.stringify({event:"workflow-efficiency",version:"ui-v1.1",stage,inputItems,validOutputItems:failed?0:usedItems,downstreamUsedItems:failed?0:usedItems,
    usageBoundary:"api-projection-or-committed-mutation",inputTokens:0,outputTokens:0,apiCredits:0,paidApiCostUsd:0,databaseCostUsd:null,
    latencyMs:Date.now()-startedAt,retries:0,discardedReasonCounts:failed?{failed:inputItems}:inputItems>usedItems?{notProjected:inputItems-usedItems}:{},
    utilizationEfficiency:inputItems?usedItems/inputItems:null,optimizationOpportunity:"Reuse persisted records; bound reads and do not regenerate for display"}));
}
