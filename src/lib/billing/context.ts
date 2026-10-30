import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestBound } from "./policy";
import type { CostAttribution } from "./cost-allocation";

// Server-side acceptance scopes only; never populated from an API request body.
export interface SpendContext {userId:string;operationId:string;stage:string;costAttribution?:CostAttribution;tariffPolicy?:{version:string;rules:RequestBound[]};
  durableQualificationResponses?:boolean;
  /** Server-side local acceptance only: one already stored official FX snapshot, never API input. */
  fixedFxReferenceVersion?:string;
  /** The dedicated MA24 runner pins nested paid requests to its leased run. */
  ma24EvaluationRunId?:string}
const storage=new AsyncLocalStorage<SpendContext>();
export function currentSpendContext(){return storage.getStore();}
export function setSpendStage(stage:string){const context=storage.getStore();if(context)context.stage=stage;}
export function withSpendContext<T>(context:SpendContext,run:()=>T):T{return storage.run(context,run);}
/** Isolated child scopes prevent parallel stages from overwriting attribution. */
export function withProductSpend<T>(userId:string,stage:string,run:()=>T,operationId?:string):T{
  const parent=currentSpendContext();
  if(parent&&parent.userId!==userId)throw new Error("Budget scope owner mismatch");
  if(parent?.ma24EvaluationRunId&&operationId&&operationId!==parent.ma24EvaluationRunId)
    throw new Error("MA24 evaluation spend operation drift");
  return withSpendContext({userId,stage,operationId:operationId??parent?.operationId??randomUUID(),
    ...((!operationId||operationId===parent?.operationId)&&parent?.costAttribution?{costAttribution:parent.costAttribution}:{}),
    ...(parent?.tariffPolicy?{tariffPolicy:parent.tariffPolicy}:{}),
    ...(parent?.fixedFxReferenceVersion?{fixedFxReferenceVersion:parent.fixedFxReferenceVersion}:{}),
    ...(parent?.ma24EvaluationRunId?{ma24EvaluationRunId:parent.ma24EvaluationRunId}:{})},run);
}
export function withMa24EvaluationSpend<T>(userId:string,runId:string,run:()=>T):T{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId))
    throw new Error("MA24 evaluation run identity required");
  const parent=currentSpendContext();
  if(parent&&(parent.userId!==userId||parent.ma24EvaluationRunId&&parent.ma24EvaluationRunId!==runId))
    throw new Error("MA24 evaluation spend context mismatch");
  return withSpendContext({userId,operationId:runId,stage:"main-agent-evaluation",
    ma24EvaluationRunId:runId},run);
}
