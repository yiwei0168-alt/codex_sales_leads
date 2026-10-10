import { OpenRouterRequestError } from '@/providers/openrouter-batch';
import { ModelWaitError } from './model-stream';
export class ModeModelsUnavailable extends Error {constructor(){super('Mode model routes exhausted or require reconciliation');}}
export function modeFailureCode(error:unknown):string {
  if(error instanceof ModelWaitError)return `timeout-${error.kind}`;
  if(error instanceof OpenRouterRequestError)return `http-${error.status}`;
  return mayFallback(error)?'connection-failed':'requires-reconciliation-or-configuration';
}
export function mayFallback(error:unknown):boolean{
  if(error instanceof ModelWaitError)return true;
  if(error instanceof OpenRouterRequestError)return [429,500,502,503,504].includes(error.status);
  const e=error as {code?:string;cause?:{code?:string}}|null;
  return ['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT'].includes(e?.code??e?.cause?.code??'');
}
/** Journal owns attempts. Recovery never repeats an already-started route. */
export async function orderedModeDecision<T>(deps:{
  begin:(index:number)=>Promise<{id:string;fresh:boolean;output?:{status:string;data?:unknown}|null}>;
  request:(index:number)=>Promise<T>;
  save:(id:string,index:number,value:{status:'success';value:T}|{status:'unavailable';retryable:boolean;reason:string})=>Promise<void>;
}):Promise<T>{
  for(let index=0;index<3;index++){
    const prior=await deps.begin(index);
    if(prior.output?.status==='success')return (prior.output.data as {value:T}).value;
    if(!prior.fresh){
      if(prior.output?.status==='unavailable'&&(prior.output.data as {retryable?:boolean}|undefined)?.retryable===true)continue;
      throw new ModeModelsUnavailable();
    }
    let value:T;
    try{value=await deps.request(index);}catch(error){
      const retryable=mayFallback(error);await deps.save(prior.id,index,{status:'unavailable',retryable,reason:modeFailureCode(error)});
      if(retryable)continue;throw error;
    }
    // Persistence failure must never trigger another model or repeat paid work.
    await deps.save(prior.id,index,{status:'success',value});return value;
  }
  throw new ModeModelsUnavailable();
}
