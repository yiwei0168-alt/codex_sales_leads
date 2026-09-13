import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";
import {budgetedFetch} from "./paid-fetch";
import {BudgetDeniedError,IncompleteModelOutputError} from "./policy";
import {textOutputCompletion} from "./text-output-policy";
import {embeddingOutputCompletion} from "./embedding-output-policy";
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
      const response=await withModelAttempt({...state.metadata,attempt},()=>paid(input,init));
      if(response.ok){
        if(state.metadata.task==="rag-embedding"){
          let result:unknown=null;let request:unknown=null;
          try{result=await response.clone().json();request=JSON.parse(await new Request(input,init).text());}catch{/* Fail closed on unreadable vectors. */}
          if(embeddingOutputCompletion(state.metadata.task,result,request)==="incomplete")throw new IncompleteModelOutputError();
        }
        // Retain raw finish reason before structured-output parsers discard response metadata.
        let value:unknown=null;
        if(textOutputCompletion(state.metadata.task,{})!==undefined){
          try{value=await response.clone().json();}catch{/* Incomplete/unreadable output is not accepted. */}
          if(textOutputCompletion(state.metadata.task,value)==="incomplete")throw new IncompleteModelOutputError();
        }
      }
      return response;
    }catch(error){
      if(error instanceof BudgetDeniedError)state.terminal??=error;
      throw error;
    }
  };
}
