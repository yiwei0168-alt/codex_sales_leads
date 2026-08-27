import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { getPool } from "@/lib/rag/db";

import { collectLeadEvidence, discoverLeadCandidates } from "./discovery";
import { LeadEvidenceCorrectionAgent } from "./evidence-correction-agent";
import { getGlobalWorkspaceId, persistLeadWorkflowResult, updateWorkflowPhase } from "./persistence";
import { buildLeadMarketPlaybook } from "./playbook";
import { LeadQualificationAgent } from "./qualification-agent";
import { retrieveLeadRagContext } from "./rag-context";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadCandidateAssessment,
  LeadMarketPlaybook,
  LeadRagCitation,
  LeadWorkflowCandidate,
  LeadWorkflowPhase,
  LeadWorkflowResult,
  LeadWorkflowState,
} from "./types";

const WorkflowAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  actionId: Annotation<string>(),
  graphThreadId: Annotation<string>(),
  workspaceId: Annotation<string>(),
  plan: Annotation<LeadSearchPlan>(),
  phase: Annotation<LeadWorkflowPhase>(),
  ragContext: Annotation<LeadRagCitation[]>(),
  playbook: Annotation<LeadMarketPlaybook | undefined>(),
  runId: Annotation<string | undefined>(),
  candidates: Annotation<LeadWorkflowCandidate[]>(),
  correctedCandidates: Annotation<CorrectedLeadWorkflowCandidate[]>(),
  assessments: Annotation<LeadCandidateAssessment[]>(),
  creditsUsed: Annotation<number>(),
  warnings: Annotation<string[]>(),
  result: Annotation<LeadWorkflowResult | undefined>(),
});

export interface LeadWorkflowDependencies {
  retrieveRagContext: typeof retrieveLeadRagContext;
  buildPlaybook: typeof buildLeadMarketPlaybook;
  discover: typeof discoverLeadCandidates;
  collectEvidence: typeof collectLeadEvidence;
  correctionAgent: Pick<LeadEvidenceCorrectionAgent, "correct">;
  qualificationAgent: Pick<LeadQualificationAgent, "evaluate">;
  persist: typeof persistLeadWorkflowResult;
  updatePhase: typeof updateWorkflowPhase;
}

const productionDependencies: LeadWorkflowDependencies = {
  retrieveRagContext: retrieveLeadRagContext,
  buildPlaybook: buildLeadMarketPlaybook,
  discover: discoverLeadCandidates,
  collectEvidence: collectLeadEvidence,
  correctionAgent: new LeadEvidenceCorrectionAgent(),
  qualificationAgent: new LeadQualificationAgent(),
  persist: persistLeadWorkflowResult,
  updatePhase: updateWorkflowPhase,
};

async function phase(dependencies: LeadWorkflowDependencies, state: typeof WorkflowAnnotation.State, next: LeadWorkflowPhase): Promise<void> {
  await dependencies.updatePhase(state.userId, state.actionId, next);
}

