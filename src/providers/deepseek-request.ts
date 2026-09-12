import type {StructuredAiRequest} from "./contracts";
import {structuredUserPrompt} from "./structured-user-prompt";

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
  const useAnthropicTransport=process.env.DEEPSEEK_TRANSPORT?.trim().toLowerCase()==="anthropic"
    ||(!process.env.DEEPSEEK_TRANSPORT&&model.includes("pro"));
  const body=JSON.stringify(useAnthropicTransport?{
    model,max_tokens:maxTokens,temperature,system:systemPrompt,
    messages:[{role:"user",content:userPrompt}],thinking:{type:"disabled"},
  }:{
    model,messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],
    response_format:{type:"json_object"},thinking:{type:model.includes("pro")?"enabled":"disabled"},
    temperature,max_tokens:maxTokens,
  });
  return {body,useAnthropicTransport};
}
