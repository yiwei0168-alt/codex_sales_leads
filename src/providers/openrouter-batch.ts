import { z } from "zod";
import {getOpenRouterConfig,openRouterRequestHeaders} from "./openrouter";

export const batchIdSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
export const batchResponseSchema=z.object({
  id:batchIdSchema,model:z.string(),endpoint:z.literal("/v1/chat/completions"),
  status:z.enum(["validating","in_progress","finalizing","completed","failed","expired","cancelling","cancelled"]),
  request_counts:z.object({total:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),failed:z.number().int().nonnegative()}),
  usage:z.object({prompt_tokens:z.number().nonnegative().optional(),completion_tokens:z.number().nonnegative().optional(),cost:z.number().nonnegative().optional(),is_byok:z.boolean().optional()}).nullable().optional(),
  results:z.array(z.object({custom_id:z.string(),response:z.object({status_code:z.number().int(),body:z.unknown()}).nullable().optional(),error:z.unknown().optional()})).nullable().optional(),
  error:z.unknown().optional(),
});
export type OpenRouterBatch=z.infer<typeof batchResponseSchema>;
export function matchesBatchModel(reported:string,configured:string) {
  const expected=configured.replace(/:batch$/,"");
  // OpenRouter resolves public aliases to dated canonical model IDs. Accept
  // only the same family plus a date, never a different model/variant prefix.
  if(reported===expected||reported===configured)return true;
  return reported.startsWith(`${expected}-`)&&/^(?:\d{8}|\d{4}-\d{2}-\d{2})(?::batch)?$/.test(reported.slice(expected.length+1));
}
export class BatchAdmissionResponseError extends Error {
  constructor(readonly remoteId:string){super("Batch acknowledgement schema changed; saved identity must be reconciled");}
}
export class OpenRouterRequestError extends Error {
  constructor(readonly status:number,readonly reason:"region-unavailable"|"request-rejected"|"provider-unavailable") {super(`OpenRouter HTTP ${status}: ${reason}`);}
}
export async function assertOpenRouterResponse(response:Response) {
  if(response.ok)return;
  const body=await response.json().catch(()=>null);
  // Raw provider bodies may echo task contents. Only retain classified codes.
  const region=response.status===403&&typeof body?.error?.message==="string"&&/not available in your region/i.test(body.error.message);
  throw new OpenRouterRequestError(response.status,region?"region-unavailable":response.status>=500?"provider-unavailable":"request-rejected");
}
export function batchPayload(model:string,provider:string,customId:string,body:Record<string,unknown>) {
  if(!model.endsWith(":batch")||!/^[-a-z0-9._/]+:batch$/i.test(model)||!/^[-a-z0-9._/]+$/i.test(provider))throw new Error("Explicit batch model/provider required");
  // Field order is part of OpenRouter's streaming submission contract.
  return {endpoint:"/v1/chat/completions",model:model.slice(0,-6),provider:{only:[provider]},completion_window:"24h",requests:[{custom_id:customId,body}]};
}
export async function submitOpenRouterBatch(payload:ReturnType<typeof batchPayload>,transport:typeof fetch=fetch) {
  const route=getOpenRouterConfig();
  const response=await transport(`${route.baseUrl}/batches`,{method:"POST",headers:openRouterRequestHeaders(route),body:JSON.stringify(payload),signal:AbortSignal.timeout(60000),redirect:"error"});
  await assertOpenRouterResponse(response);
  const raw=await response.json();
  // Preserve a valid acknowledgement identity even if optional provider
  // metadata evolves. The final polling contract still validates all results.
  const id=batchIdSchema.parse(raw?.id);
  try{return batchResponseSchema.parse(raw);}catch{throw new BatchAdmissionResponseError(id);}
}
export async function readOpenRouterBatch(id:string,transport:typeof fetch=fetch) {
  batchIdSchema.parse(id);const route=getOpenRouterConfig();
  const response=await transport(`${route.baseUrl}/batches/${id}`,{headers:openRouterRequestHeaders(route),signal:AbortSignal.timeout(30000),redirect:"error"});
  await assertOpenRouterResponse(response);
  const batch=batchResponseSchema.parse(await response.json());
  if(batch.id!==id)throw new Error("Batch receipt identity mismatch");
  return batch;
}
