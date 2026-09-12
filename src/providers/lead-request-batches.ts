import type {StructuredAiRequest} from "./contracts";
import {deepSeekRequestBody} from "./deepseek-request";
import {assertLeadRequestBytes,leadRequestByteLimit} from "./lead-request-bounds";

/** Preflight every batch before scheduling any model calls. Preserve candidates and their order. */
export function leadRequestBatches<T>(candidates:T[],requestFor:(items:T[])=>StructuredAiRequest<unknown>,maximumCompanies:number,maximumInputCharacters:number):T[][] {
  const batches:T[][]=[];
  let pending:T[]=[];
  for(const candidate of candidates){
    const proposed=[...pending,candidate];
    const request=requestFor(proposed);
    const {body}=deepSeekRequestBody(request);
    const limit=leadRequestByteLimit(request);
    const tooLarge=proposed.length>maximumCompanies
      ||JSON.stringify(request.input).length>maximumInputCharacters
      ||(limit!==null&&Buffer.byteLength(body,"utf8")>limit);
    if(pending.length>0&&tooLarge){
      batches.push(pending);pending=[candidate];
      // No lossy truncation or paid probing of an oversized singleton.
      const singleton=requestFor(pending);
      assertLeadRequestBytes(singleton,deepSeekRequestBody(singleton).body);
    }else{
      assertLeadRequestBytes(request,body);
      pending=proposed;
    }
  }
  if(pending.length)batches.push(pending);
  return batches;
}
