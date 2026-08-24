import {
  appendMessage, cancelProposedLeadSearchActions, createConversation, createLeadSearchAction, getConversation, updateConversation,
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

  const history = existing.messages.filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  const interpreted = await runAssistantWorkflow(userId, input.content, history);
  const planner = interpreted.intentPlan ? {
    confidence: interpreted.intentPlan.confidence,
    plannerModel: interpreted.intentPlan.plannerModel,
    plannerSource: interpreted.intentPlan.plannerSource,
  } : undefined;
  if (interpreted.intent === "general" || interpreted.intent === "clarification") {
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: interpreted.intent, content: interpreted.reply,
      metadata: { planner, warnings: interpreted.warnings },
    });
  } else if (interpreted.intent === "lead-search" && interpreted.plan) {
    await cancelProposedLeadSearchActions(userId, conversationId);
    const actionId = await createLeadSearchAction(userId, conversationId, interpreted.plan);
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: "lead-search",
      content: interpreted.reply,
      metadata: { actionId, planner, warnings: interpreted.warnings },
    });
  } else {
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: interpreted.intent, content: interpreted.reply,
      metadata: {
        citations: interpreted.ragAnswer?.citations,
        webCitations: interpreted.externalAnswer?.citations,
        grounded: interpreted.ragAnswer?.grounded,
        warnings: interpreted.warnings,
        planner,
      },
    });
  }
  return (await getConversation(userId, conversationId))!;
}
