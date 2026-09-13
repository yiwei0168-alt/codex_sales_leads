import configuration from "../../../config/billing/kimi-text-bounds-v1.0.0.json";
import {quoteRequest,tariffSchema,BudgetDeniedError} from "./policy";
import {foreignReservationMicros,type ForeignCostBound} from "./fx-policy";

type Quote=Parameters<typeof quoteRequest>[0];
/** Reviewed mainland prices must never be applied to the international endpoint or a gateway. */
export async function nativeModelBound(input:Quote,now=Date.now(),readFx?:()=>Promise<ForeignCostBound["fx"]|null>){
  if(input.origin!==configuration.origin||input.pathname!==configuration.pathname)return null;
  const model=configuration.models.find(item=>item.model===input.model);if(!model)return null;
  if(!Number.isFinite(now)||Date.parse(configuration.verifiedAt)>now||Date.parse(configuration.expiresAt)<=now
    ||now-Date.parse(configuration.verifiedAt)>=7*86400000)throw new BudgetDeniedError("expired-tariff");
  const output=input.outputTokens;
  if(output===null||!Number.isSafeInteger(output)||output<=0||output>configuration.maximumOutputTokens)throw new BudgetDeniedError("request-out-of-bounds");
  const numerator=BigInt(model.contextTokens)*BigInt(model.inputMissMicrosPerMillion)+BigInt(output)*BigInt(model.outputMicrosPerMillion);
  const unit=BigInt(configuration.unitTokens);
  const maximumNativeMicros=Number((numerator+unit-BigInt(1))/unit);
  let fx:ForeignCostBound["fx"]|null;
  try{fx=await (readFx??(()=>import("./fresh-fx-reference").then(module=>module.readFreshCnyFxReference(now))))();}
  catch{throw new BudgetDeniedError("missing-tariff");}
  if(!fx)throw new BudgetDeniedError("expired-tariff");
  const foreignCostBound:ForeignCostBound={currency:"CNY",maximumNativeMicros,fx};
  let maximumChargeMicros:number;
  try{maximumChargeMicros=foreignReservationMicros(foreignCostBound,now);}catch{throw new BudgetDeniedError("expired-tariff");}
  const rule=tariffSchema.parse({key:`${model.model}-cn-text`,origin:configuration.origin,pathname:configuration.pathname,model:model.model,
    maximumChargeMicros,maximumRequestBytes:configuration.maximumRequestBytes,maximumOutputTokens:configuration.maximumOutputTokens,
    requestContract:"kimi-cn-text-json-v1",foreignCostBound,reference:configuration.reference,
    verifiedAt:configuration.verifiedAt,expiresAt:configuration.expiresAt,boundDescription:configuration.scope});
  return {rule:quoteRequest(input,[rule],now),version:configuration.version};
}
