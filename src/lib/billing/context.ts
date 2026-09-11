import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface SpendContext {userId:string;operationId:string;stage:string}
const storage=new AsyncLocalStorage<SpendContext>();
export function currentSpendContext(){return storage.getStore();}
export function setSpendStage(stage:string){const context=storage.getStore();if(context)context.stage=stage;}
export function withSpendContext<T>(context:SpendContext,run:()=>T):T{return storage.run(context,run);}
/** Isolated child scopes prevent parallel stages from overwriting attribution. */
export function withProductSpend<T>(userId:string,stage:string,run:()=>T,operationId?:string):T{
  const parent=currentSpendContext();
  if(parent&&parent.userId!==userId)throw new Error("Budget scope owner mismatch");
  return withSpendContext({userId,stage,operationId:operationId??parent?.operationId??randomUUID()},run);
}
