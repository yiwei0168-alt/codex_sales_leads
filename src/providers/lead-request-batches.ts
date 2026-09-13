import type {StructuredAiRequest} from "./contracts";
import {deepSeekRequestBody} from "./deepseek-request";
import {LeadRequestTooLargeError,leadRequestByteLimit} from "./lead-request-bounds";

/** Preflight every batch before scheduling any model calls. Preserve candidates and their order. */
export function leadRequestBatches<T>(candidates:T[],requestFor:(items:T[])=>StructuredAiRequest<unknown>,maximumCompanies:number,maximumInputCharacters:number,
  requestBytes:(request:StructuredAiRequest<unknown>)=>number = request=>Buffer.byteLength(deepSeekRequestBody(request).body,"utf8")):T[][] {
  const batches:T[][]=[];
  let pending:T[]=[];
  for(const candidate of candidates){
    const proposed=[...pending,candidate];
    const request=requestFor(proposed);
    const bytes=requestBytes(request);
    const limit=leadRequestByteLimit(request);
    const tooLarge=proposed.length>maximumCompanies
      ||JSON.stringify(request.input).length>maximumInputCharacters
      ||(limit!==null&&bytes>limit);
    if(pending.length>0&&tooLarge){
      batches.push(pending);pending=[candidate];
      // No lossy truncation or paid probing of an oversized singleton.
      const singleton=requestFor(pending);
      const singletonLimit=leadRequestByteLimit(singleton);
      const singletonBytes=requestBytes(singleton);
      if(singletonLimit!==null&&singletonBytes>singletonLimit)throw new LeadRequestTooLargeError(singletonBytes,singletonLimit);
    }else{
      if(limit!==null&&bytes>limit)throw new LeadRequestTooLargeError(bytes,limit);
      pending=proposed;
    }
  }
  if(pending.length)batches.push(pending);
  return batches;
}
