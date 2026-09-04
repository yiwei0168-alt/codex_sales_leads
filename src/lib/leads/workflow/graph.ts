import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { getPool } from "@/lib/rag/db";

import { collectLeadEvidence, discoverLeadCandidates } from "./discovery";
import { LeadAssessmentReviewAgent } from "./assessment-review-agent";
import { LeadEvidenceCorrectionAgent } from "./evidence-correction-agent";
import { getGlobalWorkspaceId, persistLeadWorkflowResult, updateWorkflowPhase } from "./persistence";
import { LeadHandoffAssembler } from "./handoff-assembler";
import { buildLeadMarketPlaybook } from "./playbook";
import { LeadQualificationAgent } from "./qualification-agent";
import { retrieveLeadRagContext } from "./rag-context";
import { retrieveCooperationPathMemory } from "../path-memory";
import { completedStageMetric } from "./workflow-telemetry";
import { loadCachedLeadAssessments, saveCachedLeadAssessments } from "./assessment-cache";
import { loadCachedLeadPlaybook, saveCachedLeadPlaybook } from "./playbook-cache";
import { nextNoFinalRoundCount, plannedCandidatePool, targetCompletionDecision,
  type TargetCompletionReason } from "./target-completion-policy";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadCandidateAssessment,
  LeadAssessmentReview,
  LeadDevelopmentHandoff,
  LeadMarketPlaybook,
  LeadRagCitation,
  LeadWorkflowCandidate,
  LeadWorkflowPhase,
  LeadWorkflowResult,
  LeadWorkflowState,
  WorkflowModelUsage,
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
  discoveryRound: Annotation<number | undefined>(),
  discoveredUniqueCount: Annotation<number | undefined>(),
  searchExcludeDomains: Annotation<string[] | undefined>(),
  consecutiveNoFinalRounds: Annotation<number | undefined>(),
  acceptedCandidateCount: Annotation<number | undefined>(),
  targetShouldContinue: Annotation<boolean | undefined>(),
  targetCompletionReason: Annotation<TargetCompletionReason | undefined>(),
  assessmentReviews: Annotation<LeadAssessmentReview[]>(),
  handoffs: Annotation<LeadDevelopmentHandoff[]>(),
  creditsUsed: Annotation<number>(),
  modelUsage: Annotation<WorkflowModelUsage[]>(),
  stageMetrics: Annotation<LeadWorkflowState["stageMetrics"]>(),
  warnings: Annotation<string[]>(),
  result: Annotation<LeadWorkflowResult | undefined>(),
});

export interface LeadWorkflowDependencies {
  retrieveRagContext: typeof retrieveLeadRagContext;
  buildPlaybook: typeof buildLeadMarketPlaybook;
  discover: typeof discoverLeadCandidates;
  collectEvidence: typeof collectLeadEvidence;
  correctionAgent: { correct(candidates: LeadWorkflowCandidate[], plan: LeadSearchPlan): Promise<{
    candidates: CorrectedLeadWorkflowCandidate[];
    creditsUsed: number;
    usage?: WorkflowModelUsage[];
    warnings: string[];
    cacheHits?: number;
    cacheMisses?: number;
    providerMetrics?: { provider: "tavily"; attempts: number; retries: number; latencyMs: number };
  }> };
  qualificationAgent: Pick<LeadQualificationAgent, "evaluate"> & Partial<Pick<LeadQualificationAgent, "evaluateWithUsage">>;
  assessmentReviewAgent: Pick<LeadAssessmentReviewAgent, "review">;
  handoffAssembler: Pick<LeadHandoffAssembler, "assemble">;
  persist: typeof persistLeadWorkflowResult;
  updatePhase: typeof updateWorkflowPhase;
  retrievePathMemory?: typeof retrieveCooperationPathMemory;
  loadPlaybookCache?: typeof loadCachedLeadPlaybook;
  savePlaybookCache?: typeof saveCachedLeadPlaybook;
  loadAssessmentCache?: typeof loadCachedLeadAssessments;
  saveAssessmentCache?: typeof saveCachedLeadAssessments;
}

