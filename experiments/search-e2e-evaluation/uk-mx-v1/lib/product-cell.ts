import type { LeadSearchPlan } from "@/lib/assistant/types";
import { planAssistantRequest } from "@/lib/assistant/intent-agent";
import { LeadEvidenceCorrectionAgent } from "@/lib/leads/workflow/evidence-correction-agent";
import { collectLeadEvidence } from "@/lib/leads/workflow/discovery";
import { executeHybridDiscovery } from "@/lib/leads/workflow/hybrid-discovery-executor";
import { buildStandardLeadMarketPlaybook } from "@/lib/leads/workflow/playbook";
import { LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "@/lib/leads/workflow/rag-context";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment, LeadMarketPlaybook,
  WorkflowModelUsage } from "@/lib/leads/workflow/types";
import type { EmbeddingCallUsage } from "@/lib/rag/openai-provider";

import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentCostEventInput,
  type ExperimentRateCard, type ExperimentVolume } from "./cost-ledger";
import { EXPERIMENT_CONFIG, intentRolesStayWithinCategory, leadPlanForCell, primaryRoleMatchesCategory,
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
  rawDiscoveryCount: number;
  discoveredCandidateCount: number;
  correctedCandidateCount: number;
  completedAssessmentCount: number;
  finalCandidates: ProductFinalCandidate[];
  missingSlots: number;
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

function modelUsageEvents(cell: ExperimentCell, stage: string, usages: WorkflowModelUsage[], stageStartedAt: string,
  stageCompletedAt: string, stageVolume: ExperimentVolume): ExperimentCostEvent[] {
  const groups = new Map<string, WorkflowModelUsage[]>();
  for (const usage of usages) {
    const key = `${usage.providerId ?? "deepseek"}|${usage.requestedModel}|${usage.actualModel}`;
    groups.set(key, [...(groups.get(key) ?? []), usage]);
  }
  return [...groups.entries()].map(([key, items], index) => {
    const [provider, requestedModel, actualModel] = key.split("|");
    return event({ eventId: `${cell.cellId}:${stage}:model:${index + 1}`, cellId: cell.cellId, stage,
      provider, requestedModel, actualModel, startedAt: stageStartedAt, completedAt: stageCompletedAt,
      latencyMs: items.reduce((sum, item) => sum + item.latencyMs, 0),
      attempts: items.reduce((sum, item) => sum + (item.attempts ?? 1), 0),
      retries: items.reduce((sum, item) => sum + (item.retries ?? 0), 0),
      fallbackUsed: items.some((item) => item.fallbackUsed), status: "completed",
      usage: { inputTokens: items.reduce((sum, item) => sum + item.promptTokens, 0),
        outputTokens: items.reduce((sum, item) => sum + item.completionTokens, 0),
        reasoningTokens: items.reduce((sum, item) => sum + item.reasoningTokens, 0) }, volume: stageVolume });
  });
}

function toFinalCandidate(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  rank: number): ProductFinalCandidate {
  const relied = new Set(assessment.evidenceIds);
  return { rank, candidateId: candidate.candidateId, companyName: candidate.companyName, domain: candidate.domain,
    officialWebsiteUrl: candidate.officialWebsiteUrl, primaryRole: candidate.correction.primaryRole,
    supportedRoles: candidate.correction.resolvedRoles, totalScore: assessment.totalScore,
    eligibilityStatus: assessment.eligibilityStatus, eligible: assessment.eligible,
    scoringStatus: assessment.scoringStatus, evidenceIds: assessment.evidenceIds,
    evidence: candidate.evidence.filter((item) => relied.has(item.id)).map((item) => ({ id: item.id,
      url: item.url, title: item.title.slice(0, 300), excerpt: item.excerpt.slice(0, 800),
      sourceType: item.sourceType, capturedAt: item.capturedAt, contentHash: item.contentHash,
      freshnessStatus: item.freshnessStatus, evidenceRunId: item.evidenceRunId })) };
}

export async function runProductCell(cell: ExperimentCell, options: {
  onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
} = {}): Promise<ProductCellResult> {
  const startedAt = new Date().toISOString();
  const wallStarted = Date.now();
  const costEvents: ExperimentCostEvent[] = [];
  const recordCostEvents = async (events: ExperimentCostEvent[]): Promise<void> => {
    costEvents.push(...events);
    await options.onCostEvents?.(events);
  };
  const warnings: string[] = [];
  const frozenPlan = leadPlanForCell(cell);

  const intentStarted = new Date().toISOString();
  const intent = await planAssistantRequest(frozenPlan.userRequest);
  const intentCompleted = new Date().toISOString();
  for (const [index, call] of (intent.plannerCalls ?? []).entries()) {
    await recordCostEvents([event({ eventId: `${cell.cellId}:intent:${index + 1}`, cellId: cell.cellId, stage: "intent",
      provider: "kimi", requestedModel: call.requestedModel, actualModel: call.actualModel,
      startedAt: intentStarted, completedAt: intentCompleted, latencyMs: call.latencyMs,
      attempts: call.attempts, retries: call.retries, fallbackUsed: false,
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
  if (intent.leadPlan.countryCode !== frozenPlan.countryCode || intent.leadPlan.targetCount !== 30
    || intent.leadPlan.objective !== frozenPlan.objective
    || !intentRolesStayWithinCategory(intent.leadPlan.roles, frozenPlan.roles)) {
    throw new Error(`${cell.cellId} Kimi intent plan diverged from the frozen task semantics`);
  }
  warnings.push(...intent.warnings);
  const plan: LeadSearchPlan = { ...frozenPlan, coverageMode: intent.leadPlan.coverageMode ?? "auto",
    verifiedOnly: false };

  const userId = process.env.SEARCH_E2E_USER_ID?.trim();
  if (!userId) throw new Error("SEARCH_E2E_USER_ID is required for frozen local-database RAG");
  const embeddingUsage: EmbeddingCallUsage[] = [];
  const ragStarted = new Date().toISOString();
  const ragContext = await retrieveLeadRagContext(userId, plan, { onEmbeddingUsage: (usage) => {
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
  const playbook = buildStandardLeadMarketPlaybook(plan, ragContext);
  const playbookCompleted = new Date().toISOString();
  await recordCostEvents([event({ eventId: `${cell.cellId}:playbook`, cellId: cell.cellId, stage: "playbook",
    provider: "deterministic-template", startedAt: playbookStarted, completedAt: playbookCompleted,
    latencyMs: Math.max(0, Date.parse(playbookCompleted) - Date.parse(playbookStarted)), attempts: 0, retries: 0,
    fallbackUsed: false, status: "completed", usage: {}, volume: volume(ragContext.length, 1, 1, 1) })]);

  const discoveryStarted = new Date().toISOString();
  const discovered = await executeHybridDiscovery(`${EXPERIMENT_CONFIG.runId}-${cell.cellId}-product`, plan, playbook);
  const discoveryCompleted = new Date().toISOString();
  for (const [index, call] of discovered.calls.entries()) {
    const model = call.route.provider === "gemini-full" || call.route.provider === "gemini-product"
      ? process.env.GEMINI_DISCOVERY_MODEL?.trim() || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash"
      : undefined;
    await recordCostEvents([event({ eventId: `${cell.cellId}:discovery:${index + 1}`, cellId: cell.cellId,
      stage: "hybrid-discovery", provider: call.route.provider, requestedModel: model, actualModel: model,
      startedAt: discoveryStarted, completedAt: discoveryCompleted, latencyMs: call.latencyMs,
      attempts: call.requestCount, retries: call.retryCount, fallbackUsed: call.fallbackUsed, status: call.status,
      usage: { inputTokens: call.inputTokens, outputTokens: call.outputTokens,
        searchRequests: call.requestCount, groundingQueries: call.groundingQueries,
        searchResults: call.rawResults, extractedPages: call.route.provider === "exa" ? call.rawResults : 0,
        paidSearchCredits: call.paidSearchCredits },
      volume: volume(1, call.rawResults, call.normalizedCompanies, call.newUniqueCompanies,
        { ...call.discardedReasonCounts, duplicate: call.existingCompanyHits }) })]);
  }
  await recordCostEvents(modelUsageEvents(cell, "discovery-gate", discovered.modelUsage,
    discoveryStarted, discoveryCompleted, volume(discovered.calls.reduce((sum, call) => sum + call.newUniqueCompanies, 0),
      discovered.candidates.length + discovered.rejectedCandidates.length, discovered.candidates.length,
      discovered.candidates.length, { rejected: discovered.rejectedCandidates.length })));
  warnings.push(...discovered.warnings);

  const evidenceStarted = new Date().toISOString();
  const enriched = await collectLeadEvidence(discovered.candidates, plan, { allowReusableEvidence: false,
    persistEvidence: false, concurrency: 12, maximumAttempts: 3 });
  const evidenceCompleted = new Date().toISOString();
  const evidenceCount = enriched.candidates.reduce((sum, candidate) => sum
    + candidate.evidence.filter((item) => item.sourceType !== "discovery").length, 0);
  await recordCostEvents([event({ eventId: `${cell.cellId}:fresh-evidence`, cellId: cell.cellId, stage: "fresh-evidence",
    provider: "tavily", startedAt: evidenceStarted, completedAt: evidenceCompleted,
    latencyMs: enriched.providerMetrics?.latencyMs ?? Date.parse(evidenceCompleted) - Date.parse(evidenceStarted),
    attempts: enriched.providerMetrics?.attempts ?? 0, retries: enriched.providerMetrics?.retries ?? 0,
    fallbackUsed: false, status: "completed", usage: { paidSearchCredits: enriched.creditsUsed },
    volume: volume(discovered.candidates.length, evidenceCount, evidenceCount, evidenceCount,
      { noFreshEvidence: enriched.candidates.filter((candidate) => !candidate.evidence.some((item) => item.sourceType !== "discovery")).length }),
    notes: ["historical evidence reads disabled", "evidence-library writes disabled"] })]);
  warnings.push(...enriched.warnings);

  const correctionStarted = new Date().toISOString();
  const corrected = await new LeadEvidenceCorrectionAgent().correct(enriched.candidates, plan);
  const correctionCompleted = new Date().toISOString();
  if (corrected.creditsUsed > 0 || corrected.providerMetrics.attempts > 0) {
    await recordCostEvents([event({ eventId: `${cell.cellId}:correction-evidence`, cellId: cell.cellId,
      stage: "evidence-correction-search", provider: "tavily", startedAt: correctionStarted,
      completedAt: correctionCompleted, latencyMs: corrected.providerMetrics.latencyMs,
      attempts: corrected.providerMetrics.attempts, retries: corrected.providerMetrics.retries,
      fallbackUsed: false, status: "completed", usage: { paidSearchCredits: corrected.creditsUsed },
      volume: volume(enriched.candidates.length, corrected.candidates.length, corrected.candidates.length,
        corrected.candidates.length) })]);
  }
  await recordCostEvents(modelUsageEvents(cell, "evidence-correction", corrected.usage ?? [], correctionStarted,
    correctionCompleted, volume(enriched.candidates.length, corrected.candidates.length,
      corrected.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length,
      corrected.candidates.length)));
  warnings.push(...corrected.warnings);

  const scoringStarted = new Date().toISOString();
  const scored = await new LeadQualificationAgent(undefined, { includeCooperationPaths: false, concurrency: 4 })
    .evaluateWithUsage(corrected.candidates, playbook, plan.countryCode, plan.countryName, plan.objective);
  const scoringCompleted = new Date().toISOString();
  await recordCostEvents(modelUsageEvents(cell, "qualification-score-only", scored.usage, scoringStarted,
    scoringCompleted, volume(corrected.candidates.length, scored.assessments.length,
      scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
      scored.assessments.length, { retryRequired: scored.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length })));

  const candidateById = new Map(corrected.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const finalPairs = scored.assessments.flatMap((assessment) => {
    const candidate = candidateById.get(assessment.candidateId);
    if (!candidate || assessment.scoringStatus !== "completed"
      || !primaryRoleMatchesCategory(candidate.correction.primaryRole, cell.categoryId)
      || Object.values(assessment.gates).some((state) => state === "not-supported")) return [];
    return [{ candidate, assessment }];
  }).sort((a, b) => b.assessment.totalScore - a.assessment.totalScore
    || a.candidate.companyName.localeCompare(b.candidate.companyName)).slice(0, 30);
  const finalCandidates = finalPairs.map(({ candidate, assessment }, index) => toFinalCandidate(candidate, assessment, index + 1));
  const rankingAt = new Date().toISOString();
  await recordCostEvents([event({ eventId: `${cell.cellId}:ranking`, cellId: cell.cellId, stage: "role-filter-ranking",
    provider: "deterministic", startedAt: scoringCompleted, completedAt: rankingAt,
    latencyMs: Math.max(0, Date.parse(rankingAt) - Date.parse(scoringCompleted)), attempts: 0, retries: 0,
    fallbackUsed: false, status: "completed", usage: {}, volume: volume(scored.assessments.length,
      scored.assessments.length, finalPairs.length, finalCandidates.length,
      { wrongPrimaryRoleOrGate: scored.assessments.length - finalPairs.length }) })]);

  if (costEvents.some((item) => item.budgetCostUsd === null)) {
    throw new Error(`${cell.cellId} contains unpriced product cost events: ${costEvents.filter((item) => item.budgetCostUsd === null).map((item) => item.eventId).join(", ")}`);
  }
  return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, cellId: cell.cellId, arm: "product-e2e",
    startedAt, completedAt: new Date().toISOString(), wallClockMs: Date.now() - wallStarted, plan,
    intent: { plannerModel: intent.plannerModel, plannerSource: intent.plannerSource,
      confidence: intent.confidence, warnings: intent.warnings }, playbook,
    rawDiscoveryCount: discovered.calls.reduce((sum, call) => sum + call.rawResults, 0),
    discoveredCandidateCount: discovered.candidates.length, correctedCandidateCount: corrected.candidates.length,
    completedAssessmentCount: scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
    finalCandidates, missingSlots: Math.max(0, 30 - finalCandidates.length), discoveryCalls: discovered.calls,
    warnings, costEvents, coldStartAudit: { historicalCandidateReads: 0, historicalEvidenceReads: 0,
      privateMemoryReads: 0, historicalScoreReads: 0, evidenceLibraryWrites: 0, cooperationPathsGenerated: 0 },
    raw: { ragContext, discovered, enriched, corrected, assessments: scored.assessments } };
}
