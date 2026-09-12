import {BudgetDeniedError} from "@/lib/billing/policy";
import type {StructuredAiRequest} from "./contracts";

export const LEAD_REQUEST_BOUNDS_VERSION="lead-request-bytes-v1";
export function leadRequestByteLimit(request:StructuredAiRequest<unknown>):number|null {
  if(request.task==="lead-evidence-correction")return 36_864;
  if(request.task!=="lead-qualification")return null;
  const input=request.input as {scoringRubric?:{outputMode?:unknown}}|null;
  return input?.scoringRubric?.outputMode==="score-only"?57_344:61_440;
}
/** Reuses the workflow's non-retryable pause channel; never convert oversize into a score. */
export class LeadRequestTooLargeError extends BudgetDeniedError {
  constructor(readonly requestBytes:number,readonly maximumBytes:number){
    super("request-out-of-bounds");
    this.name="LeadRequestTooLargeError";
    this.message=`完整模型请求为 ${requestBytes} 字节，超过 ${maximumBytes} 字节上限；已阻止调用，候选尚未完成评估。请拆批或处理超大单家公司证据，不得作为低分或自动重试。`;
  }
}
export function assertLeadRequestBytes(request:StructuredAiRequest<unknown>,body:string):void {
  const limit=leadRequestByteLimit(request);
  const bytes=Buffer.byteLength(body,"utf8");
  if(limit!==null&&bytes>limit)throw new LeadRequestTooLargeError(bytes,limit);
}
