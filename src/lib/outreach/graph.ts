import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { generateDevelopmentStrategyWithKimi, reviseDevelopmentDraftWithFeedback, type KimiDevelopmentResult } from "./kimi-agent";
import { applyFeedbackRevision, createFeedbackRecord, loadDevelopmentContext, loadDraftForFeedback, markFeedbackFailed, persistDevelopmentDraft } from "./repository";
import type { DevelopmentContext, DevelopmentFeedbackOptions, DevelopmentGenerationOptions, DevelopmentStrategyDto, OutreachFeedbackResult } from "./types";

const DevelopmentState = Annotation.Root({
  userId: Annotation<string>(),
  options: Annotation<DevelopmentGenerationOptions>(),
  context: Annotation<DevelopmentContext | undefined>(),
  generated: Annotation<KimiDevelopmentResult | undefined>(),
  result: Annotation<DevelopmentStrategyDto | undefined>(),
});

export interface DevelopmentGraphDependencies {
  loadContext: typeof loadDevelopmentContext;
  generate: typeof generateDevelopmentStrategyWithKimi;
  persist: typeof persistDevelopmentDraft;
}
const productionDependencies: DevelopmentGraphDependencies = {
  loadContext: loadDevelopmentContext,
  generate: generateDevelopmentStrategyWithKimi,
  persist: persistDevelopmentDraft,
};

export function buildDevelopmentStrategyGraph(dependencies: DevelopmentGraphDependencies = productionDependencies) {
  return new StateGraph(DevelopmentState)
    .addNode("load_candidate_context", async (state) => ({
      context: await dependencies.loadContext(state.userId, state.options),
    }))
    .addNode("create_strategy_and_draft", async (state) => {
      if (!state.context) throw new Error("Development context is missing");
      return { generated: await dependencies.generate(state.context, state.options) };
    })
    .addNode("validate_and_persist", async (state) => {
      if (!state.context || !state.generated) throw new Error("Development output is incomplete");
      const result = await dependencies.persist(state.context, {
        ...state.generated,
        recipient: state.context.recipient,
      }, {
        companyExternalId: state.options.companyExternalId,
        contactId: state.options.contactId,
        language: state.options.language,
        tone: state.options.tone,
        targetLength: state.options.targetLength,
        instructions: state.options.instructions,
        evidenceIds: state.generated.evidenceIds,
        knowledgeIds: state.generated.knowledgeIds,
        outreachKnowledge: state.context.knowledge.map((item) => ({ id: item.id, kind: item.kind,
          title: item.title, score: item.score, priorityWeight: item.priorityWeight })),
        templateIds: state.generated.templateIds,
      });
      return { result };
    })
    .addEdge(START, "load_candidate_context")
    .addEdge("load_candidate_context", "create_strategy_and_draft")
    .addEdge("create_strategy_and_draft", "validate_and_persist")
    .addEdge("validate_and_persist", END)
    .compile();
}

const productionGraph = buildDevelopmentStrategyGraph();

export async function runDevelopmentStrategyAgent(userId: string, options: DevelopmentGenerationOptions) {
  const state = await productionGraph.invoke({ userId, options });
  if (!state.result) throw new Error("开发策略 Agent 未返回持久化结果");
  return state.result;
}

const FeedbackState = Annotation.Root({
  userId: Annotation<string>(), options: Annotation<DevelopmentFeedbackOptions>(),
  context: Annotation<DevelopmentContext | undefined>(), current: Annotation<DevelopmentStrategyDto | undefined>(),
  feedbackId: Annotation<string | undefined>(),
  revised: Annotation<Awaited<ReturnType<typeof reviseDevelopmentDraftWithFeedback>> | undefined>(),
  result: Annotation<OutreachFeedbackResult | undefined>(),
});

export function buildDevelopmentFeedbackGraph() {
  return new StateGraph(FeedbackState)
    .addNode("load_review_context", async (state) => {
      const loaded = await loadDraftForFeedback(state.userId, state.options.draftId);
      if (loaded.draft.revision !== state.options.sourceRevision) {
        throw new Error("草稿已产生新版本，请刷新后重新评价");
      }
      const body = state.options.currentBody;
      return { context: loaded.context, current: { ...loaded.draft, draft: { ...loaded.draft.draft, body,
        wordCount: body.split(/\s+/).filter(Boolean).length,
        placeholders: [...body.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]) } } };
    })
    .addNode("record_user_feedback", async (state) => {
      if (!state.current) throw new Error("开发草稿上下文缺失");
      return { feedbackId: await createFeedbackRecord(state.userId, {
        draftId: state.options.draftId, feedback: state.options.feedback,
        previousBody: state.current.draft.body, sourceRevision: state.current.revision,
        allowMemory: state.options.allowMemory,
      }) };
    })
    .addNode("revise_and_screen_memory", async (state) => {
      if (!state.context || !state.current) throw new Error("反馈修改上下文缺失");
      try {
        return { revised: await reviseDevelopmentDraftWithFeedback(
          state.context, state.current, state.options.feedback,
        ) };
      } catch (error) {
        if (state.feedbackId) await markFeedbackFailed(state.userId, state.feedbackId,
          error instanceof Error ? error.message : String(error));
        throw error;
      }
    })
    .addNode("persist_revision_and_memory", async (state) => {
      if (!state.feedbackId || !state.current || !state.revised) throw new Error("反馈修改结果不完整");
      try {
        return { result: await applyFeedbackRevision(state.userId, {
          feedbackId: state.feedbackId, draft: state.current, revisedBody: state.revised.revisedBody,
          subjectOptions: state.revised.subjectOptions, model: state.revised.model,
          generationMetrics: state.revised.generationMetrics, evidenceIds: state.revised.evidenceIds,
          knowledgeIds: state.revised.knowledgeIds, allowMemory: state.options.allowMemory,
          memory: state.revised.memory,
        }) };
      } catch (error) {
        await markFeedbackFailed(state.userId, state.feedbackId,
          error instanceof Error ? error.message : String(error));
        throw error;
      }
    })
    .addEdge(START, "load_review_context")
    .addEdge("load_review_context", "record_user_feedback")
    .addEdge("record_user_feedback", "revise_and_screen_memory")
    .addEdge("revise_and_screen_memory", "persist_revision_and_memory")
    .addEdge("persist_revision_and_memory", END)
    .compile();
}

const feedbackGraph = buildDevelopmentFeedbackGraph();

export async function runDevelopmentFeedbackAgent(userId: string, options: DevelopmentFeedbackOptions) {
  const state = await feedbackGraph.invoke({ userId, options });
  if (!state.result) throw new Error("开发反馈 Agent 未返回修改结果");
  return state.result;
}
