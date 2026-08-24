import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { generateDevelopmentStrategyWithKimi, type KimiDevelopmentResult } from "./kimi-agent";
import { loadDevelopmentContext, persistDevelopmentDraft } from "./repository";
import type { DevelopmentContext, DevelopmentGenerationOptions, DevelopmentStrategyDto } from "./types";

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
