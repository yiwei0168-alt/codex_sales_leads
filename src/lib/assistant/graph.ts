import {withProductSpend} from "@/lib/billing/context";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { getMissingRagConfig } from "@/lib/rag/config";
import { answerWithRag } from "@/lib/rag/service";
import type { RagAnswer } from "@/lib/rag/types";
import { executeKnowledgeWorkflow, knowledgeBusinessGraph } from "@/lib/knowledge/graph";
import type { KnowledgeResult } from "@/lib/knowledge/response";
import { searchExternalWithGemini } from "./external-search";
import { planAssistantRequest } from "./intent-agent";
import { synthesizeHybridAnswer } from "./synthesis";
import { startOperation,finishOperation,bestEffortMetric } from "@/lib/operation-metrics";
import { intentMetrics } from "./intent-metrics";
import type { AssistantConversationTurn, AssistantIntent, ExternalSearchAnswer, IntentPlan, LeadSearchPlan } from "./types";

export const AssistantState = Annotation.Root({
  userId: Annotation<string>(),
  content: Annotation<string>(),
  history: Annotation<AssistantConversationTurn[]>(),
  intent: Annotation<AssistantIntent>(),
  intentPlan: Annotation<IntentPlan | undefined>(),
  plan: Annotation<LeadSearchPlan | undefined>(),
  reply: Annotation<string>(),
  ragAnswer: Annotation<RagAnswer | undefined>(),
  knowledgeResult: Annotation<KnowledgeResult | undefined>(),
  externalAnswer: Annotation<ExternalSearchAnswer | undefined>(),
  internalError: Annotation<string | undefined>(),
  externalError: Annotation<string | undefined>(),
  warnings: Annotation<string[]>(),
});

export interface AssistantGraphDependencies {
  recordIntent?: (userId:string,content:string,history:AssistantConversationTurn[],run:()=>Promise<IntentPlan>)=>Promise<IntentPlan>;
  planRequest: typeof planAssistantRequest;
  answerKnowledge: typeof answerWithRag;
  answerKnowledgeWorkflow: typeof executeKnowledgeWorkflow;
  searchExternal: typeof searchExternalWithGemini;
  synthesizeHybrid: typeof synthesizeHybridAnswer;
  missingRagConfig: typeof getMissingRagConfig;
}

const productionDependencies: AssistantGraphDependencies = {
  recordIntent:async(userId,content,history,run)=>{
    const started=Date.now();const turns=history.slice(-8);const inputItems=turns.length+1;
    const inputCharacters=content.slice(0,8000).length+turns.reduce((sum,turn)=>sum+turn.content.slice(0,4000).length,0);
    // Reserve before invoking the provider: process loss remains running/unsettled, never zero cost.
    const id=await startOperation(userId,"assistant-intent",inputItems,inputCharacters);
    try{const result=await run();const saved=await bestEffortMetric(()=>finishOperation(userId,id,"completed",intentMetrics(result,inputItems,inputCharacters,Date.now()-started)));
      if(!saved)result.warnings.push("意图识别已完成，但用量记录未结算；不要为修复统计而重复调用模型。");return result;
    }catch(error){await bestEffortMetric(()=>finishOperation(userId,id,"failed",intentMetrics(undefined,inputItems,inputCharacters,Date.now()-started)));throw error;}
  },
  planRequest: planAssistantRequest,
  answerKnowledge: answerWithRag,
  answerKnowledgeWorkflow: executeKnowledgeWorkflow,
  searchExternal: searchExternalWithGemini,
  synthesizeHybrid: synthesizeHybridAnswer,
  missingRagConfig: getMissingRagConfig,
};

