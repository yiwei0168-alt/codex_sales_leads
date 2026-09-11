import { AsyncLocalStorage } from "node:async_hooks";

export interface SpendContext {userId:string;operationId:string;stage:string}
const storage=new AsyncLocalStorage<SpendContext>();
export function currentSpendContext(){return storage.getStore();}
export function setSpendStage(stage:string){const context=storage.getStore();if(context)context.stage=stage;}
export function withSpendContext<T>(context:SpendContext,run:()=>T):T{return storage.run(context,run);}
