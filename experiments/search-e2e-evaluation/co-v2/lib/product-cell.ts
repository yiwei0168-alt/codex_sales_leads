import type { LeadSearchPlan } from "@/lib/assistant/types";
import { planAssistantRequest } from "@/lib/assistant/intent-agent";
import { enforceCorrectedRoleBusinessModel,
  LeadEvidenceCorrectionAgent } from "@/lib/leads/workflow/evidence-correction-agent";
import { collectLeadEvidence } from "@/lib/leads/workflow/discovery";
import { LeadDiscoveryGate } from "@/lib/leads/workflow/discovery-gate";
import { createHybridDiscoverySession, executeHybridDiscovery } from "@/lib/leads/workflow/hybrid-discovery-executor";
import { buildStandardLeadMarketPlaybook } from "@/lib/leads/workflow/playbook";
import { enforceAssessmentEvidenceCaps, LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "@/lib/leads/workflow/rag-context";
import { isCurrentLeadScoringEvidence } from "@/lib/leads/evidence-snapshot";
import { selectPrimaryChannel } from "@/lib/leads/primary-channel";
import { nextNoFinalRoundCount, plannedCandidatePool, targetCompletionDecision,
  type TargetCompletionReason } from "@/lib/leads/workflow/target-completion-policy";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook,
  WorkflowModelUsage } from "@/lib/leads/workflow/types";
import type { EmbeddingCallUsage } from "@/lib/rag/openai-provider";
import { createLeadAiProvider } from "@/providers/resilient-ai";

import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentCostEventInput,
  type ExperimentRateCard, type ExperimentVolume } from "./cost-ledger";
import { EXPERIMENT_CONFIG, intentRolesRecognizeCategory, leadPlanForCell, primaryRoleMatchesCategory,
  type ExperimentCell } from "./experiment";

const rateCard = rateCardJson as ExperimentRateCard;

export interface ProductFinalCandidate {
  rank: number;
  candidateId: string;
  companyName: string;
  domain: string;
  officialWebsiteUrl: string;
  primaryRole: string;
  supportedRoles: string[];
  totalScore: number;
  eligibilityStatus: string;
  eligible: boolean;
  scoringStatus: string;
  evidenceIds: string[];
  evidence: Array<{ id: string; url: string; title: string; excerpt: string; sourceType: string;
    capturedAt: string; contentHash?: string; freshnessStatus?: string; evidenceRunId?: string }>;
  blindAuditEvidence?: Array<{ id: string; url: string; title: string; excerpt: string; sourceType: string;
    capturedAt: string; contentHash?: string; freshnessStatus?: string; evidenceRunId?: string }>;
}

export interface ProductAttributionCandidate {
  candidateId: string;
  discoveryOccurrences?: Array<{ provider: string }>;
}

export interface ProductCellResult {
  schemaVersion: 1;
  runId: string;
  cellId: string;
  arm: "product-e2e";
  startedAt: string;
  completedAt: string;
  wallClockMs: number;
  plan: LeadSearchPlan;
  intent: { plannerModel: string; plannerSource: string; confidence: number; warnings: string[] };
  playbook: LeadMarketPlaybook;
  treatmentModels: {
    discoveryGateRoutine: string;
    roleCorrectionRoutine: string;
    qualificationRoutine: string;
    materialEscalation: string;
  };
  rawDiscoveryCount: number;
  discoveredCandidateCount: number;
  correctedCandidateCount: number;
  completedAssessmentCount: number;
  attributionCandidates?: ProductAttributionCandidate[];
  finalCandidates: ProductFinalCandidate[];
  missingSlots: number;
  completionReason: TargetCompletionReason;
  discoveryRounds: Array<{ round: number; plannedCandidatePool: number; newUniqueCandidates: number;
    lightGateCandidates: number; correctedCandidates: number; inRoleCandidates: number;
    finalEligibleAdded: number; cumulativeFinalEligible: number; stopReason: string }>;
  discoveryCalls: Awaited<ReturnType<typeof executeHybridDiscovery>>["calls"];
  warnings: string[];
  costEvents: ExperimentCostEvent[];
  coldStartAudit: { historicalCandidateReads: 0; historicalEvidenceReads: 0; privateMemoryReads: 0;
    historicalScoreReads: 0; evidenceLibraryWrites: 0; cooperationPathsGenerated: 0 };
  raw: { ragContext: unknown; discovered: unknown; enriched: unknown; corrected: unknown; assessments: unknown };
}

function event(options: Omit<ExperimentCostEventInput, "runId" | "ledger" | "arm">): ExperimentCostEvent {
  return priceCostEvent({ ...options, runId: EXPERIMENT_CONFIG.runId, ledger: "product-e2e-arm",
    arm: "product-e2e" }, rateCard);
}

function volume(inputItems: number, rawOutputItems: number, validOutputItems: number,
  downstreamUsedItems: number, discardedReasonCounts: Record<string, number> = {}): ExperimentVolume {
  return { inputItems, rawOutputItems, validOutputItems, downstreamUsedItems, discardedReasonCounts };
}

export function correctionNeedsIncompleteRecovery(model: string): boolean {
  return model === "deterministic-fallback";
}

export function assessmentNeedsIncompleteRecovery(candidateId: string, scoringStatus: string | undefined,
  recoveredCandidateIds: ReadonlySet<string>): boolean {
  return recoveredCandidateIds.has(candidateId) || scoringStatus !== "completed";
}

