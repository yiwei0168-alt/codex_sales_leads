import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";
import {budgetedFetch} from "./paid-fetch";
import {BudgetDeniedError} from "./policy";
import {withModelAttempt, type ModelAttemptContext} from "./model-attempt-context";

type Invocation = {
  metadata:Omit<ModelAttemptContext,"attempt">;
  attempts:number;
  terminal:BudgetDeniedError|null;
};
const storage=new AsyncLocalStorage<Invocation>();

/** SDKs may wrap transport errors and retry them. Keep the original stop outside the SDK. */
export async function withSdkModelCall<T>(
  metadata:Omit<ModelAttemptContext,"attempt"|"invocationId">,
  run:()=>Promise<T>,
):Promise<T>{
  const state:Invocation={metadata:{...metadata,invocationId:randomUUID()},attempts:0,terminal:null};
  return storage.run(state,async()=>{
    try{
      const result=await run();
      if(state.terminal)throw state.terminal;
      return result;
    }catch(error){throw state.terminal??error;}
  });
}

/** Use only as an SDK transport; no metadata is added to the wire body or headers. */
export function sdkModelFetch(transport:typeof fetch=fetch):typeof fetch{
  const paid=budgetedFetch(transport);
  return async(input,init)=>{
    const state=storage.getStore();
    if(!state)return paid(input,init);
    if(state.terminal)throw state.terminal;
    const attempt=++state.attempts;
    try{
      return await withModelAttempt({...state.metadata,attempt},()=>paid(input,init));
    }catch(error){
      if(error instanceof BudgetDeniedError)state.terminal??=error;
      throw error;
    }
  };
}
