import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";

export interface ModelAttemptContext {
  invocationId:string;
  provider:string;
  task:string;
  promptVersion:string;
  attempt:number;
  scoringVersion?:string;
  outputCompletionTask?:string;
}
const storage=new AsyncLocalStorage<ModelAttemptContext>();
export function withModelAttempt<T>(context:ModelAttemptContext,run:()=>T):T {
  return storage.run(context,run);
}
export function currentModelAttempt(){return storage.getStore();}
/** Create inside one logical native-provider invocation, not once per shared client. */
export function modelAttemptSequence(metadata:Omit<ModelAttemptContext,"invocationId"|"attempt">){
  const invocationId=randomUUID();let attempt=0;
  return <T>(run:()=>T):T=>withModelAttempt({...metadata,invocationId,attempt:++attempt},run);
}
export function requestScoringVersion(input:unknown):string|undefined{
  if(!input||typeof input!=="object"||!("scoringRubric" in input))return undefined;
  const rubric=input.scoringRubric;
  if(!rubric||typeof rubric!=="object"||!("policy" in rubric))return undefined;
  const policy=rubric.policy;
  return policy&&typeof policy==="object"&&"version" in policy?metricIdentifier(policy.version)??undefined:undefined;
}

/** Only accept identifiers, never arbitrary response text or a raw request. */
export function metricIdentifier(value:unknown):string|null {
  return typeof value==="string"&&/^[a-zA-Z0-9_./:@+-]{1,200}$/.test(value)?value:null;
}
