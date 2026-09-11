import { z } from "zod";
import configuration from "../../../config/billing/request-bounds-v1.0.0.json";

export class BudgetDeniedError extends Error {
  constructor(readonly code:"missing-tariff"|"expired-tariff"|"request-out-of-bounds"|"missing-budget"|"budget-exhausted"|"budget-frozen") {
    super(`付费调用已阻止：${code}。请检查预算与已审核费率，未自动放行。`);
    this.name="BudgetDeniedError";
  }
}
export const tariffSchema=z.object({
  key:z.string().min(1),origin:z.url(),pathname:z.string().startsWith("/"),model:z.string(),
  maximumChargeMicros:z.number().int().positive().max(1000000000000),
  maximumRequestBytes:z.number().int().positive().max(10000000),
  maximumOutputTokens:z.number().int().nonnegative().max(1000000),
  // Verified bound must include grounding/tools/reasoning and all automatic server-side work.
  boundDescription:z.string().min(30),reference:z.url(),verifiedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
}).strict();
export const billingPolicy=z.object({version:z.string().min(1),rules:z.array(tariffSchema)}).parse(configuration);
export type RequestBound=z.infer<typeof tariffSchema>;
export function dollarsToMicros(value:string):number {
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value))throw new Error("美元预算须为非负数字，最多六位小数");
  const [whole,fraction=""]=value.split(".");const amount=Number(whole)*1000000+Number(fraction.padEnd(6,"0"));
  if(amount>1000000000000)throw new Error("预算超出可支持范围");return amount;
}
export function quoteRequest(input:{origin:string;pathname:string;model:string;requestBytes:number;outputTokens:number|null},rules=billingPolicy.rules,now=Date.now()):RequestBound{
  const matches=rules.filter(rule=>rule.origin===input.origin&&rule.pathname===input.pathname&&rule.model===input.model);
  if(matches.length!==1)throw new BudgetDeniedError("missing-tariff");
  const rule=matches[0];
  if(Date.parse(rule.expiresAt)<=now||Date.parse(rule.verifiedAt)>now)throw new BudgetDeniedError("expired-tariff");
  if(input.requestBytes>rule.maximumRequestBytes||!Number.isSafeInteger(input.requestBytes)||input.requestBytes<0
    ||(rule.model!==""&&!rule.pathname.endsWith("/embeddings")&&rule.maximumOutputTokens===0)
    ||(rule.maximumOutputTokens>0&&(input.outputTokens===null||!Number.isSafeInteger(input.outputTokens)||input.outputTokens>rule.maximumOutputTokens||input.outputTokens<=0)))throw new BudgetDeniedError("request-out-of-bounds");
  return rule;
}
