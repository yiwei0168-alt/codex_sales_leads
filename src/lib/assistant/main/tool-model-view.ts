import type { ModelMessage } from "./contracts";
import {hybridDataSchema,HYBRID_TOOLS} from './hybrid-contracts';

const roleBlock = /<\s*(system|developer|assistant|user|tool)(?:\s+[^<>]*?)?\s*>[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const chatMlBlock = /(?:<\|im_start\|>|\[im_start\])\s*(?:system|developer|assistant|user|tool)\b[\s\S]*?(?:<\|im_end\|>|\[im_end\]|(?=<\|im_start\|>|\[im_start\])|$)/gi;
const omitted = "[Untrusted source role block omitted from model context]";

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(roleBlock, omitted).replace(chatMlBlock, omitted);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, redact(nested)]));
  return value;
}

/** Keep the original tool message in graph state for source/version checks. */
export function toolModelView(messages: ModelMessage[]): ModelMessage[] {
  const hybridParents=new Set<string>();
  for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
    try{if(call.function.name==='execute_tool'&&HYBRID_TOOLS.includes(JSON.parse(call.function.arguments).tool))hybridParents.add(call.id);}catch{/* Invalid call, no projection. */}
  }
  return messages.map(message => {
    if (message.role !== "tool") return message;
    try {
      let original = JSON.parse(message.content ?? "") as unknown;
      if(hybridParents.has(message.tool_call_id??'')&&original&&typeof original==='object'&&'data' in original){
        const parsed=hybridDataSchema.safeParse(original.data);
        if(parsed.success){
          const {leaves,...projected}=parsed.data;
          original={...original,data:{...projected,reads:leaves.map(leaf=>({tool:leaf.tool,arguments:leaf.arguments,
            callId:leaf.output.callId,status:leaf.output.status,sources:leaf.output.sources,missing:leaf.output.missing}))}};
          if(JSON.stringify(original).length>90000)original={status:'partial',data:{kind:parsed.data.kind,route:parsed.data.route,
            coverage:parsed.data.coverage,reads:leaves.map(leaf=>({tool:leaf.tool,arguments:leaf.arguments,callId:leaf.output.callId,status:leaf.output.status}))},
            missing:['Projection too large. Original reads remain saved; narrow the requested data. No complete evidence projection was delivered.']};
        }
      }
      const content = JSON.stringify(redact(original));
      return content === message.content ? message : { ...message, content };
    } catch {
      // Malformed tool output is never a source of trustworthy instructions.
      return { ...message, content: JSON.stringify({ status: "partial", data: null,
        missing: ["Unreadable tool result omitted from model context"] }) };
    }
  });
}
