import type {StructuredAiRequest} from "./contracts";
import {structuredUserPrompt} from "./structured-user-prompt";

export function deepSeekGatewayModel(value:string):string {
  const raw=value.trim().replace(/^deepseek\//, "");
  const name=raw==="deepseek-flash"?"deepseek-v4-flash":raw;
  if(!/^deepseek-[a-z0-9.-]+$/i.test(name))throw new Error("DeepSeek requires a deepseek/* gateway model ID");
  return `deepseek/${name}`;
}

/** Single serializer for both batch sizing and actual wire transport. No credentials. */
export function deepSeekRequestBody(request:StructuredAiRequest<unknown>,model=request.modelVersion){
  const systemPrompt=[
    "Return one valid JSON object only, with no Markdown or commentary.",
    "Follow the task instructions and never invent evidence IDs or facts not present in the input JSON.",
    request.outputSchema?`Your entire response MUST validate against this JSON Schema: ${JSON.stringify(request.outputSchema)}`:"",
  ].filter(Boolean).join("\n");
  const userPrompt=structuredUserPrompt(request);
  const maxTokens=Math.max(1_024,Math.min(16_384,Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS??8_192)||8_192));
  const temperature=Math.max(0,Math.min(2,Number(process.env.DEEPSEEK_TEMPERATURE??0)||0));
  // Shared sizing also serves other model adapters; enforce family at actual dispatch.
  const normalizedModel=/^deepseek(?:\/|-)/i.test(model)?deepSeekGatewayModel(model):model;
  const legacyTransport=process.env.DEEPSEEK_TRANSPORT?.trim().toLowerCase();
  const reasoningEnabled=model.includes("pro")&&Boolean(legacyTransport)&&legacyTransport!=="anthropic";
  const body=JSON.stringify({
    model:normalizedModel,messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],
    response_format:{type:"json_object"},reasoning:{enabled:reasoningEnabled},
    provider:{require_parameters:true,data_collection:"deny",allow_fallbacks:false},
    temperature,max_tokens:maxTokens,
  });
  const useAnthropicTransport=false;
  return {body,useAnthropicTransport};
}
