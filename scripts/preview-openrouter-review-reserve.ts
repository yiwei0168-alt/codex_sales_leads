import {readFile} from "node:fs/promises";

// Offline scenario only. Never changes a tariff or starts a paid request.
const snapshot=JSON.parse(await readFile("docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json","utf8"));
if(snapshot.status!=="public-evidence-only-no-tariff-admission")throw new Error("Unexpected evidence status");
const pico=BigInt(1_000_000_000_000);
function pricePico(value:unknown):bigint{
  if(typeof value!=="string"||!/^\d+(?:\.\d{1,12})?$/.test(value))throw new Error("Missing exact price");
  const [whole,fraction=""]=value.split(".");
  return BigInt(whole)*pico+BigInt(fraction.padEnd(12,"0"));
}
function ceil(numerator:bigint,denominator:bigint){return (numerator+denominator-BigInt(1))/denominator;}
function bound(modelId:string,outputTokens:number){
  const model=snapshot.models.find((item:{id:string})=>item.id===modelId);
  if(!model||model.contextLength!==1050000)throw new Error("Unexpected model context");
  const endpoints=model.endpoints.filter((item:{tag:string})=>!["openai/flex","openai/fast"].includes(item.tag));
  if(endpoints.length!==5||endpoints.some((item:{maxCompletionTokens:number})=>item.maxCompletionTokens<outputTokens))
    throw new Error("Standard endpoint set or completion limit changed");
  const fields=["prompt","input_cache_read","input_cache_write","completion"] as const;
  const maxima=Object.fromEntries(fields.map(field=>[field,BigInt(0)])) as Record<(typeof fields)[number],bigint>;
  for(const endpoint of endpoints){
    const discount=endpoint.pricing.discount??0;
    if(!Number.isSafeInteger(discount*1_000_000)||discount<0||discount>=1)throw new Error("Unknown discount");
    const denominator=BigInt(Math.round((1-discount)*1_000_000));
    for(const price of [endpoint.pricing,...(endpoint.pricing.overrides??[])])for(const field of fields){
      const amount=ceil(pricePico(price[field])*BigInt(1_000_000),denominator);
      if(amount>maxima[field])maxima[field]=amount;
    }
  }
  const totalPico=(maxima.prompt+maxima.input_cache_read+maxima.input_cache_write)*BigInt(model.contextLength)
    +maxima.completion*BigInt(outputTokens);
  return {modelId,standardEndpointTags:endpoints.map((item:{tag:string})=>item.tag),
    inputCeilingTokens:model.contextLength,outputCeilingTokens:outputTokens,
    ceilingUsdMicros:Number(ceil(totalPico,BigInt(1_000_000)))};
}
const secondary=bound("openai/gpt-5.6-terra",8192),judge=bound("openai/gpt-5.6-sol",12000);
if(secondary.ceilingUsdMicros!==11019202||judge.ceilingUsdMicros!==27736500)
  throw new Error("Public evidence prices changed; review the scenario before reuse");
console.log(JSON.stringify({status:"scenario-only-not-admitted",capturedAt:snapshot.capturedAt,
  secondary,judge,paidCalls:0}));