export function cachedDomainsForSearchExtension(input: { corrected: Array<{ domain: string }>;
  discoveredRuns: unknown[]; enrichedRuns: unknown[] }): string[] {
  const domains = new Set<string>();
  const addDomain = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim().toLowerCase();
    if (normalized) domains.add(normalized);
  };
  const addCandidates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const candidate of value) {
      if (typeof candidate === "object" && candidate !== null && "domain" in candidate) {
        addDomain((candidate as { domain?: unknown }).domain);
      }
    }
  };
  for (const candidate of input.corrected) addDomain(candidate.domain);
  for (const run of [...input.discoveredRuns, ...input.enrichedRuns]) {
    if (typeof run !== "object" || run === null) continue;
    const record = run as { candidates?: unknown; rejectedCandidates?: unknown };
    addCandidates(record.candidates);
    addCandidates(record.rejectedCandidates);
  }
  return [...domains];
}

export function modelUsageEvents(cell: ExperimentCell, stage: string, usages: WorkflowModelUsage[], stageStartedAt: string,
  stageCompletedAt: string, stageVolume: ExperimentVolume): ExperimentCostEvent[] {
  const groups = new Map<string, WorkflowModelUsage[]>();
  for (const usage of usages) {
    const key = `${usage.providerId ?? "deepseek"}|${usage.requestedModel}|${usage.actualModel}`;
    groups.set(key, [...(groups.get(key) ?? []), usage]);
  }
  return [...groups.entries()].map(([key, items], index) => {
    const [provider, requestedModel, actualModel] = key.split("|");
    const attributedVolume = index === 0 ? {
      ...stageVolume,
      downstreamUsedItems: Math.min(stageVolume.validOutputItems, stageVolume.downstreamUsedItems),
    } : volume(0, 0, 0, 0, { stageVolumeAttributedToPrimaryModelEvent: items.length });
    return event({ eventId: `${cell.cellId}:${stage}:model:${index + 1}`, cellId: cell.cellId, stage,
      provider, requestedModel, actualModel, startedAt: stageStartedAt, completedAt: stageCompletedAt,
      latencyMs: items.reduce((sum, item) => sum + item.latencyMs, 0),
      attempts: items.reduce((sum, item) => sum + (item.attempts ?? 1), 0),
      retries: items.reduce((sum, item) => sum + (item.retries ?? 0), 0),
      fallbackUsed: items.some((item) => item.fallbackUsed), status: "completed",
      usage: { inputTokens: items.reduce((sum, item) => sum + item.promptTokens, 0),
        outputTokens: items.reduce((sum, item) => sum + item.completionTokens, 0),
        reasoningTokens: items.reduce((sum, item) => sum + item.reasoningTokens, 0) }, volume: attributedVolume,
      accountCashCostUsd: items.some((item) => item.accountCashCostUsd !== undefined)
        ? items.reduce((sum, item) => sum + (item.accountCashCostUsd ?? 0), 0) : undefined,
      notes: index === 0 ? ["Aggregate stage output volume is attributed once to the primary model event."]
        : ["Model cost and tokens are retained; aggregate stage output volume is already attributed to model event 1."] });
  });
}

function toFinalCandidate(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  rank: number): ProductFinalCandidate {
  const relied = new Set(assessment.evidenceIds);
  const compactEvidence = (items: typeof candidate.evidence) => items.map((item) => ({ id: item.id,
    url: item.url, title: item.title.slice(0, 300), excerpt: item.excerpt.slice(0, 800),
    sourceType: item.sourceType, capturedAt: item.capturedAt, contentHash: item.contentHash,
    freshnessStatus: item.freshnessStatus, evidenceRunId: item.evidenceRunId }));
  return { rank, candidateId: candidate.candidateId, companyName: candidate.companyName, domain: candidate.domain,
    officialWebsiteUrl: candidate.officialWebsiteUrl, primaryRole: candidate.correction.primaryRole,
    supportedRoles: candidate.correction.resolvedRoles, totalScore: assessment.totalScore,
    eligibilityStatus: assessment.eligibilityStatus, eligible: assessment.eligible,
    scoringStatus: assessment.scoringStatus, evidenceIds: assessment.evidenceIds,
    evidence: compactEvidence(candidate.evidence.filter((item) => relied.has(item.id))),
    blindAuditEvidence: compactEvidence(candidate.evidence.filter((item) =>
      isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))) };
}

