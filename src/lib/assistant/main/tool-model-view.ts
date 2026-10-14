import type { ModelMessage } from "./contracts";

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
  return messages.map(message => {
    if (message.role !== "tool") return message;
    try {
      const original = JSON.parse(message.content ?? "") as unknown;
      const content = JSON.stringify(redact(original));
      return content === message.content ? message : { ...message, content };
    } catch {
      // Malformed tool output is never a source of trustworthy instructions.
      return { ...message, content: JSON.stringify({ status: "partial", data: null,
        missing: ["Unreadable tool result omitted from model context"] }) };
    }
  });
}