const productionDependencies: LeadWorkflowDependencies = {
  retrieveRagContext: retrieveLeadRagContext,
  buildPlaybook: buildLeadMarketPlaybook,
  discover: discoverLeadCandidates,
  collectEvidence: collectLeadEvidence,
  correctionAgent: new LeadEvidenceCorrectionAgent(),
  qualificationAgent: new LeadQualificationAgent(),
  assessmentReviewAgent: new LeadAssessmentReviewAgent(),
  handoffAssembler: new LeadHandoffAssembler(),
  persist: persistLeadWorkflowResult,
  updatePhase: updateWorkflowPhase,
  retrievePathMemory: retrieveCooperationPathMemory,
  loadPlaybookCache: loadCachedLeadPlaybook,
  savePlaybookCache: saveCachedLeadPlaybook,
  loadAssessmentCache: loadCachedLeadAssessments,
  saveAssessmentCache: saveCachedLeadAssessments,
};

async function phase(dependencies: LeadWorkflowDependencies, state: typeof WorkflowAnnotation.State, next: LeadWorkflowPhase): Promise<void> {
  await dependencies.updatePhase(state.userId, state.actionId, next);
}

function mergeByCandidateId<T extends { candidateId: string }>(previous: T[], current: T[]): T[] {
  const merged = new Map(previous.map((item) => [item.candidateId, item]));
  for (const item of current) merged.set(item.candidateId, item);
  return [...merged.values()];
}

function candidateMatchesRequestedRole(candidate: CorrectedLeadWorkflowCandidate, plan: LeadSearchPlan): boolean {
  return candidate.correction.primaryRole !== "Hybrid" && candidate.correction.primaryRole !== "Unresolved"
    && plan.roles.includes(candidate.correction.primaryRole);
}

