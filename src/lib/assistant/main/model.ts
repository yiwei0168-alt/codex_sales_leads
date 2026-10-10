import { z } from "zod";
import { getOpenRouterConfig } from "@/providers/openrouter";
import { budgetedFetch } from "@/lib/billing/paid-fetch";
import type { ModelConfig, ModelMessage } from "./contracts";
import { assertOpenRouterResponse } from "@/providers/openrouter-batch";
import { matchesBatchModel } from '@/providers/openrouter-batch';
import { modelRoutedTransport } from '@/lib/network/model-transport';
import { collectModelStream, withModeStream, ModelWaitError, ModelReceiptError } from './model-stream';
import type { ModeConfig } from './mode-config';

export const modelReplySchema = z.object({
  role: z.literal("assistant"), content: z.string().nullable().optional(),
  reasoning: z.string().optional(), reasoning_details: z.array(z.record(z.string(),z.unknown())).optional(),
  tool_calls: z.array(z.object({ id: z.string().min(1).max(200), type: z.literal("function"),
    function: z.object({ name: z.string().max(100), arguments: z.string().max(100_000) }) })).max(12).optional(),
});

export async function requestModeModel(messages:ModelMessage[],profile:ModeConfig,index:number,transport:typeof fetch=fetch){
  const candidate=profile.routes[index];if(!candidate)throw new Error('Invalid model attempt');
  const route=getOpenRouterConfig(),controller=new AbortController();
  let transportError:unknown;
  const first=setTimeout(()=>controller.abort(new ModelWaitError('first-output')),profile.firstOutputMs);
  const total=setTimeout(()=>controller.abort(new ModelWaitError('total')),profile.totalMs);
  let rejectAbort:()=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  void aborted.catch(()=>undefined); // A deadline can fire while admission is still awaiting storage.
  const adapted:typeof fetch=async(input,init)=>{
    try{
      controller.signal.throwIfAborted();
      const response=await Promise.race([modelRoutedTransport(transport,input,init)(input,init),aborted]);
      if(!response.ok){clearTimeout(first);return response;}
      return await collectModelStream(response,controller.signal,()=>clearTimeout(first));
    }catch(error){transportError=error;throw error;}
  };
  try{
    const response=await withModeStream(()=>budgetedFetch(adapted)(`${route.baseUrl}/chat/completions`,{
      method:'POST',headers:{...route.defaultHeaders,Authorization:`Bearer ${route.apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:candidate.model,messages:transportMessages(messages),tools:modelFunctions,tool_choice:'auto',stream:true,
        max_tokens:16384,reasoning:{effort:candidate.effort},provider:{...route.providerPreferences,allow_fallbacks:false}}),
      signal:controller.signal,redirect:'error',
    }));
    await assertOpenRouterResponse(response);
    const body=await response.json();
    if(typeof body.model!=='string'||!matchesBatchModel(body.model,candidate.model))throw new Error('Model route identity mismatch');
    return {...parseModelResponse(body),provider:typeof body.provider==='string'?body.provider:null,generationId:typeof body.id==='string'?body.id:null};
  }catch(error){
    if(error instanceof ModelReceiptError)throw error;
    if(controller.signal.aborted)throw controller.signal.reason;
    if(transportError)throw transportError;
    throw error;
  }finally{clearTimeout(first);clearTimeout(total);controller.signal.removeEventListener('abort',rejectAbort);controller.abort();}
}
export const modelFunctions = [
  { type: "function", function: { name: "discover_tools", description: "List accessible product capabilities", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "describe_tool", description: "Load a tool's full input/output schema and execution contract", parameters: { type: "object", properties: { tool: { type: "string" } }, required: ["tool"], additionalProperties: false } } },
  { type: "function", function: { name: "execute_tool", description: "Execute a described capability under server-injected account permissions", parameters: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["tool", "arguments"], additionalProperties: false } } },
];
export async function requestModel(messages: ModelMessage[], config: ModelConfig, transport: typeof fetch = fetch) {
  if(config.model.endsWith(":batch"))throw new Error("Batch model requires the durable asynchronous transport");
  const route = getOpenRouterConfig();
  const glmSync = config.model === "z-ai/glm-5.3";
  const response = await budgetedFetch(transport)(`${route.baseUrl}/chat/completions`, {
    method: "POST", headers: { ...route.defaultHeaders, Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: transportMessages(messages), tools: modelFunctions, tool_choice: "auto",
      ...(glmSync ? { max_tokens: 16_384 } : { max_completion_tokens: 16_384, parallel_tool_calls: false }),
      provider: { ...route.providerPreferences, only: config.providers, allow_fallbacks: false } }),
    signal: AbortSignal.timeout(180_000), redirect: "error",
  });
  await assertOpenRouterResponse(response);
  return parseModelResponse(await response.json());
}

/** Repair only the wire representation of rejected historical calls, never executable state. */
export function transportMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(message => !message.tool_calls ? message : {
    ...message,
    tool_calls: message.tool_calls.map(call => {
      try { JSON.parse(call.function.arguments); return call; }
      catch {
        // dispatchTool already rejects malformed JSON. Preserve that failure's paired
        // result and identity while making the subsequent provider request valid JSON.
        return { ...call, function: { ...call.function, arguments: JSON.stringify({
          _invalid_json_arguments: call.function.arguments,
          _history_only: "Malformed original arguments; this is not an executable replacement.",
        }) } };
      }
    }),
  });
}
export function parseModelResponse(value:unknown) {
  const body = z.object({ choices: z.array(z.object({ message: modelReplySchema, finish_reason: z.string() })).min(1),
    usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), cost: z.number().optional() }).optional(),
  }).parse(value);
  if (!["stop", "tool_calls"].includes(body.choices[0].finish_reason)) throw new Error("Main model output incomplete");
  const reply = body.choices[0].message;
  if (!reply.content?.trim() && !reply.tool_calls?.length) throw new Error("Main model returned no content");
  if (new Set(reply.tool_calls?.map(c => c.id)).size !== (reply.tool_calls?.length ?? 0)) throw new Error("Duplicate tool call identity");
  return { message: { ...reply, content: reply.content ?? null } as ModelMessage, usage: body.usage };
}
