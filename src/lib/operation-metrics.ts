import { randomUUID } from "node:crypto";
import { tenantQuery } from "@/lib/rag/db";

export interface OperationMetrics {
  inputItems:number; inputCharacters:number; outputItems:number; validOutputItems:number;
  downstreamUsedItems:number|null; inputTokens:number|null; cachedInputTokens:number|null;
  outputTokens:number|null; apiCredits:number|null; costUsd:number|null; latencyMs:number;
  retries:number|null; discardedReasonCounts:Record<string,number>;
  utilizationEfficiency:number|null; usageBoundary:string; optimizationOpportunity:string;
  modelCalls?:Array<{requestedModel:string;actualModel:string;inputTokens:number|null;cachedInputTokens:number|null;outputTokens:number|null;latencyMs:number;attempts:number;retries:number;succeeded:boolean|null}>;
}

/** Allow-listed aggregates only. Never persist raw requests, outputs, errors or credentials. */
export async function startOperation(userId:string,stage:string,inputItems:number,inputCharacters:number){
  const id=randomUUID();
  await tenantQuery(userId,"insert into product_operation_metric(id,user_id,stage,status,metrics) values($1,$2,$3,'running',$4)",
    [id,userId,stage,JSON.stringify({inputItems,inputCharacters,costUsd:null,usageBoundary:"in-progress-unsettled"})]);
  return id;
}
export async function finishOperation(userId:string,id:string,status:"completed"|"failed",metrics:OperationMetrics){
  await tenantQuery(userId,"update product_operation_metric set status=$3,metrics=$4,updated_at=now() where user_id=$1 and id=$2 and status='running'",[userId,id,status,JSON.stringify(metrics)]);
}
/** Meter writes cannot turn a completed paid operation into a replayable failure. */
export async function bestEffortMetric(write:()=>Promise<unknown>):Promise<boolean>{
  try{await write();return true;}catch{console.warn(JSON.stringify({event:"operation-metric-write-failed",costState:"unknown-not-zero",retry:false}));return false;}
}
