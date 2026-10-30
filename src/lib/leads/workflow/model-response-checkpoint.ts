import{isDeepStrictEqual}from"node:util";
import{currentSpendContext}from"@/lib/billing/context";
import{BudgetDeniedError}from"@/lib/billing/policy";
import{tenantQuery}from"@/lib/rag/db";
import{checkResponseEncryptionKey,sealModelResponse,openModelResponse}from"./response-checkpoint-crypto";

/** Only the owned lead workflow opts in. No request bodies or credentials are stored. */
export async function qualificationResponseCheckpoint(task:string,fingerprint:string){
 const scope=currentSpendContext();
 if(!scope?.durableQualificationResponses||task!=="lead-qualification")return null;
 try{
  if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error("Invalid checkpoint identity");
  checkResponseEncryptionKey(scope.userId);
  const owned=await tenantQuery(scope.userId,"select id from assistant_action where id=$1 and user_id=$2 and action_type='lead-search'",[scope.operationId,scope.userId]);
  if(owned.length!==1)throw Error("Response checkpoint owner mismatch");
 }catch{throw new BudgetDeniedError("paid-request-already-recorded");}
 const binding=JSON.stringify(["lead-response-v1",scope.userId,scope.operationId,task,fingerprint]);
 async function load():Promise<unknown|null>{
  try{const rows=await tenantQuery<{response_ciphertext:string}>(scope!.userId,`select response_ciphertext from lead_model_response_checkpoint
   where user_id=$1 and action_id=$2 and task=$3 and request_fingerprint=$4`,[scope!.userId,scope!.operationId,task,fingerprint]);
   return rows[0]?openModelResponse(scope!.userId,binding,rows[0].response_ciphertext):null;
  }catch{throw new BudgetDeniedError("paid-request-already-recorded");}
 }
 return{load,async save(value:unknown){
  try{await tenantQuery(scope!.userId,`insert into lead_model_response_checkpoint(user_id,action_id,task,request_fingerprint,response_ciphertext)
   values($1,$2,$3,$4,$5) on conflict do nothing`,[scope!.userId,scope!.operationId,task,fingerprint,sealModelResponse(scope!.userId,binding,value)]);
   if(!isDeepStrictEqual(await load(),value))throw Error("Response checkpoint conflict");
  }catch{throw new BudgetDeniedError("paid-request-already-recorded");}
 }};
}
