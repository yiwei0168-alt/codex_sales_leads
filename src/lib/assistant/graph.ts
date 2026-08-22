import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { getMissingRagConfig } from "@/lib/rag/config";
import { answerWithRag } from "@/lib/rag/service";
import type { RagAnswer } from "@/lib/rag/types";

import { interpretAssistantRequest } from "./intent";
import type { AssistantIntent, LeadSearchPlan } from "./types";

const AssistantState = Annotation.Root({
  userId: Annotation<string>(),
  content: Annotation<string>(),
  intent: Annotation<AssistantIntent>(),
  plan: Annotation<LeadSearchPlan | undefined>(),
  reply: Annotation<string>(),
  ragAnswer: Annotation<RagAnswer | undefined>(),
});

export interface AssistantGraphDependencies {
  answerKnowledge: typeof answerWithRag;
  missingRagConfig: typeof getMissingRagConfig;
}

const productionDependencies: AssistantGraphDependencies = {
  answerKnowledge: answerWithRag,
  missingRagConfig: getMissingRagConfig,
};

export function knowledgeErrorMessage(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  if (status === 401 || status === 403) return "知识库检索已成功，但回答模型认证失败。请检查服务端模型网关配置后重试。";
  if (status === 429) return "知识库检索已成功，但回答模型当前限流。请稍后重试。";
  if (status && status >= 500) return "知识库检索已成功，但回答模型暂时不可用。请稍后重试。";
  return error instanceof Error ? `知识库查询失败：${error.message}` : "知识库查询失败，请稍后重试。";
}

export function buildAssistantWorkflowGraph(dependencies: AssistantGraphDependencies = productionDependencies) {
  return new StateGraph(AssistantState)
    .addNode("interpret_request", (state) => {
      const interpreted = interpretAssistantRequest(state.content);
      return { intent: interpreted.intent, plan: interpreted.plan, reply: interpreted.reply ?? "" };
    })
    .addNode("resolve_request", async (state) => {
      if (state.intent === "lead-search" && state.plan) {
        const objective = state.plan.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长";
        return {
          reply: `我已生成 ${state.plan.countryName} 的销售线索搜索计划。目标为 ${state.plan.targetCount} 家，采用“${objective}”模式。确认后，LangGraph 会先执行产品、Cudy 公司与行业知识 RAG；其中产品知识通过向量、全文与结构化事实三路融合并进行置信度校验，再生成 Market Playbook、调用 Tavily 搜索及官网取证，最后由独立评分 Agent 复核后保存。`,
        };
      }
      if (state.intent !== "knowledge-question") return { reply: state.reply };
      const missing = dependencies.missingRagConfig();
      if (missing.length > 0) {
        return { reply: `知识问答服务尚未完整配置（缺少 ${missing.join(", ")}）。我没有调用外部搜索，也不会在缺少证据时编造答案。` };
      }
      try {
        const ragAnswer = await dependencies.answerKnowledge(state.userId, { question: state.content, maxChunks: 8 });
        return { reply: ragAnswer.answer, ragAnswer };
      } catch (error) {
        return { reply: knowledgeErrorMessage(error) };
      }
    })
    .addEdge(START, "interpret_request")
    .addEdge("interpret_request", "resolve_request")
    .addEdge("resolve_request", END)
    .compile();
}

const productionGraph = buildAssistantWorkflowGraph();

export async function runAssistantWorkflow(userId: string, content: string) {
  return productionGraph.invoke({ userId, content, intent: "general", reply: "" });
}
