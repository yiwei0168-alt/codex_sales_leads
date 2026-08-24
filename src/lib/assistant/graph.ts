import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { getMissingRagConfig } from "@/lib/rag/config";
import { answerWithRag } from "@/lib/rag/service";
import type { RagAnswer } from "@/lib/rag/types";
import { searchExternalWithGemini } from "./external-search";
import { planAssistantRequest } from "./intent-agent";
import { synthesizeHybridAnswer } from "./synthesis";
import type { AssistantConversationTurn, AssistantIntent, ExternalSearchAnswer, IntentPlan, LeadSearchPlan } from "./types";

const AssistantState = Annotation.Root({
  userId: Annotation<string>(),
  content: Annotation<string>(),
  history: Annotation<AssistantConversationTurn[]>(),
  intent: Annotation<AssistantIntent>(),
  intentPlan: Annotation<IntentPlan | undefined>(),
  plan: Annotation<LeadSearchPlan | undefined>(),
  reply: Annotation<string>(),
  ragAnswer: Annotation<RagAnswer | undefined>(),
  externalAnswer: Annotation<ExternalSearchAnswer | undefined>(),
  warnings: Annotation<string[]>(),
});

export interface AssistantGraphDependencies {
  planRequest: typeof planAssistantRequest;
  answerKnowledge: typeof answerWithRag;
  searchExternal: typeof searchExternalWithGemini;
  synthesizeHybrid: typeof synthesizeHybridAnswer;
  missingRagConfig: typeof getMissingRagConfig;
}

const productionDependencies: AssistantGraphDependencies = {
  planRequest: planAssistantRequest,
  answerKnowledge: answerWithRag,
  searchExternal: searchExternalWithGemini,
  synthesizeHybrid: synthesizeHybridAnswer,
  missingRagConfig: getMissingRagConfig,
};

export function knowledgeErrorMessage(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status) : undefined;
  if (status === 401 || status === 403) return "知识库检索已成功，但回答模型认证失败。请检查服务端模型网关配置后重试。";
  if (status === 429) return "知识库检索已成功，但回答模型当前限流。请稍后重试。";
  if (status && status >= 500) return "知识库检索已成功，但回答模型暂时不可用。请稍后重试。";
  return error instanceof Error ? `知识库查询失败：${error.message}` : "知识库查询失败，请稍后重试。";
}

function externalErrorMessage(error: unknown): string {
  return error instanceof Error ? `外部网页检索失败：${error.message}` : "外部网页检索失败，请稍后重试。";
}

function emptyInternalAnswer(warning: string): RagAnswer {
  return { answer: "内部知识库本次没有返回可用证据。", citations: [], grounded: false, model: "none", latencyMs: 0, warnings: [warning] };
}

export function buildAssistantWorkflowGraph(dependencies: AssistantGraphDependencies = productionDependencies) {
  return new StateGraph(AssistantState)
    .addNode("plan_request", async (state) => {
      const intentPlan = await dependencies.planRequest(state.content, state.history ?? []);
      return { intent: intentPlan.intent, intentPlan, plan: intentPlan.leadPlan, reply: intentPlan.reply ?? "", warnings: intentPlan.warnings };
    })
    .addNode("resolve_request", async (state) => {
      if (state.intent === "lead-search" && state.plan) {
        const objective = state.plan.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长";
        return { reply: `我已生成 ${state.plan.countryName} 的销售线索搜索计划。目标为 ${state.plan.targetCount} 家，采用“${objective}”模式。确认后，LangGraph 会先执行产品、Cudy 公司与行业知识 RAG；其中产品知识通过向量、全文与结构化事实三路融合并进行置信度校验，再生成 Market Playbook、调用 Tavily 搜索及官网取证，最后由独立评分 Agent 复核后保存。你也可以直接回复修改国家、数量或渠道类型。` };
      }
      if (state.intent === "general") {
        return { reply: state.reply || "我可以查询 Cudy 内部知识、结合实时网页信息回答，也可以先设计并等待你确认销售线索搜索计划。" };
      }
      if (state.intent === "clarification") {
        return { reply: state.reply || "我还不能可靠判断你的目标。请补充你要查询的对象、市场和期望结果，我会继续确认。" };
      }

      const internalQuestion = state.intentPlan?.internalQuestion || state.content;
      const missing = dependencies.missingRagConfig();
      if (state.intent === "knowledge-question") {
        if (missing.length > 0) {
          return { reply: `知识问答服务尚未完整配置（缺少 ${missing.join(", ")}）。我没有调用外部搜索，也不会在缺少证据时编造答案。` };
        }
        try {
          const ragAnswer = await dependencies.answerKnowledge(state.userId, { question: internalQuestion, maxChunks: 8 });
          return { reply: ragAnswer.answer, ragAnswer, warnings: [...state.warnings, ...ragAnswer.warnings] };
        } catch (error) {
          return { reply: knowledgeErrorMessage(error) };
        }
      }

      const externalQuestions = state.intentPlan?.externalQuestions ?? [];
      const internalPromise = missing.length === 0
        ? dependencies.answerKnowledge(state.userId, { question: internalQuestion, maxChunks: 8 })
        : Promise.reject(new Error(`内部 RAG 缺少配置：${missing.join(", ")}`));
      const [internalResult, externalResult] = await Promise.allSettled([
        internalPromise,
        dependencies.searchExternal(externalQuestions),
      ]);
      const ragAnswer = internalResult.status === "fulfilled" ? internalResult.value
        : emptyInternalAnswer(knowledgeErrorMessage(internalResult.reason));
      if (externalResult.status === "rejected") {
        const warning = externalErrorMessage(externalResult.reason);
        return {
          reply: internalResult.status === "fulfilled" ? `${ragAnswer.answer}\n\n${warning}` : `${ragAnswer.warnings[0]}\n${warning}`,
          ragAnswer, warnings: [...state.warnings, ...ragAnswer.warnings, warning],
        };
      }
      try {
        const reply = await dependencies.synthesizeHybrid(state.content, ragAnswer, externalResult.value);
        return { reply, ragAnswer, externalAnswer: externalResult.value, warnings: [...state.warnings, ...ragAnswer.warnings] };
      } catch (error) {
        const warning = `OpenAI 证据整合失败：${error instanceof Error ? error.message : "unknown error"}`;
        return {
          reply: `${ragAnswer.answer}\n\n外部检索结果：\n${externalResult.value.answer}\n\n${warning}`,
          ragAnswer, externalAnswer: externalResult.value,
          warnings: [...state.warnings, ...ragAnswer.warnings, warning],
        };
      }
    })
    .addEdge(START, "plan_request")
    .addEdge("plan_request", "resolve_request")
    .addEdge("resolve_request", END)
    .compile();
}

const productionGraph = buildAssistantWorkflowGraph();

export async function runAssistantWorkflow(userId: string, content: string, history: AssistantConversationTurn[] = []) {
  return productionGraph.invoke({ userId, content, history, intent: "general", reply: "", warnings: [] });
}