export function buildLeadWorkflowGraph(
  dependencies: LeadWorkflowDependencies = productionDependencies,
  checkpointer?: BaseCheckpointSaver,
) {
  const graph = new StateGraph(WorkflowAnnotation)
    .addNode("retrieve_knowledge", async (state) => {
      await phase(dependencies, state, "retrieving-knowledge");
      const ragContext = await dependencies.retrieveRagContext(state.userId, state.plan);
      const collections = new Set(ragContext.map((item) => item.collection));
      const missing = (["product", "company", "industry"] as const).filter((collection) => !collections.has(collection));
      if (missing.length > 0) throw new Error(`Pre-search RAG gate failed; missing usable ${missing.join(", ")} context.`);
      if (!ragContext.some((item) => item.collection === "product" && item.corroborated
        && item.retrievalSignals.includes("structured"))) {
        throw new Error("Pre-search RAG gate failed; product context lacks independent structured/text retrieval corroboration.");
      }
      return { phase: "retrieving-knowledge" as const, ragContext };
    })
    .addNode("build_playbook", async (state) => {
      await phase(dependencies, state, "planning");
      const playbook = await dependencies.buildPlaybook(state.plan, state.ragContext);
      return { phase: "planning" as const, playbook, warnings: [...state.warnings, ...playbook.warnings] };
    })
    .addNode("discover_candidates", async (state) => {
      await phase(dependencies, state, "discovering");
      if (!state.playbook) throw new Error("Market Playbook is missing before discovery");
      const discovered = await dependencies.discover(state.actionId, state.workspaceId, state.plan, state.playbook, state.graphThreadId);
      return {
        phase: "discovering" as const,
        runId: discovered.runId,
        candidates: discovered.candidates,
        creditsUsed: state.creditsUsed + discovered.creditsUsed,
        warnings: [...state.warnings, ...discovered.warnings],
      };
    })
    .addNode("collect_evidence", async (state) => {
      await phase(dependencies, state, "collecting-evidence");
      const enriched = await dependencies.collectEvidence(state.candidates, state.plan);
      return {
        phase: "collecting-evidence" as const,
        candidates: enriched.candidates,
        creditsUsed: state.creditsUsed + enriched.creditsUsed,
        warnings: [...state.warnings, ...enriched.warnings],
      };
    })
    .addNode("correct_candidates", async (state) => {
      await phase(dependencies, state, "correcting-evidence");
      const corrected = await dependencies.correctionAgent.correct(state.candidates, state.plan);
      return {
        phase: "correcting-evidence" as const,
        correctedCandidates: corrected.candidates,
        creditsUsed: state.creditsUsed + corrected.creditsUsed,
        warnings: [...state.warnings, ...corrected.warnings],
      };
    })
    .addNode("score_candidates", async (state) => {
      await phase(dependencies, state, "scoring");
      if (!state.playbook) throw new Error("Market Playbook is missing before qualification");
      const assessments = await dependencies.qualificationAgent.evaluate(
        state.correctedCandidates, state.playbook, state.plan.countryCode, state.plan.countryName, state.plan.objective,
      );
      return { phase: "scoring" as const, assessments };
    })
    .addNode("persist_results", async (state) => {
      await phase(dependencies, state, "persisting");
      if (!state.playbook || !state.runId) throw new Error("Workflow cannot persist without playbook and run ID");
      const result = await dependencies.persist({
        userId: state.userId,
        actionId: state.actionId,
        workspaceId: state.workspaceId,
        graphThreadId: state.graphThreadId,
        runId: state.runId,
        countryCode: state.plan.countryCode,
        countryName: state.plan.countryName,
        requested: state.plan.targetCount,
        creditsUsed: state.creditsUsed,
        ragContext: state.ragContext,
        playbook: state.playbook,
        candidates: state.correctedCandidates,
        assessments: state.assessments,
        warnings: state.warnings,
      });
      await phase(dependencies, state, "completed");
      return { phase: "completed" as const, result };
    })
    .addEdge(START, "retrieve_knowledge")
    .addEdge("retrieve_knowledge", "build_playbook")
    .addEdge("build_playbook", "discover_candidates")
    .addEdge("discover_candidates", "collect_evidence")
    .addEdge("collect_evidence", "correct_candidates")
    .addEdge("correct_candidates", "score_candidates")
    .addEdge("score_candidates", "persist_results")
    .addEdge("persist_results", END);
  return graph.compile(checkpointer ? { checkpointer } : undefined);
}

let productionGraph: ReturnType<typeof buildLeadWorkflowGraph> | undefined;

function getProductionGraph() {
  if (!productionGraph) {
    const checkpointer = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
    productionGraph = buildLeadWorkflowGraph(productionDependencies, checkpointer);
  }
  return productionGraph;
}

export async function runLeadWorkflow(input: {
  userId: string;
  actionId: string;
  graphThreadId: string;
  plan: LeadSearchPlan;
}): Promise<LeadWorkflowResult> {
  const initial: LeadWorkflowState = {
    ...input,
    workspaceId: await getGlobalWorkspaceId(input.userId),
    phase: "queued",
    ragContext: [],
    candidates: [],
    correctedCandidates: [],
    assessments: [],
    creditsUsed: 0,
    warnings: [],
  };
  const state = await getProductionGraph().invoke(initial, {
    configurable: { thread_id: input.graphThreadId },
    recursionLimit: 20,
  });
  if (!state.result) throw new Error("LangGraph workflow completed without a result");
  return state.result;
}
