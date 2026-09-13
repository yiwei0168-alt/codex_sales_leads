import configuration from "../../../config/billing/aliyun-embedding-bounds-v1.0.0.json";
import {BudgetDeniedError,quoteRequest,tariffSchema} from "./policy";
import {foreignReservationMicros,type ForeignCostBound} from "./fx-policy";

export function isBeijingEmbeddingOrigin(origin:string):boolean{
  return /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cn-beijing\.maas\.aliyuncs\.com$/.test(origin);
}
export async function embeddingModelBound(input:Parameters<typeof quoteRequest>[0],now=Date.now(),readFx?:()=>Promise<ForeignCostBound["fx"]|null>){
  if(!isBeijingEmbeddingOrigin(input.origin)||input.pathname!==configuration.pathname||input.model!==configuration.model)return null;
  if(!Number.isFinite(now)||now<Date.parse(configuration.verifiedAt)||now>=Date.parse(configuration.expiresAt))throw new BudgetDeniedError("expired-tariff");
  if(input.outputTokens!==null)throw new BudgetDeniedError("request-out-of-bounds");
  let fx:ForeignCostBound["fx"]|null;
  try{fx=await (readFx??(await import("./fx-reference-repository")).readCurrentCnyFxReference)();}
  catch{throw new BudgetDeniedError("missing-tariff");}
  if(!fx)throw new BudgetDeniedError("expired-tariff");
  const maximumNativeMicros=Math.ceil(configuration.maximumInputItems*configuration.maximumTokensPerItem*configuration.inputMicrosPerMillion/1000000);
  const foreignCostBound:ForeignCostBound={currency:"CNY",maximumNativeMicros,fx};
  let maximumChargeMicros:number;
  try{maximumChargeMicros=foreignReservationMicros(foreignCostBound,now);}catch{throw new BudgetDeniedError("expired-tariff");}
  const rule=tariffSchema.parse({key:"aliyun-beijing-text-embedding-v4",origin:input.origin,pathname:configuration.pathname,model:configuration.model,
    maximumChargeMicros,maximumRequestBytes:configuration.maximumRequestBytes,maximumOutputTokens:0,
    foreignCostBound,requestContract:"aliyun-beijing-dense-text-v1",reference:configuration.reference,
    boundDescription:configuration.scope,verifiedAt:configuration.verifiedAt,expiresAt:configuration.expiresAt});
  return {rule:quoteRequest(input,[rule],now),version:configuration.version};
}
