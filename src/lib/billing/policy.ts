import { z } from "zod";
import {tariffValidity} from "./tariff-validity";
import configuration from "../../../config/billing/request-bounds-v1.9.0.json";
import {foreignCostBoundSchema,foreignReservationMicros} from "./fx-policy";

export class BudgetDeniedError extends Error {
  constructor(readonly code:"missing-tariff"|"expired-tariff"|"request-out-of-bounds"|"missing-budget"|"budget-exhausted"|"budget-frozen"|"task-budget-exhausted"|"paid-outcome-unknown"|"paid-request-already-recorded"|"tariff-suspended"|"model-output-incomplete") {
    super(`付费调用已阻止：${code}。请检查预算与已审核费率，未自动放行。`);
    this.name="BudgetDeniedError";
    if(code==="paid-request-already-recorded")this.message="重复付费已阻止：paid-request-already-recorded。当前任务环节已有相同模型请求记录，请复用已保存结果或先核实前次状态。";
  }
}
export class PaidCallOutcomeUnknownError extends BudgetDeniedError {
  constructor(){
    super("paid-outcome-unknown");
    this.name="PaidCallOutcomeUnknownError";
    this.message="付费请求结果或费用尚未明确，已保留本次预留并阻止自动重试；请先核实服务商记录，再决定恢复。";
  }
}
export class IncompleteModelOutputError extends BudgetDeniedError {
  constructor(){super("model-output-incomplete");this.name="IncompleteModelOutputError";
    this.message="模型输出未完整结束，未记为成功；已保留本次费用记录并停止自动重试，请检查输出上限或服务商响应后恢复。";}
}
export const tariffSchema=z.object({
  key:z.string().min(1),origin:z.url(),pathname:z.string().startsWith("/"),model:z.string(),
  maximumChargeMicros:z.number().int().positive().max(1000000000000),
  maximumRequestBytes:z.number().int().positive().max(10000000),
  maximumOutputTokens:z.number().int().nonnegative().max(1000000),
  // Verified bound must include grounding/tools/reasoning and all automatic server-side work.
  boundDescription:z.string().min(30),reference:z.url(),verifiedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
  promotionEndsAt:z.iso.datetime().optional(),foreignCostBound:foreignCostBoundSchema.optional(),
  requestContract:z.enum(["deepseek-nonthinking-text-v1","kimi-cn-text-json-v1","aliyun-beijing-dense-text-v1","brave-web-search-v1","tavily-search-v1","tavily-basic-extract-v1","exa-company-auto-text-v1","google-places-text-enterprise-v1","searchapi-google-bing-v1","openrouter-sol-standard-json-v1","openrouter-sol-openai-playbook-v1","openrouter-terra-review-json-v1","openrouter-sol-judge-json-v1"]).optional(),
}).strict();
export const billingPolicy=z.object({version:z.string().min(1),rules:z.array(tariffSchema)}).parse(configuration);
export type RequestBound=z.infer<typeof tariffSchema>;
export function rateReviewHoldKeys(tariffKey:string):string[]{
  return tariffKey==="openrouter-sol-openai-playbook-credits"||tariffKey==="openrouter-sol-judge-credits-standard-json"
    ?[tariffKey,"openrouter-sol-credits-standard-text-json"]:[tariffKey];
}
export function dollarsToMicros(value:string):number {
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value))throw new Error("美元预算须为非负数字，最多六位小数");
  const [whole,fraction=""]=value.split(".");const amount=Number(whole)*1000000+Number(fraction.padEnd(6,"0"));
  if(amount>1000000000000)throw new Error("预算超出可支持范围");return amount;
}
export function quoteRequest(input:{origin:string;pathname:string;model:string;requestBytes:number;outputTokens:number|null},rules=billingPolicy.rules,now=Date.now(),key?:string):RequestBound{
  const matches=rules.filter(rule=>rule.origin===input.origin&&rule.pathname===input.pathname&&rule.model===input.model);
  const selected=key?matches.filter(rule=>rule.key===key):matches.filter(rule=>
    rule.requestContract!=="openrouter-terra-review-json-v1"
      &&rule.requestContract!=="openrouter-sol-judge-json-v1");
  // Without an explicit contract selection, overlapping routes keep the highest bound.
  const highest=Math.max(...selected.map(rule=>rule.maximumChargeMicros));
  const conservative=selected.filter(rule=>rule.maximumChargeMicros===highest);
  if(conservative.length!==1)throw new BudgetDeniedError("missing-tariff");
  const rule=conservative[0];
  // Public SearchAPI plan prices do not establish this account's contracted plan or speed tier.
  // Keep the request validator available, but do not reserve against an unverified account bound.
  if(rule.requestContract==="searchapi-google-bing-v1")throw new BudgetDeniedError("missing-tariff");
  if(!tariffValidity(rule,now).withinVerificationWindow)throw new BudgetDeniedError("expired-tariff");
  if(rule.foreignCostBound){
    let required:number;
    try{required=foreignReservationMicros(rule.foreignCostBound,now);}catch{throw new BudgetDeniedError("expired-tariff");}
    if(rule.maximumChargeMicros<required)throw new BudgetDeniedError("missing-tariff");
  }
  if(input.requestBytes>rule.maximumRequestBytes||!Number.isSafeInteger(input.requestBytes)||input.requestBytes<0
    ||(rule.model!==""&&!rule.pathname.endsWith("/embeddings")&&rule.maximumOutputTokens===0)
    ||(rule.maximumOutputTokens>0&&(input.outputTokens===null||!Number.isSafeInteger(input.outputTokens)||input.outputTokens>rule.maximumOutputTokens||input.outputTokens<=0)))throw new BudgetDeniedError("request-out-of-bounds");
  return rule;
}
