import {foreignReservationMicros,type ForeignCostBound} from "@/lib/billing/fx-policy";
import {tariffSchema,type RequestBound} from "@/lib/billing/policy";

export const HOLDOUT_PAID_SCOPE={
  version:"ma24-holdout-paid-v1-2026-09-30",
  verifiedAt:"2026-09-30T00:00:00Z",
  expiresAt:"2026-10-07T00:00:00Z",
  capCnyMicros:100_000_000,
  maximumQwenCalls:50,
  maximumKimiCalls:100,
  maximumKimiRequestBytes:24_000,
  maximumKimiOutputTokens:4096,
  kimiInputOverheadTokens:1024,
} as const;
export type HoldoutPaidKind="qwen"|"kimi";
export type HoldoutReservation={tariffKey:string;maximumNativeMicros:number};

const QWEN_KEY="ma24-holdout-qwen-v4-beijing";
const KIMI_KEY="ma24-holdout-kimi-k3-cn";
const price=(tokens:number,cnyMicrosPerMillion:number)=>Math.ceil(tokens*cnyMicrosPerMillion/1_000_000);
export const HOLDOUT_QWEN_CNY_MICROS=price(8192,500_000);
export const HOLDOUT_KIMI_CNY_MICROS=price(
  HOLDOUT_PAID_SCOPE.maximumKimiRequestBytes+HOLDOUT_PAID_SCOPE.kimiInputOverheadTokens,20_000_000)
  +price(HOLDOUT_PAID_SCOPE.maximumKimiOutputTokens,100_000_000);

/** A scoped tariff is inherited only by this local acceptance operation. */
export function holdoutPaidTariffs(embeddingBaseUrl:string,fx:ForeignCostBound["fx"],now=Date.now()):RequestBound[]{
  if(now<Date.parse(HOLDOUT_PAID_SCOPE.verifiedAt)||now>=Date.parse(HOLDOUT_PAID_SCOPE.expiresAt))
    throw new Error("Holdout price verification expired");
  const endpoint=new URL(embeddingBaseUrl);
  if(endpoint.protocol!=="https:"||!/^([a-z0-9-]+)\.cn-beijing\.maas\.aliyuncs\.com$/.test(endpoint.hostname)
    ||endpoint.pathname!=="/compatible-mode/v1"||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)
    throw new Error("Beijing Qwen embedding endpoint required");
  const common={verifiedAt:HOLDOUT_PAID_SCOPE.verifiedAt,expiresAt:HOLDOUT_PAID_SCOPE.expiresAt};
  const rule=(kind:HoldoutPaidKind,maximumNativeMicros:number,requestBytes:number,outputTokens:number):RequestBound=>{
    const foreignCostBound:ForeignCostBound={currency:"CNY",maximumNativeMicros,fx};
    return tariffSchema.parse({
      key:kind==="qwen"?QWEN_KEY:KIMI_KEY,
      origin:kind==="qwen"?endpoint.origin:"https://api.moonshot.cn",
      pathname:kind==="qwen"?"/compatible-mode/v1/embeddings":"/v1/chat/completions",
      model:kind==="qwen"?"text-embedding-v4":"kimi-k3",
      maximumChargeMicros:foreignReservationMicros(foreignCostBound,now),
      maximumRequestBytes:requestBytes,maximumOutputTokens:outputTokens,
      requestContract:kind==="qwen"?"aliyun-beijing-dense-text-v1":"kimi-cn-text-json-v1",
      reference:kind==="qwen"?"https://help.aliyun.com/zh/model-studio/text-embedding-v4":"https://platform.kimi.com/",
      boundDescription:kind==="qwen"
        ?"MA24-12 one Beijing text-embedding-v4 query per request, 8192 input token upper bound; only frozen holdout questions."
        :"MA24-12 one Kimi K3 text JSON completion, request at most 24000 UTF-8 bytes plus 1024 chat framing input tokens, at most 4096 reasoning and final output tokens; only explicitly public shared evidence.",
      foreignCostBound,...common,
    });
  };
  return[rule("qwen",HOLDOUT_QWEN_CNY_MICROS,16_384,0),
    rule("kimi",HOLDOUT_KIMI_CNY_MICROS,HOLDOUT_PAID_SCOPE.maximumKimiRequestBytes,HOLDOUT_PAID_SCOPE.maximumKimiOutputTokens)];
}

export function holdoutTariffKey(kind:HoldoutPaidKind){return kind==="qwen"?QWEN_KEY:KIMI_KEY;}
export function assertHoldoutPaidCapacity(reservations:HoldoutReservation[],next:HoldoutPaidKind){
  let qwen=0,kimi=0,occupied=0;
  for(const item of reservations){
    if(item.tariffKey===QWEN_KEY&&item.maximumNativeMicros===HOLDOUT_QWEN_CNY_MICROS)qwen++;
    else if(item.tariffKey===KIMI_KEY&&item.maximumNativeMicros===HOLDOUT_KIMI_CNY_MICROS)kimi++;
    else throw new Error("Unknown or changed holdout paid reservation");
    occupied+=Math.ceil(item.maximumNativeMicros*1.05);
  }
  if(qwen+(next==="qwen"?1:0)>HOLDOUT_PAID_SCOPE.maximumQwenCalls
    ||kimi+(next==="kimi"?1:0)>HOLDOUT_PAID_SCOPE.maximumKimiCalls)
    throw new Error("Holdout paid call limit reached");
  const nextNative=next==="qwen"?HOLDOUT_QWEN_CNY_MICROS:HOLDOUT_KIMI_CNY_MICROS;
  if(occupied+Math.ceil(nextNative*1.05)>HOLDOUT_PAID_SCOPE.capCnyMicros)
    throw new Error("Holdout CNY 100 cap reached");
  return{qwenCalls:qwen,kimiCalls:kimi,reservedCnyMicrosWithBuffer:occupied,
    remainingCnyMicros:HOLDOUT_PAID_SCOPE.capCnyMicros-occupied};
}
