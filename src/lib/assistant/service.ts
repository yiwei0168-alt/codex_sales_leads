import { getMissingRagConfig } from "@/lib/rag/config";
import { answerWithRag } from "@/lib/rag/service";
import {
  appendMessage, createConversation, createLeadSearchAction, getConversation, updateConversation,
} from "./repository";
import { interpretAssistantRequest } from "./intent";
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

  const interpreted = interpretAssistantRequest(input.content);
  if (interpreted.intent === "general") {
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: "general", content: interpreted.reply!,
    });
  } else if (interpreted.intent === "clarification") {
    await appendMessage(userId, conversationId, { role: "assistant", intent: "clarification", content: interpreted.reply! });
  } else if (interpreted.intent === "lead-search" && interpreted.plan) {
    const actionId = await createLeadSearchAction(userId, conversationId, interpreted.plan);
    const objective = interpreted.plan.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长";
    await appendMessage(userId, conversationId, {
      role: "assistant", intent: "lead-search",
      content: `我已生成 ${interpreted.plan.countryName} 的销售线索搜索计划。目标为 ${interpreted.plan.targetCount} 家，采用“${objective}”模式。确认后才会调用 Tavily，并将结果、证据和评分保存到 ${interpreted.plan.countryName} 分区。`,
      metadata: { actionId },
    });
  } else {
    const missing = getMissingRagConfig();
    if (missing.length > 0) {
      await appendMessage(userId, conversationId, {
        role: "assistant", intent: "knowledge-question",
        content: `知识问答服务尚未完整配置（缺少 ${missing.join(", ")}）。我没有调用外部搜索，也不会在缺少证据时编造答案。`,
      });
    } else {
      try {
        const answer = await answerWithRag(userId, { question: input.content, maxChunks: 8 });
        await appendMessage(userId, conversationId, {
          role: "assistant", intent: "knowledge-question", content: answer.answer,
          metadata: { citations: answer.citations, grounded: answer.grounded, warnings: answer.warnings },
        });
      } catch (error) {
        await appendMessage(userId, conversationId, {
          role: "assistant", intent: "knowledge-question",
          content: error instanceof Error ? `知识库查询失败：${error.message}` : "知识库查询失败，请稍后重试。",
        });
      }
    }
  }
  return (await getConversation(userId, conversationId))!;
}