export async function runProductCell(cell: ExperimentCell, options: {
  onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
  resumeFrom?: ProductCellResult;
  resumeMode?: "semantic-recovery" | "search-extension" | "incomplete-recovery" | "consistency-recovery";
} = {}): Promise<ProductCellResult> {
  const resumeFrom = options.resumeFrom;
  const resumeMode = options.resumeMode ?? "semantic-recovery";
  const startedAt = resumeFrom?.startedAt ?? new Date().toISOString();
  const wallStarted = Date.now();
  const costEvents: ExperimentCostEvent[] = [...(resumeFrom?.costEvents ?? [])];
  const recordCostEvents = async (events: ExperimentCostEvent[]): Promise<void> => {
    costEvents.push(...events);
    await options.onCostEvents?.(events);
  };
  const warnings: string[] = [...(resumeFrom?.warnings ?? [])];
  const frozenPlan = leadPlanForCell(cell);
  let plan: LeadSearchPlan;
  let ragContext: Awaited<ReturnType<typeof retrieveLeadRagContext>>;
  let playbook: LeadMarketPlaybook;
  let intentSummary: ProductCellResult["intent"];
  if (resumeFrom) {
    plan = resumeFrom.plan;
    ragContext = resumeFrom.raw.ragContext as Awaited<ReturnType<typeof retrieveLeadRagContext>>;
    playbook = resumeFrom.playbook;
    intentSummary = resumeFrom.intent;
    const cacheAt = new Date().toISOString();
    await recordCostEvents([event({ eventId: `${cell.cellId}:resume-cache:${resumeMode}:v2.0.11`, cellId: cell.cellId,
      stage: "within-run-cache-reuse", provider: "local-run-cache", startedAt: cacheAt, completedAt: cacheAt,
      latencyMs: 0, attempts: 0, retries: 0, fallbackUsed: false, status: "completed", usage: {},
      volume: volume(1, 1, 1, 1), notes: [
        "Reused the successful intent, local RAG, playbook, discovery, fresh evidence and supplemental evidence from the interrupted cell.",
        "No historical cross-run candidate, evidence, score or private-memory cache was read.",
      ] })]);
    warnings.push("Same-cell recovery reused version-compatible cached evidence; search and evidence acquisition were not repeated.");
  } else {
    const intentStarted = new Date().toISOString();
    const intent = await planAssistantRequest(frozenPlan.userRequest);
    const intentCompleted = new Date().toISOString();
    for (const [index, call] of (intent.plannerCalls ?? []).entries()) {
      await recordCostEvents([event({ eventId: `${cell.cellId}:intent:${index + 1}`, cellId: cell.cellId, stage: "intent",
        provider: call.providerId ?? "kimi", requestedModel: call.requestedModel, actualModel: call.actualModel,
        startedAt: intentStarted, completedAt: intentCompleted, latencyMs: call.latencyMs,
        attempts: call.attempts, retries: call.retries, fallbackUsed: call.fallbackUsed ?? false,
        status: call.succeeded === false ? "failed" : "completed",
        usage: { inputTokens: call.inputTokens, cachedInputTokens: call.cachedInputTokens,
          outputTokens: call.outputTokens },
        ...(call.usageAvailable === false ? { accountCashCostUsd: EXPERIMENT_CONFIG.cost.unknownUsageCallReserveUsd } : {}),
        volume: volume(1, call.outputTokens > 0 || call.usageAvailable ? 1 : 0, call.succeeded === false ? 0 : 1,
          call.succeeded === false ? 0 : 1, call.succeeded === false ? { providerFailure: 1 } : {}),
        notes: [...(call.failureReason ? [call.failureReason] : []),
          ...(call.usageAvailable === false ? ["Provider usage unavailable; conservative reserve applied."] : [])] })]);
    }
    if (intent.plannerSource === "deterministic-fallback" || !intent.leadPlan) {
      throw new Error(`${cell.cellId} Kimi intent step did not return a usable model-generated lead plan: ${intent.warnings.join(" | ")}`);
    }
    if (intent.leadPlan.countryCode !== frozenPlan.countryCode
      || intent.leadPlan.targetCount !== EXPERIMENT_CONFIG.sample.slotsPerArmPerCell
      || intent.leadPlan.objective !== frozenPlan.objective
      || !intentRolesRecognizeCategory(intent.leadPlan.roles, frozenPlan.roles)) {
      warnings.push(`${cell.cellId} Kimi intent plan diverged from the user-confirmed frozen task; execution retained the confirmed constraints: ${JSON.stringify({
        expected: { countryCode: frozenPlan.countryCode, targetCount: frozenPlan.targetCount,
          objective: frozenPlan.objective, roles: frozenPlan.roles },
        actual: { countryCode: intent.leadPlan.countryCode, targetCount: intent.leadPlan.targetCount,
          objective: intent.leadPlan.objective, roles: intent.leadPlan.roles },
      })}`);
    }
    warnings.push(...intent.warnings);
    plan = { ...frozenPlan, coverageMode: intent.leadPlan.coverageMode ?? "auto", verifiedOnly: false };
    intentSummary = { plannerModel: intent.plannerModel, plannerSource: intent.plannerSource,
      confidence: intent.confidence, warnings: intent.warnings };

    const userId = process.env.SEARCH_E2E_USER_ID?.trim();
    if (!userId) throw new Error("SEARCH_E2E_USER_ID is required for frozen local-database RAG");
    const embeddingUsage: EmbeddingCallUsage[] = [];
    const ragStarted = new Date().toISOString();
    ragContext = await retrieveLeadRagContext(userId, plan, { onEmbeddingUsage: (usage) => {
      embeddingUsage.push(...usage);
    } });
    const ragCompleted = new Date().toISOString();
    const collections = new Set(ragContext.map((item) => item.collection));
    if (!["product", "company", "industry"].every((collection) => collections.has(collection as never))
      || !ragContext.some((item) => item.collection === "product" && item.corroborated
        && item.retrievalSignals.includes("structured"))) {
      throw new Error(`${cell.cellId} frozen RAG quality gate failed`);
    }
    for (const [index, usage] of embeddingUsage.entries()) {
      await recordCostEvents([event({ eventId: `${cell.cellId}:rag-embedding:${index + 1}`, cellId: cell.cellId,
        stage: "rag-retrieval", provider: "alibaba-model-studio", requestedModel: "text-embedding-v4",
        actualModel: usage.model, startedAt: ragStarted, completedAt: ragCompleted, latencyMs: usage.latencyMs,
        attempts: 1, retries: 0, fallbackUsed: false, status: "completed",
        usage: { inputTokens: usage.inputTokens, outputTokens: 0 },
        volume: volume(usage.inputItems, usage.inputItems, usage.inputItems, usage.inputItems) })]);
    }

    const playbookStarted = new Date().toISOString();
    playbook = buildStandardLeadMarketPlaybook(plan, ragContext);
    const playbookCompleted = new Date().toISOString();
    await recordCostEvents([event({ eventId: `${cell.cellId}:playbook`, cellId: cell.cellId, stage: "playbook",
      provider: "deterministic-template", startedAt: playbookStarted, completedAt: playbookCompleted,
      latencyMs: Math.max(0, Date.parse(playbookCompleted) - Date.parse(playbookStarted)), attempts: 0, retries: 0,
      fallbackUsed: false, status: "completed", usage: {}, volume: volume(ragContext.length, 1, 1, 1) })]);
  }

  const discoverySession = createHybridDiscoverySession();
  const treatmentModels = EXPERIMENT_CONFIG.arms["product-e2e"].models;
  const leadAiProvider = createLeadAiProvider();
  const discoveryGate = new LeadDiscoveryGate(leadAiProvider, fetch,
    { model: treatmentModels.discoveryGateRoutine });
  const correctionAgent = new LeadEvidenceCorrectionAgent(leadAiProvider, undefined, {
    allowReusableCorrections: false, persistCorrections: false,
    concurrency: 2,
    routineModel: treatmentModels.roleCorrectionRoutine,
    escalationModel: treatmentModels.materialEscalation,
  });
  const qualificationAgent = new LeadQualificationAgent(leadAiProvider, { includeCooperationPaths: false, concurrency: 2,
    batchSize: 1,
    routineModel: treatmentModels.qualificationRoutine,
    escalationModel: treatmentModels.materialEscalation });
  const discoveryRounds: ProductCellResult["discoveryRounds"] = [...(resumeFrom?.discoveryRounds ?? [])];
  const discoveredRuns: unknown[] = [...((resumeFrom?.raw.discovered as unknown[] | undefined) ?? [])];
  const enrichedRuns: unknown[] = [...((resumeFrom?.raw.enriched as unknown[] | undefined) ?? [])];
  const priorCorrected = ((resumeFrom?.raw.corrected as CorrectedLeadWorkflowCandidate[] | undefined) ?? []);
  const priorAssessments = ((resumeFrom?.raw.assessments as LeadCandidateAssessment[] | undefined) ?? []);
  const correctedByDomain = new Map<string, CorrectedLeadWorkflowCandidate>(
    priorCorrected.map((candidate) => [candidate.domain, candidate]),
  );
  const assessmentsByCandidate = new Map<string, LeadCandidateAssessment>(
    priorAssessments.map((assessment) => [assessment.candidateId, assessment]),
  );
  const selectedPairs: Array<{ candidate: CorrectedLeadWorkflowCandidate; assessment: LeadCandidateAssessment }> = [];
  const selectedDomains = new Set<string>();
  const allDiscoveryCalls: Awaited<ReturnType<typeof executeHybridDiscovery>>["calls"] = [
    ...(resumeFrom?.discoveryCalls ?? []),
  ];
  let totalUnique = resumeFrom?.discoveredCandidateCount ?? 0;
  let consecutiveNoFinalRounds = 0;
  let completionReason: ProductCellResult["completionReason"] = "maximum-rounds";
  const startingRound = resumeFrom?.discoveryRounds.length ?? 0;
  const maximumRounds = resumeFrom && resumeMode === "search-extension" ? startingRound + 5
    : plan.targetCount >= 50 ? 10 : 5;
  const cachedResumeDomains = cachedDomainsForSearchExtension({ corrected: priorCorrected,
    discoveredRuns, enrichedRuns });

  if (resumeFrom && resumeMode === "consistency-recovery") {
    let roleChanges = 0;
    for (const candidate of priorCorrected) {
      const normalized = enforceCorrectedRoleBusinessModel(candidate);
      if (normalized !== candidate) roleChanges += 1;
      correctedByDomain.set(normalized.domain, normalized);
    }
    const candidateById = new Map([...correctedByDomain.values()].map((candidate) =>
      [candidate.candidateId, candidate]));
    let scoreChanges = 0;
    for (const assessment of priorAssessments) {
      const candidate = candidateById.get(assessment.candidateId);
      const normalized = candidate ? enforceAssessmentEvidenceCaps(candidate, assessment) : assessment;
      if (normalized !== assessment) scoreChanges += 1;
      assessmentsByCandidate.set(normalized.candidateId, normalized);
    }
    for (const candidate of [...correctedByDomain.values()]) {
      if (!primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)) continue;
      const assessment = assessmentsByCandidate.get(candidate.candidateId);
      if (!assessment || assessment.scoringStatus !== "completed" || !assessment.eligible
        || assessment.eligibilityStatus !== "eligible"
        || Object.values(assessment.gates).some((state) => state === "not-supported")) continue;
      selectedPairs.push({ candidate, assessment });
      selectedDomains.add(candidate.domain);
    }
    const repairAt = new Date().toISOString();
    await recordCostEvents([event({ eventId: `${cell.cellId}:deterministic-consistency-recovery:v2.0.11`,
      cellId: cell.cellId, stage: "deterministic-consistency-recovery", provider: "deterministic",
      startedAt: repairAt, completedAt: repairAt, latencyMs: 0, attempts: 0, retries: 0,
      fallbackUsed: false, status: "completed", usage: {},
      volume: volume(priorCorrected.length + priorAssessments.length,
        priorCorrected.length + priorAssessments.length, priorCorrected.length + priorAssessments.length,
        selectedPairs.length, { marketplaceRoleRemoved: roleChanges, evidenceScoreCapApplied: scoreChanges }),
      notes: ["Reused all acquisition and model semantic output; applied only deterministic role-business-model and evidence-cap consistency rules."] })]);
    completionReason = selectedPairs.length >= plan.targetCount ? "target-met" : resumeFrom.completionReason;
    warnings.push(`Consistency recovery removed Retail/E-tail roles from ${roleChanges} explicit third-party marketplace candidate(s), evidence-capped ${scoreChanges} assessment(s), and retained ${selectedPairs.length} eligible candidates without a model, search or evidence call.`);
  }

  if (resumeFrom && priorCorrected.length > 0 && resumeMode === "incomplete-recovery") {
    for (const candidate of priorCorrected) discoverySession.excludedDomains.add(candidate.domain);
    const incompleteCorrections = priorCorrected.filter((candidate) =>
      correctionNeedsIncompleteRecovery(candidate.correction.model));
    const noAcquisitionSearch = { search: async (input: { query: string }) => ({
      query: input.query, results: [], creditsUsed: 0, attempts: 0, retries: 0, latencyMs: 0,
    }) };
    const recoveryAgent = new LeadEvidenceCorrectionAgent(leadAiProvider, noAcquisitionSearch, {
      allowReusableCorrections: false, persistCorrections: false, batchSize: 1, concurrency: 2,
      routineModel: treatmentModels.roleCorrectionRoutine,
      escalationModel: treatmentModels.materialEscalation,
    });
    const correctionStarted = new Date().toISOString();
    const recovered = incompleteCorrections.length > 0
      ? await recoveryAgent.correct(incompleteCorrections, plan)
      : { candidates: [] as CorrectedLeadWorkflowCandidate[], usage: [] as WorkflowModelUsage[], warnings: [] as string[] };
    const correctionCompleted = new Date().toISOString();
    for (const candidate of recovered.candidates) correctedByDomain.set(candidate.domain, candidate);
    const recoveredIds = new Set(recovered.candidates.map((candidate) => candidate.candidateId));
    const allInRoleCandidates = [...correctedByDomain.values()].filter((candidate) =>
      primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId));
    const correctionStageVolume = volume(incompleteCorrections.length, recovered.candidates.length,
      recovered.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length,
      recovered.candidates.filter((candidate) =>
        primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)).length,
      { unresolvedAfterRecovery: recovered.candidates.filter((candidate) =>
        candidate.correction.model === "deterministic-fallback").length });
    const correctionEvents = modelUsageEvents(cell, "evidence-correction-incomplete-recovery",
      recovered.usage ?? [], correctionStarted, correctionCompleted, correctionStageVolume);
    await recordCostEvents(correctionEvents.length > 0 ? correctionEvents : [event({
      eventId: `${cell.cellId}:evidence-correction-incomplete-recovery:no-valid-model-output`, cellId: cell.cellId,
      stage: "evidence-correction-incomplete-recovery", provider: "resilient-ai",
      requestedModel: treatmentModels.roleCorrectionRoutine, startedAt: correctionStarted,
      completedAt: correctionCompleted, latencyMs: Math.max(0,
        Date.parse(correctionCompleted) - Date.parse(correctionStarted)), attempts: 0, retries: 0,
      fallbackUsed: true, status: "failed", usage: {}, volume: correctionStageVolume,
      notes: ["No model-valid correction usage was returned; acquisition remained closed."] })]);
    warnings.push(...recovered.warnings);

    const scoringInputs = allInRoleCandidates.filter((candidate) => assessmentNeedsIncompleteRecovery(
      candidate.candidateId, assessmentsByCandidate.get(candidate.candidateId)?.scoringStatus, recoveredIds));
    const scoringStarted = new Date().toISOString();
    const scored = scoringInputs.length > 0
      ? await qualificationAgent.evaluateWithUsage(scoringInputs, playbook,
        plan.countryCode, plan.countryName, plan.objective)
      : { assessments: [] as LeadCandidateAssessment[], usage: [] as WorkflowModelUsage[] };
    const scoringCompleted = new Date().toISOString();
    scored.assessments.forEach((assessment) => assessmentsByCandidate.set(assessment.candidateId, assessment));
    const scoringStageVolume = volume(scoringInputs.length, scored.assessments.length,
      scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
      scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
      { retryRequired: scored.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length });
    const scoringEvents = modelUsageEvents(cell, "qualification-score-only-incomplete-recovery", scored.usage,
      scoringStarted, scoringCompleted, scoringStageVolume);
    if (scoringInputs.length > 0) await recordCostEvents(scoringEvents.length > 0 ? scoringEvents : [event({
      eventId: `${cell.cellId}:qualification-score-only-incomplete-recovery:no-valid-model-output`, cellId: cell.cellId,
      stage: "qualification-score-only-incomplete-recovery", provider: "resilient-ai",
      requestedModel: treatmentModels.qualificationRoutine, startedAt: scoringStarted,
      completedAt: scoringCompleted, latencyMs: Math.max(0, Date.parse(scoringCompleted) - Date.parse(scoringStarted)),
      attempts: 0, retries: 0, fallbackUsed: true, status: "failed", usage: {}, volume: scoringStageVolume,
      notes: ["No model-valid score usage was returned; acquisition remained closed."] })]);

    for (const candidate of [...correctedByDomain.values()]) {
      if (!primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)) continue;
      const assessment = assessmentsByCandidate.get(candidate.candidateId);
      if (!assessment || assessment.scoringStatus !== "completed" || !assessment.eligible
        || assessment.eligibilityStatus !== "eligible"
        || Object.values(assessment.gates).some((state) => state === "not-supported")) continue;
      selectedPairs.push({ candidate, assessment });
      selectedDomains.add(candidate.domain);
    }
    completionReason = selectedPairs.length >= plan.targetCount ? "target-met" : resumeFrom.completionReason;
    warnings.push(`Incomplete recovery retried ${incompleteCorrections.length} deterministic corrections and ${scoringInputs.length} missing, retry-required or materially affected assessments; it retained ${selectedPairs.length} eligible candidates with zero search or evidence-acquisition calls.`);
  }

  if (resumeFrom && priorCorrected.length > 0 && resumeMode === "semantic-recovery") {
    for (const candidate of priorCorrected) discoverySession.excludedDomains.add(candidate.domain);
    const noAcquisitionSearch = { search: async (input: { query: string }) => ({
      query: input.query,
      results: [],
      creditsUsed: 0,
      attempts: 0,
      retries: 0,
      latencyMs: 0,
    }) };
    const recoveryAgent = new LeadEvidenceCorrectionAgent(leadAiProvider, noAcquisitionSearch, {
      allowReusableCorrections: false,
      persistCorrections: false,
      batchSize: 1,
      concurrency: 2,
      routineModel: treatmentModels.roleCorrectionRoutine,
      escalationModel: treatmentModels.materialEscalation,
    });
    const correctionStarted = new Date().toISOString();
    const recovered = await recoveryAgent.correct(priorCorrected, plan);
    const correctionCompleted = new Date().toISOString();
    for (const candidate of recovered.candidates) correctedByDomain.set(candidate.domain, candidate);
    const inRoleCandidates = recovered.candidates.filter((candidate) =>
      primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId));
    await recordCostEvents(modelUsageEvents(cell, "evidence-correction-cache-recovery",
      recovered.usage ?? [], correctionStarted, correctionCompleted,
      volume(priorCorrected.length, recovered.candidates.length,
        recovered.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length,
        inRoleCandidates.length, { correctedToAnotherRole: recovered.candidates.length - inRoleCandidates.length })));
    warnings.push(...recovered.warnings);

    const scoringStarted = new Date().toISOString();
    const scored = inRoleCandidates.length > 0
      ? await qualificationAgent.evaluateWithUsage(inRoleCandidates, playbook,
        plan.countryCode, plan.countryName, plan.objective)
      : { assessments: [] as LeadCandidateAssessment[], usage: [] as WorkflowModelUsage[] };
    const scoringCompleted = new Date().toISOString();
    scored.assessments.forEach((assessment) => assessmentsByCandidate.set(assessment.candidateId, assessment));
    await recordCostEvents(modelUsageEvents(cell, "qualification-score-only-cache-recovery", scored.usage,
      scoringStarted, scoringCompleted, volume(inRoleCandidates.length, scored.assessments.length,
        scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        { retryRequired: scored.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length })));
    const assessmentById = new Map(scored.assessments.map((assessment) => [assessment.candidateId, assessment]));
    for (const candidate of inRoleCandidates) {
      const assessment = assessmentById.get(candidate.candidateId);
      if (!assessment || assessment.scoringStatus !== "completed" || !assessment.eligible
        || assessment.eligibilityStatus !== "eligible"
        || Object.values(assessment.gates).some((state) => state === "not-supported")) continue;
      selectedPairs.push({ candidate, assessment });
      selectedDomains.add(candidate.domain);
    }
    warnings.push(`Cache recovery reclassified ${recovered.candidates.length} candidates, found ${inRoleCandidates.length} in-role and retained ${selectedPairs.length} eligible without another search or Tavily call.`);
  }

  if (resumeFrom && resumeMode === "search-extension") {
    for (const domain of cachedResumeDomains) discoverySession.excludedDomains.add(domain);
    const normalizedPrior = priorCorrected.map((candidate) => {
      const primary = selectPrimaryChannel({ roles: candidate.correction.resolvedRoles,
        agentPrimaryRole: candidate.correction.primaryRole });
      const normalized = primary.primaryRole === candidate.correction.primaryRole ? candidate : {
        ...candidate,
        correction: { ...candidate.correction, primaryRole: primary.primaryRole,
          primaryFamily: primary.primaryFamily, primaryChannelReason: primary.reason,
          warnings: [...candidate.correction.warnings,
            "Stored same-family Hybrid primary role was normalized without new evidence acquisition."] },
      };
      correctedByDomain.set(normalized.domain, normalized);
      return normalized;
    });
    const retryAssessments = normalizedPrior.filter((candidate) =>
      primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)
      && assessmentsByCandidate.get(candidate.candidateId)?.scoringStatus !== "completed");
    const scoringStarted = new Date().toISOString();
    const retried = retryAssessments.length > 0
      ? await qualificationAgent.evaluateWithUsage(retryAssessments, playbook,
        plan.countryCode, plan.countryName, plan.objective)
      : { assessments: [] as LeadCandidateAssessment[], usage: [] as WorkflowModelUsage[] };
    const scoringCompleted = new Date().toISOString();
    retried.assessments.forEach((assessment) => assessmentsByCandidate.set(assessment.candidateId, assessment));
    await recordCostEvents(modelUsageEvents(cell, "qualification-score-only-role-normalization", retried.usage,
      scoringStarted, scoringCompleted, volume(retryAssessments.length, retried.assessments.length,
        retried.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        retried.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        { retryRequired: retried.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length })));
    for (const candidate of normalizedPrior) {
      if (selectedDomains.has(candidate.domain)
        || !primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)) continue;
      const assessment = assessmentsByCandidate.get(candidate.candidateId);
      if (!assessment || assessment.scoringStatus !== "completed" || !assessment.eligible
        || assessment.eligibilityStatus !== "eligible"
        || Object.values(assessment.gates).some((state) => state === "not-supported")) continue;
      selectedPairs.push({ candidate, assessment });
      selectedDomains.add(candidate.domain);
    }
    warnings.push(`Search extension normalized ${normalizedPrior.filter((candidate) => candidate.correction.warnings.includes("Stored same-family Hybrid primary role was normalized without new evidence acquisition.")).length} same-family Hybrid roles, retried ${retryAssessments.length} cached assessments, retained ${selectedPairs.length} prior eligible candidates and excluded ${cachedResumeDomains.length} cached discovery/correction domains from reacquisition.`);
  }

  for (let round = startingRound; (!resumeFrom || resumeMode === "search-extension") && round < maximumRounds
    && selectedPairs.length < plan.targetCount; round += 1) {
    const plannedPool = plannedCandidatePool({ targetCount: plan.targetCount,
      acceptedCount: selectedPairs.length, discoveredUniqueCount: totalUnique, round });
    const roundPlan = { ...plan, coverageMode: round > 0 && plan.coverageMode === "auto" ? "mixed" as const
      : plan.coverageMode };
    const discoveryStarted = new Date().toISOString();
    const discovered = await executeHybridDiscovery(`${EXPERIMENT_CONFIG.runId}-${cell.cellId}-product-r${round + 1}`,
      roundPlan, playbook, { queryRound: round, targetPoolOverride: plannedPool,
        session: discoverySession, gate: discoveryGate });
    const discoveryCompleted = new Date().toISOString();
    discoveredRuns.push(discovered);
    allDiscoveryCalls.push(...discovered.calls);
    const roundUnique = discovered.calls.reduce((sum, call) => sum + call.newUniqueCompanies, 0);
    totalUnique += roundUnique;
    for (const [index, call] of discovered.calls.entries()) {
      const model = call.route.provider === "gemini-full" || call.route.provider === "gemini-product"
        ? process.env.GEMINI_DISCOVERY_MODEL?.trim() || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash"
        : undefined;
      await recordCostEvents([event({ eventId: `${cell.cellId}:discovery:r${round + 1}:${index + 1}`,
        cellId: cell.cellId, stage: "hybrid-discovery", provider: call.route.provider,
        requestedModel: model, actualModel: model, startedAt: discoveryStarted, completedAt: discoveryCompleted,
        latencyMs: call.latencyMs, attempts: call.requestCount, retries: call.retryCount,
        fallbackUsed: call.fallbackUsed, status: call.status,
        usage: { inputTokens: call.inputTokens, outputTokens: call.outputTokens,
          searchRequests: call.requestCount, groundingQueries: call.groundingQueries,
          searchResults: call.rawResults, extractedPages: call.route.provider === "exa" ? call.rawResults : 0,
          paidSearchCredits: call.paidSearchCredits },
        volume: volume(1, call.rawResults, call.normalizedCompanies, call.newUniqueCompanies,
          { ...call.discardedReasonCounts, duplicate: call.existingCompanyHits }),
        notes: [`queryRound=${round + 1}`, `cacheStatus=${call.cacheStatus}`,
          ...(call.failureClass ? [`failureClass=${call.failureClass}`, `circuitScope=${call.circuitScope}`] : [])] })]);
    }
    await recordCostEvents(modelUsageEvents(cell, `discovery-gate-r${round + 1}`, discovered.modelUsage,
      discoveryStarted, discoveryCompleted, volume(roundUnique,
        discovered.candidates.length + discovered.rejectedCandidates.length, discovered.candidates.length,
        discovered.candidates.length, { rejected: discovered.rejectedCandidates.length })));
    warnings.push(...discovered.warnings);

    const evidenceStarted = new Date().toISOString();
    const enriched = await collectLeadEvidence(discovered.candidates, roundPlan, { allowReusableEvidence: false,
      persistEvidence: false, concurrency: 12, maximumAttempts: 3 });
    const evidenceCompleted = new Date().toISOString();
    enrichedRuns.push(enriched);
    const evidenceCount = enriched.candidates.reduce((sum, candidate) => sum
      + candidate.evidence.filter((item) => item.sourceType !== "discovery").length, 0);
    await recordCostEvents([event({ eventId: `${cell.cellId}:fresh-evidence:r${round + 1}`,
      cellId: cell.cellId, stage: "fresh-evidence", provider: "tavily", startedAt: evidenceStarted,
      completedAt: evidenceCompleted, latencyMs: enriched.providerMetrics?.latencyMs
        ?? Date.parse(evidenceCompleted) - Date.parse(evidenceStarted),
      attempts: enriched.providerMetrics?.attempts ?? 0, retries: enriched.providerMetrics?.retries ?? 0,
      fallbackUsed: false, status: "completed", usage: { paidSearchCredits: enriched.creditsUsed },
      volume: volume(discovered.candidates.length, evidenceCount, evidenceCount, evidenceCount,
        { noFreshEvidence: enriched.candidates.filter((candidate) =>
          !candidate.evidence.some((item) => item.sourceType !== "discovery")).length }),
      notes: ["historical evidence reads disabled", "evidence-library writes disabled",
        "current-run evidence and missing-evidence records reused downstream"] })]);
    warnings.push(...enriched.warnings);

    const correctionStarted = new Date().toISOString();
    const corrected = await correctionAgent.correct(enriched.candidates, roundPlan);
    const correctionCompleted = new Date().toISOString();
    for (const candidate of corrected.candidates) {
      if (!correctedByDomain.has(candidate.domain)) correctedByDomain.set(candidate.domain, candidate);
      discoverySession.excludedDomains.add(candidate.domain);
    }
    const inRoleCandidates = corrected.candidates.filter((candidate) =>
      primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId));
    if (corrected.creditsUsed > 0 || corrected.providerMetrics.attempts > 0) {
      await recordCostEvents([event({ eventId: `${cell.cellId}:correction-evidence:r${round + 1}`,
        cellId: cell.cellId, stage: "evidence-correction-search", provider: "tavily",
        startedAt: correctionStarted, completedAt: correctionCompleted,
        latencyMs: corrected.providerMetrics.latencyMs, attempts: corrected.providerMetrics.attempts,
        retries: corrected.providerMetrics.retries, fallbackUsed: false, status: "completed",
        usage: { paidSearchCredits: corrected.creditsUsed },
        volume: volume(enriched.candidates.length, corrected.candidates.length, corrected.candidates.length,
          inRoleCandidates.length, { correctedToAnotherRole: corrected.candidates.length - inRoleCandidates.length }),
        notes: ["Only missing evidence identified by the first evidence packet may trigger supplementation."] })]);
    }
    await recordCostEvents(modelUsageEvents(cell, `evidence-correction-r${round + 1}`,
      corrected.usage ?? [], correctionStarted, correctionCompleted,
      volume(enriched.candidates.length, corrected.candidates.length,
        corrected.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length,
        inRoleCandidates.length, { correctedToAnotherRole: corrected.candidates.length - inRoleCandidates.length })));
    warnings.push(...corrected.warnings);

    const scoringStarted = new Date().toISOString();
    const scored = inRoleCandidates.length > 0
      ? await qualificationAgent.evaluateWithUsage(inRoleCandidates, playbook,
        plan.countryCode, plan.countryName, plan.objective)
      : { assessments: [] as LeadCandidateAssessment[], usage: [] as WorkflowModelUsage[] };
    const scoringCompleted = new Date().toISOString();
    scored.assessments.forEach((assessment) => assessmentsByCandidate.set(assessment.candidateId, assessment));
    await recordCostEvents(modelUsageEvents(cell, `qualification-score-only-r${round + 1}`, scored.usage,
      scoringStarted, scoringCompleted, volume(inRoleCandidates.length, scored.assessments.length,
        scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
        { retryRequired: scored.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length })));

    const assessmentById = new Map(scored.assessments.map((assessment) => [assessment.candidateId, assessment]));
    let finalEligibleAdded = 0;
    for (const candidate of inRoleCandidates) {
      if (selectedPairs.length >= plan.targetCount || selectedDomains.has(candidate.domain)) continue;
      const assessment = assessmentById.get(candidate.candidateId);
      if (!assessment || assessment.scoringStatus !== "completed" || !assessment.eligible
        || assessment.eligibilityStatus !== "eligible"
        || Object.values(assessment.gates).some((state) => state === "not-supported")) continue;
      selectedPairs.push({ candidate, assessment });
      selectedDomains.add(candidate.domain);
      finalEligibleAdded += 1;
    }
    const completedFreshCalls = discovered.calls.filter((call) => call.status === "completed"
      && call.cacheStatus === "miss").length;
    const hadModelFailure = discovered.warnings.some((warning) => warning.includes("Discovery gate batch held"))
      || corrected.candidates.some((candidate) => candidate.correction.model === "deterministic-fallback")
      || scored.assessments.some((assessment) => assessment.scoringStatus !== "completed");
    const hadProviderFailureOrCircuit = hadModelFailure || discovered.calls.some((call) => call.status === "failed"
      || call.discardedReasonCounts["circuit-open"] === 1);
    consecutiveNoFinalRounds = nextNoFinalRoundCount(consecutiveNoFinalRounds,
      { finalEligibleAdded, completedFreshCalls, hadProviderFailureOrCircuit });
    discoveryRounds.push({ round: round + 1, plannedCandidatePool: plannedPool, newUniqueCandidates: roundUnique,
      lightGateCandidates: discovered.candidates.length, correctedCandidates: corrected.candidates.length,
      inRoleCandidates: inRoleCandidates.length, finalEligibleAdded,
      cumulativeFinalEligible: selectedPairs.length, stopReason: discovered.stopReason });
    const completion = targetCompletionDecision({ acceptedCount: selectedPairs.length,
      targetCount: plan.targetCount, completedFreshCalls,
      hadProviderFailureOrCircuit,
      consecutiveNoFinalRounds, round, maximumRounds });
    if (completion.complete) {
      completionReason = completion.reason!;
      break;
    }
  }

  const finalPairs = [...selectedPairs].sort((a, b) => b.assessment.totalScore - a.assessment.totalScore
    || a.candidate.companyName.localeCompare(b.candidate.companyName));
  const finalCandidates = finalPairs.map(({ candidate, assessment }, index) =>
    toFinalCandidate(candidate, assessment, index + 1));
  const rankingStarted = new Date().toISOString();
  const rankingAt = new Date().toISOString();
  await recordCostEvents([event({ eventId: resumeFrom ? `${cell.cellId}:ranking:${resumeMode}:v2.0.11` : `${cell.cellId}:ranking`, cellId: cell.cellId,
    stage: "role-filter-ranking", provider: "deterministic", startedAt: rankingStarted,
    completedAt: rankingAt, latencyMs: Math.max(0, Date.parse(rankingAt) - Date.parse(rankingStarted)),
    attempts: 0, retries: 0, fallbackUsed: false, status: "completed", usage: {},
    volume: volume(assessmentsByCandidate.size, assessmentsByCandidate.size, selectedPairs.length,
      finalCandidates.length, { wrongPrimaryRoleOrGate: correctedByDomain.size - selectedPairs.length }) })]);

  if (costEvents.some((item) => item.budgetCostUsd === null)) {
    throw new Error(`${cell.cellId} contains unpriced product cost events: ${costEvents.filter((item) => item.budgetCostUsd === null).map((item) => item.eventId).join(", ")}`);
  }
  return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, cellId: cell.cellId, arm: "product-e2e",
    startedAt, completedAt: new Date().toISOString(), wallClockMs: (resumeFrom?.wallClockMs ?? 0) + Date.now() - wallStarted, plan,
    intent: intentSummary, playbook, treatmentModels,
    rawDiscoveryCount: allDiscoveryCalls.reduce((sum, call) => sum + call.rawResults, 0),
    discoveredCandidateCount: totalUnique, correctedCandidateCount: correctedByDomain.size,
    completedAssessmentCount: [...assessmentsByCandidate.values()]
      .filter((assessment) => assessment.scoringStatus === "completed").length,
    attributionCandidates: [...correctedByDomain.values()].map((candidate) => ({ candidateId: candidate.candidateId,
      discoveryOccurrences: candidate.discoveryOccurrences?.map((occurrence) => ({ provider: occurrence.provider })) })),
    finalCandidates, missingSlots: Math.max(0, plan.targetCount - finalCandidates.length), completionReason,
    discoveryRounds, discoveryCalls: allDiscoveryCalls,
    warnings, costEvents, coldStartAudit: { historicalCandidateReads: 0, historicalEvidenceReads: 0,
      privateMemoryReads: 0, historicalScoreReads: 0, evidenceLibraryWrites: 0, cooperationPathsGenerated: 0 },
    raw: { ragContext, discovered: discoveredRuns, enriched: enrichedRuns,
      corrected: [...correctedByDomain.values()], assessments: [...assessmentsByCandidate.values()] } };
}
