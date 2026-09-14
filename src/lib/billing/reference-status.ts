import kimi from "../../../config/billing/kimi-text-bounds-v1.0.0.json";
import embedding from "../../../config/billing/aliyun-embedding-bounds-v1.0.0.json";
import { tariffValidity } from "./tariff-validity";
import { foreignCostBoundSchema, foreignReservationMicros, PRODUCTION_FX_MAX_AGE_MS } from "./fx-policy";
import { ECB_REFERENCE_URL } from "./ecb-reference";

export function fxReferenceStatus(value:unknown,now=Date.now()) {
  if(value===undefined)return {status:"missing" as const,asOf:null,retrievedAt:null,effectiveExpiresAt:null};
  const parsed=foreignCostBoundSchema.safeParse({currency:"CNY",maximumNativeMicros:0,fx:value});
  if(!parsed.success||parsed.data.fx.reference!==ECB_REFERENCE_URL||!Number.isFinite(now)) {
    return {status:"invalid" as const,asOf:null,retrievedAt:null,effectiveExpiresAt:null};
  }
  const fx=parsed.data.fx;
  const dates={asOf:fx.asOf,retrievedAt:fx.retrievedAt,
    effectiveExpiresAt:new Date(Date.parse(fx.asOf)+PRODUCTION_FX_MAX_AGE_MS).toISOString()};
  try {foreignReservationMicros(parsed.data,now);return {status:"valid" as const,...dates};}
  catch {return {status:"expired-or-invalid" as const,...dates};}
}
export function dynamicTariffStatus(now=Date.now()) {
  return [...kimi.models.map(model=>({key:model.model,reference:kimi.reference,version:kimi.version,...tariffValidity(kimi,now)})),
    {key:`${embedding.model}（北京）`,reference:embedding.reference,version:embedding.version,...tariffValidity(embedding,now)}];
}
export type BillingReferenceStatus={checkedAt:string;rules:ReturnType<typeof dynamicTariffStatus>;
  fx:ReturnType<typeof fxReferenceStatus>|{status:"unavailable";asOf:null;retrievedAt:null;effectiveExpiresAt:null}};
