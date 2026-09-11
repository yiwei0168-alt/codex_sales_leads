import {currentSpendContext} from "./context";
import {billingPolicy,BudgetDeniedError,quoteRequest} from "./policy";
import {reservePaidCall,settlePaidCall} from "./repository";

function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function count(value:unknown):number|null{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;}
/** Install at a provider transport boundary, including every retry. No headers/body/URL query are persisted. */
export function budgetedFetch(transport:typeof fetch=fetch):typeof fetch {
  return async(input,init)=>{
    const scope=currentSpendContext();
    // CLI experiments retain their separately approved accounting. Product entry points establish a scope.
    if(!scope)return transport(input,init);
    const request=new Request(input,init);const url=new URL(request.url);
    request.signal.throwIfAborted();
    const body=await request.clone().text();let parsed:Record<string,unknown>={};
    if(body){try{parsed=object(JSON.parse(body));}catch{throw new BudgetDeniedError("request-out-of-bounds");}}
    if(parsed.stream===true)throw new BudgetDeniedError("request-out-of-bounds");
    const outputTokens=count(parsed.max_completion_tokens??parsed.max_tokens??object(parsed.generation_config).max_output_tokens);
    const bytes=Buffer.byteLength(body,"utf8")+Buffer.byteLength(url.search,"utf8");
    const rule=quoteRequest({origin:url.origin,pathname:url.pathname,model:typeof parsed.model==="string"?parsed.model:"",requestBytes:bytes,outputTokens});
    const id=await reservePaidCall(scope.userId,{operationId:scope.operationId,stage:scope.stage,tariffKey:rule.key,tariffVersion:billingPolicy.version,maximumChargeMicros:rule.maximumChargeMicros,requestBytes:bytes});
    const started=Date.now();let response:Response;
    try{response=await transport(input,{...init,redirect:"error"});}catch(error){
      await settlePaidCall(scope.userId,id,{reportedMicros:null,latencyMs:Date.now()-started,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false}).catch(()=>undefined);
      throw error;
    }
    // Accounting failure cannot turn successful paid work into a retry. Reservation remains occupied.
    try{
      const text=await response.clone().text();let result:Record<string,unknown>={};try{result=object(JSON.parse(text));}catch{}
      const usage=object(result.usage);const reported=typeof usage.cost==="number"&&Number.isFinite(usage.cost)&&usage.cost>=0?Math.ceil(usage.cost*1000000):null;
      await settlePaidCall(scope.userId,id,{reportedMicros:reported,latencyMs:Date.now()-started,responseBytes:Buffer.byteLength(text,"utf8"),inputTokens:count(usage.prompt_tokens??usage.input_tokens),outputTokens:count(usage.completion_tokens??usage.output_tokens),succeeded:response.ok});
    }catch{console.warn(JSON.stringify({event:"budget-settlement-unavailable",reservationRetained:true,retry:false}));}
    return response;
  };
}
