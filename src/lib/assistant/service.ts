import {
  appendMessage, createConversation, createLeadSearchAction, getConversation, updateConversation,
} from "./repository";
import { runAssistantWorkflow } from "./graph";
import type { AssistantConversationDto } from "./types";

function conversationTitle(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 38) || "新对话";
}

export async function processAssistantMessage(userId: string, input: {
  conversationId?: string; content: string;
}): Promise<AssistantConversationDto> {
  const conversationId = input.conversationId ?? await createConversation(userId, conversationTitle(input.content));
  const existing = await getConversation(userId, conversationId);
  if (!existing) throw new Error("对话不存在");
  await appendMessage(userId, conversationId, { role: "user", intent: "general", content: input.content });
  if (existing.messages.length === 0 && existing.title === "新对话") {
    await updateConversation(userId, conversationId, { title: conversationTitle(input.content) });
  }

  const interpreted = await runAssistantWorkflow(userId, input.content);
  if (interpreted.intent === "general" || interpreted.intent === "clarification") {
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: interpreted.intent, content: interpreted.reply,
    });
  } else if (interpreted.intent === "lead-search" && interpreted.plan) {
    const actionId = await createLeadSearchAction(userId, conversationId, interpreted.plan);
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: "lead-search",
      content: interpreted.reply,
      metadata: { actionId },
    });
  } else {
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: "knowledge-question", content: interpreted.reply,
      metadata: interpreted.ragAnswer ? { citations: interpreted.ragAnswer.citations,
        grounded: interpreted.ragAnswer.grounded, warnings: interpreted.ragAnswer.warnings } : undefined,
    });
  }
  return (await getConversation(userId, conversationId))!;
}