export function knowledgeErrorMessage(error: unknown): string {
  let status:number|undefined,current=error;
  for(let depth=0;depth<4&&typeof status!=="number";depth++){
    if(typeof current!=="object"||current===null)break;
    if("status" in current){const value=Number((current as {status?:unknown}).status);
      if(Number.isInteger(value)&&value>=100&&value<=599)status=value;}
    current="cause" in current?(current as {cause?:unknown}).cause:undefined;
  }
  if (status === 401) return "知识库检索已成功，但回答模型认证失败。请检查服务端模型密钥后重试。";
  if (status === 403) return "知识库检索已成功，但回答模型拒绝了请求（可能是地域或访问权限限制）。请检查服务端模型配置后重试。";
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
      const run=()=>dependencies.planRequest(state.content,state.history??[]);
      const intentPlan = await (dependencies.recordIntent?dependencies.recordIntent(state.userId,state.content,state.history??[],run):run());
      return { intent: intentPlan.intent, intentPlan, plan: intentPlan.leadPlan, reply: intentPlan.reply ?? "", warnings: intentPlan.warnings };
    })
    .addNode("respond_budget_change", () => ({
      reply: "已解析预算修改提案，请核对范围和累计美元上限后在下方确认；没有修改预算或启动任务。",
    }))
    .addNode("respond_product_action", () => ({
      reply: "正在查询当前账号已保存的候选公司；没有添加搜索或生成邮件。",
    }))
    .addNode("respond_lead_plan", (state) => {
      if (!state.plan) throw new Error("Lead-search intent completed without a plan");
      const objective = state.plan.objective === "new-market" ? "新市场并行开发" : "已有分销体系增长";
      return { reply: `我已生成 ${state.plan.countryName} 的销售线索搜索计划。目标为 ${state.plan.targetCount} 家，采用“${objective}”模式。确认后，LangGraph 会先执行产品、Cudy 公司与行业知识 RAG；其中产品知识通过向量、全文与结构化事实三路融合并进行置信度校验，再生成 Market Playbook、按候选类别调用混合搜索与轻量门禁；Tavily 仅用于后续定向补证，最后由独立评分 Agent 复核后保存。你也可以直接回复修改国家、数量或渠道类型。` };
    })
    .addNode("respond_general", (state) => ({
      reply: state.reply || "我可以查询 Cudy 内部知识、结合实时网页信息回答，也可以先设计并等待你确认销售线索搜索计划。",
    }))
    .addNode("respond_clarification", (state) => ({
      reply: state.reply || "我还不能可靠判断你的目标。请补充你要查询的对象、市场和期望结果，我会继续确认。",
    }))
    .addNode("retrieve_internal_knowledge", async (state) => {
      const internalQuestion = state.intentPlan?.internalQuestion || state.content;
      try {
        const knowledgeResult = await dependencies.answerKnowledgeWorkflow(state.userId, {
          question: internalQuestion,
          history: state.history,
          entry: "assistant",
        });
        const ragAnswer = knowledgeResult.ragAnswer;
        return {
          reply: knowledgeResult.answer,
          knowledgeResult,
          ragAnswer,
          warnings: [...state.warnings, ...(ragAnswer?.warnings ?? [])],
        };
      } catch (error) {
        return { reply: knowledgeErrorMessage(error) };
      }
    }, {
      subgraphs: [knowledgeBusinessGraph],
      metadata: { layer: "business", workflow: "knowledge" },
    })
    .addNode("retrieve_hybrid_internal", async (state) => {
      const internalQuestion = state.intentPlan?.internalQuestion || state.content;
      const missing = dependencies.missingRagConfig();
      try {
        if (missing.length > 0) throw new Error(`内部 RAG 缺少配置：${missing.join(", ")}`);
        return { ragAnswer: await dependencies.answerKnowledge(state.userId, { question: internalQuestion, maxChunks: 8 }) };
      } catch (error) {
        const internalError = knowledgeErrorMessage(error);
        return { ragAnswer: emptyInternalAnswer(internalError), internalError };
      }
    })
    .addNode("retrieve_hybrid_external", async (state) => {
      try {
        return { externalAnswer: await dependencies.searchExternal(state.intentPlan?.externalQuestions ?? []) };
      } catch (error) {
        return { externalError: externalErrorMessage(error) };
      }
    })
    .addNode("synthesize_hybrid_answer", async (state) => {
      const ragAnswer = state.ragAnswer ?? emptyInternalAnswer(state.internalError ?? "内部知识库本次没有返回可用证据。");
      if (state.externalError || !state.externalAnswer) {
        const warning = state.externalError ?? "外部网页检索失败：未返回可用结果";
        return {
          reply: state.internalError ? `${ragAnswer.warnings[0]}\n${warning}` : `${ragAnswer.answer}\n\n${warning}`,
          ragAnswer, warnings: [...state.warnings, ...ragAnswer.warnings, warning],
        };
      }
      try {
        const reply = await dependencies.synthesizeHybrid(state.content, ragAnswer, state.externalAnswer);
        return { reply, ragAnswer, warnings: [...state.warnings, ...ragAnswer.warnings] };
      } catch (error) {
        const warning = `OpenAI 证据整合失败：${error instanceof Error ? error.message : "unknown error"}`;
        return {
          reply: `${ragAnswer.answer}\n\n外部检索结果：\n${state.externalAnswer.answer}\n\n${warning}`,
          ragAnswer,
          warnings: [...state.warnings, ...ragAnswer.warnings, warning],
        };
      }
    })
    .addEdge(START, "plan_request")
    .addConditionalEdges("plan_request", (state) => {
      if (state.intent === "budget-change") return "respond_budget_change";
      if (state.intent === "product-action") return "respond_product_action";
      if (state.intent === "lead-search") return "respond_lead_plan";
      if (state.intent === "general") return "respond_general";
      if (state.intent === "clarification") return "respond_clarification";
      if (state.intent === "knowledge-question") return "retrieve_internal_knowledge";
      return ["retrieve_hybrid_internal", "retrieve_hybrid_external"];
    })
    .addEdge("respond_budget_change", END)
    .addEdge("respond_product_action", END)
    .addEdge("respond_lead_plan", END)
    .addEdge("respond_general", END)
    .addEdge("respond_clarification", END)
    .addEdge("retrieve_internal_knowledge", END)
    .addEdge(["retrieve_hybrid_internal", "retrieve_hybrid_external"], "synthesize_hybrid_answer")
    .addEdge("synthesize_hybrid_answer", END)
    .compile({
      name: "assistant_business_flow",
      description: "Intent planning, grounded knowledge resolution, external research, and answer synthesis.",
    });
}

export const assistantBusinessGraph = buildAssistantWorkflowGraph();

export async function executeAssistantWorkflowGraph(
  userId: string,
  content: string,
  history: AssistantConversationTurn[] = [],
) {
  return withProductSpend(userId, "assistant", () => assistantBusinessGraph.invoke({
    userId,
    content,
    history,
    intent: "general",
    reply: "",
    warnings: [],
  }));
}

export async function runAssistantWorkflow(userId: string, content: string, history: AssistantConversationTurn[] = []) {
  return executeAssistantWorkflowGraph(userId, content, history);
}