export function buildLeadWorkflowGraph(
  dependencies: LeadWorkflowDependencies = productionDependencies,
  checkpointer?: BaseCheckpointSaver,
) {
  const graph = new StateGraph(WorkflowAnnotation)
    .addNode("retrieve_knowledge", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "retrieving-knowledge");
      const ragContext = await dependencies.retrieveRagContext(state.userId, state.plan);
      const collections = new Set(ragContext.map((item) => item.collection));
      const missing = (["product", "company", "industry"] as const).filter((collection) => !collections.has(collection));
      if (missing.length > 0) throw new Error(`Pre-search RAG gate failed; missing usable ${missing.join(", ")} context.`);
      if (!ragContext.some((item) => item.collection === "product" && item.corroborated
        && item.retrievalSignals.includes("structured"))) {
        throw new Error("Pre-search RAG gate failed; product context lacks independent structured/text retrieval corroboration.");
      }
      const metric = completedStageMetric({ stage: "retrieve_knowledge", startedAt, input: state.plan,
        output: ragContext, inputItems: 1, outputItems: ragContext.length,
        generatedArtifacts: ragContext.length, validArtifacts: ragContext.length,
        downstreamUsedArtifacts: ragContext.length });
      return { phase: "retrieving-knowledge" as const, ragContext,
        stageMetrics: [...(state.stageMetrics ?? []), metric] };
    })
    .addNode("build_playbook", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "planning");
      const cachedPlaybook = dependencies.loadPlaybookCache
        ? await dependencies.loadPlaybookCache(state.userId, state.workspaceId, state.plan, state.ragContext)
        : null;
      const playbook = cachedPlaybook ?? await dependencies.buildPlaybook(state.plan, state.ragContext);
      if (!cachedPlaybook && dependencies.savePlaybookCache) {
        await dependencies.savePlaybookCache(state.userId, state.workspaceId, state.plan, state.ragContext, playbook);
      }
      const cooperationPathMemory = dependencies.retrievePathMemory
        ? await dependencies.retrievePathMemory(state.userId, state.workspaceId, state.plan.countryCode) : [];
      const output = { ...playbook, cooperationPathMemory };
      const metric = { ...completedStageMetric({ stage: "build_playbook", startedAt, input: state.ragContext,
        output, inputItems: state.ragContext.length, outputItems: 1,
        generatedArtifacts: cachedPlaybook ? 0 : 1, validArtifacts: 1, downstreamUsedArtifacts: 1,
        metadata: { cacheHit: Boolean(cachedPlaybook) } }),
      status: cachedPlaybook ? "cache-hit" as const : "completed" as const };
      return { phase: "planning" as const, playbook: output,
        warnings: [...state.warnings, ...playbook.warnings], stageMetrics: [...(state.stageMetrics ?? []), metric] };
    })
    .addNode("discover_candidates", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "discovering");
      if (!state.playbook) throw new Error("Market Playbook is missing before discovery");
      const round = state.discoveryRound ?? 0;
      const targetPool = plannedCandidatePool({ targetCount: state.plan.targetCount,
        acceptedCount: state.acceptedCandidateCount ?? 0,
        discoveredUniqueCount: state.discoveredUniqueCount ?? 0, round });
      const discovered = await dependencies.discover(state.actionId, state.workspaceId, state.plan,
        state.playbook, state.graphThreadId, { queryRound: round, targetPoolOverride: targetPool,
          excludeDomains: state.searchExcludeDomains ?? [], existingRunId: state.runId });
      const calls = discovered.callMetrics ?? [];
      const rawResults = calls.reduce((sum, call) => sum + call.rawResults, 0);
      const newUniqueCompanies = calls.reduce((sum, call) => sum + call.newUniqueCompanies, 0);
      const metric = completedStageMetric({ stage: "discover_candidates", startedAt,
        input: { plan: state.plan, playbookQueries: state.playbook.searchQueries }, output: discovered.candidates,
        inputItems: calls.length || state.playbook.searchQueries.length, outputItems: discovered.candidates.length,
        paidSearchCredits: discovered.creditsUsed,
        generatedArtifacts: calls.length ? rawResults : discovered.candidates.length,
        validArtifacts: calls.length ? newUniqueCompanies
          : discovered.candidates.filter((candidate) => Boolean(candidate.domain)).length,
        downstreamUsedArtifacts: discovered.candidates.length,
        metadata: calls.length ? {
          providerCalls: calls.length,
          completedCalls: calls.filter((call) => call.status === "completed").length,
          completedFreshCalls: calls.filter((call) => call.status === "completed" && call.cacheStatus === "miss").length,
          failedCalls: calls.filter((call) => call.status === "failed").length,
          unavailableCalls: calls.filter((call) => call.status === "failed"
            || call.discardedReasonCounts["circuit-open"] > 0
            || call.discardedReasonCounts["failed-call-cache-hit"] > 0).length,
          skippedCalls: calls.filter((call) => call.status === "skipped").length,
          retries: calls.reduce((sum, call) => sum + call.retryCount, 0),
          discardedOutputs: calls.reduce((sum, call) => sum + call.rejectedResults, 0),
          duplicateOutputs: calls.reduce((sum, call) => sum + call.existingCompanyHits, 0),
          totalProviderLatencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
          round, targetPool,
        } : {} });
      return {
        phase: "discovering" as const,
        runId: discovered.runId,
        candidates: discovered.candidates,
        discoveryRound: round + 1,
        discoveredUniqueCount: (state.discoveredUniqueCount ?? 0) + newUniqueCompanies,
        searchExcludeDomains: [...new Set([...(state.searchExcludeDomains ?? []),
          ...discovered.candidates.map((candidate) => candidate.domain)])],
        creditsUsed: state.creditsUsed + discovered.creditsUsed,
        modelUsage: [...(state.modelUsage ?? []), ...(discovered.modelUsage ?? [])],
        warnings: [...state.warnings, ...discovered.warnings],
        stageMetrics: [...(state.stageMetrics ?? []), metric],
      };
    })
    .addNode("collect_evidence", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "collecting-evidence");
      const enriched = await dependencies.collectEvidence(state.candidates, state.plan);
      const evidenceCount = enriched.candidates.flatMap((candidate) => candidate.evidence).length;
      const validEvidenceCount = enriched.candidates.flatMap((candidate) => candidate.evidence)
        .filter((item) => item.sourceType !== "discovery").length;
      const metric = completedStageMetric({ stage: "collect_evidence", startedAt,
        input: state.candidates.map((candidate) => candidate.candidateId), output: enriched.candidates,
        inputItems: state.candidates.length, outputItems: evidenceCount, paidSearchCredits: enriched.creditsUsed,
        generatedArtifacts: evidenceCount, validArtifacts: validEvidenceCount,
        downstreamUsedArtifacts: validEvidenceCount,
        metadata: { providerAttempts: enriched.providerMetrics?.attempts ?? 0,
          retries: enriched.providerMetrics?.retries ?? 0,
          providerLatencyMs: enriched.providerMetrics?.latencyMs ?? 0 } });
      return {
        phase: "collecting-evidence" as const,
        candidates: enriched.candidates,
        creditsUsed: state.creditsUsed + enriched.creditsUsed,
        warnings: [...state.warnings, ...enriched.warnings],
        stageMetrics: [...(state.stageMetrics ?? []), metric],
      };
    })
    .addNode("correct_candidates", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "correcting-evidence");
      const corrected = await dependencies.correctionAgent.correct(state.candidates, state.plan);
      const valid = corrected.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length;
      const inScope = corrected.candidates.filter((candidate) => candidateMatchesRequestedRole(candidate, state.plan)).length;
      const correctedCandidates = mergeByCandidateId(state.correctedCandidates ?? [], corrected.candidates);
      const metric = completedStageMetric({ stage: "correct_candidates", startedAt,
        input: state.candidates, output: corrected.candidates, inputItems: state.candidates.length,
        outputItems: corrected.candidates.length, paidSearchCredits: corrected.creditsUsed,
        generatedArtifacts: corrected.candidates.length, validArtifacts: valid, downstreamUsedArtifacts: inScope,
        metadata: { cacheHits: corrected.cacheHits ?? 0, cacheMisses: corrected.cacheMisses ?? state.candidates.length,
          providerAttempts: corrected.providerMetrics?.attempts ?? 0,
          retries: corrected.providerMetrics?.retries ?? 0,
          providerLatencyMs: corrected.providerMetrics?.latencyMs ?? 0,
          correctedOutOfRole: corrected.candidates.length - inScope } });
      return {
        phase: "correcting-evidence" as const,
        correctedCandidates,
        searchExcludeDomains: [...new Set([...(state.searchExcludeDomains ?? []),
          ...corrected.candidates.map((candidate) => candidate.domain)])],
        creditsUsed: state.creditsUsed + corrected.creditsUsed,
        modelUsage: [...(state.modelUsage ?? []), ...(corrected.usage ?? [])],
        stageMetrics: [...(state.stageMetrics ?? []), metric],
        warnings: [...state.warnings, ...corrected.warnings],
      };
    })
    .addNode("score_candidates", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "scoring");
      if (!state.playbook) throw new Error("Market Playbook is missing before qualification");
      const inScopeCandidates = state.correctedCandidates.filter((candidate) =>
        candidateMatchesRequestedRole(candidate, state.plan));
      const cached = dependencies.loadAssessmentCache ? await dependencies.loadAssessmentCache({
        userId: state.userId, workspaceId: state.workspaceId, candidates: inScopeCandidates,
        playbook: state.playbook, objective: state.plan.objective,
      }) : new Map<string, LeadCandidateAssessment>();
      const alreadyAssessed = new Map((state.assessments ?? []).map((item) => [item.candidateId, item]));
      const missing = inScopeCandidates.filter((candidate) =>
        !alreadyAssessed.has(candidate.candidateId) && !cached.has(candidate.candidateId));
      const evaluated = missing.length === 0 ? { assessments: [], usage: [] as WorkflowModelUsage[] }
        : dependencies.qualificationAgent.evaluateWithUsage
          ? await dependencies.qualificationAgent.evaluateWithUsage(
            missing, state.playbook, state.plan.countryCode, state.plan.countryName, state.plan.objective)
          : { assessments: await dependencies.qualificationAgent.evaluate(
            missing, state.playbook, state.plan.countryCode, state.plan.countryName, state.plan.objective),
          usage: [] };
      if (dependencies.saveAssessmentCache && evaluated.assessments.length > 0) await dependencies.saveAssessmentCache({
        userId: state.userId, workspaceId: state.workspaceId, runId: state.runId,
        candidates: missing, playbook: state.playbook, objective: state.plan.objective,
        assessments: evaluated.assessments,
      });
      const evaluatedById = new Map(evaluated.assessments.map((assessment) => [assessment.candidateId, assessment]));
      const assessments = inScopeCandidates.flatMap((candidate) => {
        const assessment = alreadyAssessed.get(candidate.candidateId)
          ?? cached.get(candidate.candidateId) ?? evaluatedById.get(candidate.candidateId);
        return assessment ? [assessment] : [];
      });
      const completed = assessments.filter((assessment) => assessment.scoringStatus === "completed").length;
      const acceptedCount = assessments.filter((item) => item.eligible && item.eligibilityStatus === "eligible"
        && item.scoringStatus === "completed").length;
      const finalEligibleAdded = Math.max(0, acceptedCount - (state.acceptedCandidateCount ?? 0));
      const discoveryMetric = [...(state.stageMetrics ?? [])].reverse()
        .find((item) => item.stage === "discover_candidates");
      const metricsAvailable = Boolean(discoveryMetric?.metadata && "completedCalls" in discoveryMetric.metadata);
      const completedFreshCalls = metricsAvailable
        ? Number(discoveryMetric?.metadata.completedFreshCalls ?? 0) : 0;
      const unavailableCalls = metricsAvailable ? Number(discoveryMetric?.metadata.unavailableCalls ?? 0) : 0;
      const consecutiveNoFinalRounds = nextNoFinalRoundCount(state.consecutiveNoFinalRounds ?? 0,
        { finalEligibleAdded, completedFreshCalls });
      const targetDecision = metricsAvailable ? targetCompletionDecision({ acceptedCount,
        targetCount: state.plan.targetCount, completedFreshCalls,
        hadProviderFailureOrCircuit: unavailableCalls > 0,
        consecutiveNoFinalRounds, round: Math.max(0, (state.discoveryRound ?? 1) - 1), maximumRounds: 5 })
        : { complete: true as const, reason: undefined };
      const metric = { ...completedStageMetric({ stage: "score_candidates", startedAt,
        input: inScopeCandidates, output: assessments, inputItems: inScopeCandidates.length,
        outputItems: assessments.length, generatedArtifacts: evaluated.assessments.length,
        validArtifacts: completed, downstreamUsedArtifacts: completed,
        metadata: { cacheHits: cached.size, cacheMisses: missing.length,
          outOfRoleNotScored: state.correctedCandidates.length - inScopeCandidates.length,
          acceptedCount, finalEligibleAdded, consecutiveNoFinalRounds,
          targetShouldContinue: !targetDecision.complete, targetCompletionReason: targetDecision.reason } }),
      status: missing.length === 0 ? "cache-hit" as const : "completed" as const };
      return { phase: "scoring" as const, assessments,
        acceptedCandidateCount: acceptedCount, consecutiveNoFinalRounds,
        targetShouldContinue: !targetDecision.complete, targetCompletionReason: targetDecision.reason,
        modelUsage: [...(state.modelUsage ?? []), ...evaluated.usage], stageMetrics: [...(state.stageMetrics ?? []), metric] };
    })
    .addNode("review_assessment_anomalies", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "reviewing-scores");
      if (!state.playbook) throw new Error("Market Playbook is missing before assessment review");
      const reviewed = await dependencies.assessmentReviewAgent.review(
        state.correctedCandidates, state.assessments, state.playbook, state.plan,
      );
      const reviewUsage: WorkflowModelUsage[] = (reviewed.usage ?? []).map((usage) => ({
        stage: usage.phase === "judge" ? "judge" : "secondary-review",
        requestedModel: usage.model, actualModel: usage.model,
        promptTokens: usage.usage.inputTokens, completionTokens: usage.usage.outputTokens,
        reasoningTokens: usage.usage.reasoningTokens, totalTokens: usage.usage.totalTokens,
        latencyMs: 0, fallbackUsed: false, accountCashCostUsd: usage.usage.accountCashCostUsd,
      }));
      const valid = reviewed.reviews.filter((review) => review.status !== "review-failed").length;
      const metric = completedStageMetric({ stage: "review_assessment_anomalies", startedAt,
        input: state.assessments, output: reviewed.reviews, inputItems: state.assessments.length,
        outputItems: reviewed.reviews.length, generatedArtifacts: reviewed.reviews.filter((review) => review.required).length,
        validArtifacts: valid, downstreamUsedArtifacts: reviewed.reviews.filter((review) => review.required).length });
      return { phase: "reviewing-scores" as const, assessments: reviewed.assessments,
        assessmentReviews: reviewed.reviews, modelUsage: [...(state.modelUsage ?? []), ...reviewUsage],
        stageMetrics: [...(state.stageMetrics ?? []), metric], warnings: [...state.warnings, ...reviewed.warnings] };
    })
    .addNode("assemble_handoff_briefs", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "assembling-handoff");
      if (!state.runId) throw new Error("Run ID is missing before handoff assembly");
      const handoffs = dependencies.handoffAssembler.assemble(
        state.correctedCandidates, state.assessments, state.assessmentReviews, state.runId);
      const metric = completedStageMetric({ stage: "assemble_handoff_briefs", startedAt,
        input: state.assessments, output: handoffs, inputItems: state.assessments.length,
        outputItems: handoffs.length, generatedArtifacts: handoffs.length,
        validArtifacts: handoffs.filter((handoff) => handoff.quality.readyForStrategy).length,
        downstreamUsedArtifacts: handoffs.length });
      return { phase: "assembling-handoff" as const, handoffs,
        stageMetrics: [...(state.stageMetrics ?? []), metric] };
    })
    .addNode("persist_results", async (state) => {
      const startedAt = Date.now();
      await phase(dependencies, state, "persisting");
      if (!state.playbook || !state.runId) throw new Error("Workflow cannot persist without playbook and run ID");
      const metric = completedStageMetric({ stage: "persist_results", startedAt,
        input: state.handoffs, output: { expectedResult: true }, inputItems: state.handoffs.length, outputItems: 1,
        generatedArtifacts: 1, validArtifacts: 1, downstreamUsedArtifacts: 1 });
      const stageMetrics = [...(state.stageMetrics ?? []), metric];
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
        assessmentReviews: state.assessmentReviews,
        handoffs: state.handoffs,
        modelUsage: state.modelUsage ?? [],
        stageMetrics,
        warnings: state.warnings,
      });
      await phase(dependencies, state, "completed");
      return { phase: "completed" as const, result, stageMetrics };
    })
    .addEdge(START, "retrieve_knowledge")
    .addEdge("retrieve_knowledge", "build_playbook")
    .addEdge("build_playbook", "discover_candidates")
    .addEdge("discover_candidates", "collect_evidence")
    .addEdge("collect_evidence", "correct_candidates")
    .addEdge("correct_candidates", "score_candidates")
    .addConditionalEdges("score_candidates", (state) => state.targetShouldContinue
      ? "discover_candidates" : "review_assessment_anomalies", {
      discover_candidates: "discover_candidates",
      review_assessment_anomalies: "review_assessment_anomalies",
    })
    .addEdge("review_assessment_anomalies", "assemble_handoff_briefs")
    .addEdge("assemble_handoff_briefs", "persist_results")
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
    discoveryRound: 0,
    discoveredUniqueCount: 0,
    searchExcludeDomains: [],
    consecutiveNoFinalRounds: 0,
    acceptedCandidateCount: 0,
    targetShouldContinue: false,
    assessmentReviews: [],
    handoffs: [],
    creditsUsed: 0,
    modelUsage: [],
    stageMetrics: [],
    warnings: [],
  };
  const state = await getProductionGraph().invoke(initial, {
    configurable: { thread_id: input.graphThreadId },
    recursionLimit: 50,
  });
  if (!state.result) throw new Error("LangGraph workflow completed without a result");
  return state.result;
}
