import {createHash} from "node:crypto";

// Public metadata only: no environment loading, API key, inference, account read or write.
const url="https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints";
const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30_000)});
if(!response.ok)throw new Error(`Public metadata HTTP ${response.status}`);
const raw=await response.text(),data=JSON.parse(raw).data;
if(data.id!=="openai/gpt-5.6-sol")throw new Error("Unexpected model identity");
const endpoint=data.endpoints.find((item:{tag:string;status:number})=>item.tag==="openai"&&item.status===0);
const bedrock=data.endpoints.find((item:{tag:string;status:number})=>item.tag==="amazon-bedrock/us-east-1"&&item.status===0);
if(!endpoint||!bedrock||endpoint.context_length!==1_050_000||endpoint.max_completion_tokens<4096)
  throw new Error("Expected OpenAI standard endpoint is unavailable");
if(!endpoint.supported_parameters.includes("max_tokens")||!bedrock.supported_parameters.includes("max_tokens")
  ||endpoint.supported_parameters.includes("temperature")||bedrock.supported_parameters.includes("temperature"))
  throw new Error("RAG request parameter support changed");
const discount=Number(endpoint.pricing.discount??0);
if(!Number.isFinite(discount)||discount<0||discount>=1)throw new Error("Invalid endpoint discount");
const undiscounted=(key:string)=>Math.max(...[endpoint.pricing,...(endpoint.pricing.overrides??[])]
  .map((price:Record<string,unknown>)=>Number(price[key])/(1-discount)));
const maximumInputPrice=Math.max(undiscounted("prompt"),undiscounted("input_cache_read"),
  undiscounted("input_cache_write"));
const maximumOutputPrice=undiscounted("completion");
const maximumInputTokens=65_536,maximumOutputTokens=4_096;
const maximumChargeMicros=Math.ceil((maximumInputTokens*maximumInputPrice
  +maximumOutputTokens*maximumOutputPrice)*1_000_000);
const bedrockInputPrice=Number(bedrock.pricing.prompt),bedrockOutputPrice=Number(bedrock.pricing.completion);
const bedrockOverrideThreshold=Math.min(...bedrock.pricing.overrides.map((item:{min_prompt_tokens:number})=>item.min_prompt_tokens));
const bedrockMaximumChargeMicros=Math.ceil((maximumInputTokens*bedrockInputPrice
  +maximumOutputTokens*bedrockOutputPrice)*1_000_000);
if(maximumInputPrice!==0.00001||maximumOutputPrice!==0.00003||maximumChargeMicros!==778_240
  ||bedrockInputPrice!==0.0000044||bedrockOutputPrice!==0.000022||bedrockOverrideThreshold<=maximumInputTokens
  ||bedrockMaximumChargeMicros!==378_471)
  throw new Error("Reviewed RAG price bound changed");
console.log(JSON.stringify({status:"public-metadata-audit-no-inference",capturedAt:new Date().toISOString(),
  source:{url,sha256:createHash("sha256").update(raw).digest("hex")},model:data.id,providers:["openai","amazon-bedrock/us-east-1"],
  supportedParameters:{openai:endpoint.supported_parameters,bedrock:bedrock.supported_parameters},maximumRequestBytes:61_440,maximumInputTokens,
  maximumOutputTokens,maximumInputPricePerToken:maximumInputPrice,
  maximumOutputPricePerToken:maximumOutputPrice,maximumChargeMicros,maximumChargeUsd:maximumChargeMicros/1e6,
  bedrockMaximumChargeMicros,bedrockMaximumChargeUsd:bedrockMaximumChargeMicros/1e6,
  combinedMaximumChargeMicros:maximumChargeMicros+bedrockMaximumChargeMicros,
  paidCalls:0,accountReads:0}));
