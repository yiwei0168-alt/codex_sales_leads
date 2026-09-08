import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { discoveryEnvironmentStatus } from "@/providers/discovery";
import { OpenAiCompatibleProvider } from "@/providers/openai-compatible";
import { getOpenRouterConfig } from "@/providers/openrouter";
import { createLeadAiProvider } from "@/providers/resilient-ai";

import { buildBlindAuditV2Sample, executeBlindAuditV2, type BlindAuditV2DecisionCache,
  type BlindJudgeV2Decision } from "../lib/blind-audit-v2";
import { evaluateBudget, forecastCompletionCost, summarizeCostEvents,
  priceCostEvent, type ExperimentCostEvent, type ExperimentRateCard } from "../lib/cost-ledger";
import { runControlCell, type ControlCellResult } from "../lib/control-cell";
import { calculateExperimentMetrics } from "../lib/evaluation-metrics";
import { cellById, experimentCells, EXPERIMENT_CONFIG, validateExperimentConfig } from "../lib/experiment";
import { calculateProviderContributions, optimizationFindings } from "../lib/final-report";
import { runProductCell, type ProductCellResult } from "../lib/product-cell";
import { sanitizeDiscoveryCalls } from "../lib/public-artifact";
import { artifactRunRoot, loadRunState, rawRunRoot, readJson, readJsonIfExists, saveRunState,
  writeJsonAtomic, writeTextAtomic, type FormalRunState } from "../lib/run-store";
import { buildControlUniqueGroups, buildProductRecordIndex, evaluateControlUniqueGroup, identityAliases,
  metricSlotsForBundles, type ControlUniqueEvaluationResult, type FrozenCellBundle } from "../lib/unified-evaluation";
import rateCardJson from "../config/official-rate-card.v1.json";

nextEnv.loadEnvConfig(process.cwd());

const experimentRoot = path.resolve("experiments/search-e2e-evaluation/co-v2");
const frozenTag = "search-e2e-co-v2.0.14-preregistered";
const totalCells = EXPERIMENT_CONFIG.sample.cells;
const slotsPerCell = EXPERIMENT_CONFIG.sample.slotsPerArmPerCell;
const rateCard = rateCardJson as ExperimentRateCard;

const frozenFiles = [
  "PROTOCOL.md", "README.md", "config/experiment.v2.0.0.json", "config/gemini-control-prompt.md",
  "config/blind-audit-v2.1.0.json", "config/blind-judge-rubric-v2.md",
  "config/blind-judge-arbitration-rubric-v2.md", "config/official-rate-card.v1.json",
  "schemas/gemini-control-output.schema.json", "schemas/blind-judge-output-v2.schema.json",
  "schemas/runtime-cost-event.schema.json", "lib/blind-audit-v2.ts", "lib/cost-ledger.ts",
  "lib/control-cell.ts", "lib/evaluation-metrics.ts", "lib/experiment.ts", "lib/final-report.ts",
  "lib/product-cell.ts", "lib/provider-clients.ts", "lib/public-artifact.ts", "lib/run-store.ts",
  "lib/runtime-schemas.ts", "lib/unified-evaluation.ts", "scripts/run-formal-experiment.ts",
  "../../../config/lead-search/hybrid-search-v1.0.0.json",
  "../../../config/lead-scoring/policy-v2.0.0.json",
  "../../../config/lead-workflow/end-to-end-v2.0.0.json",
  "../../../config/lead-workflow/runtime-policy-v3.0.0.json",
  "../../../config/lead-workflow/cost-quality-policy-v3.0.0.json",
  "../../../src/lib/assistant/intent-agent.ts", "../../../src/lib/assistant/types.ts",
  "../../../src/lib/leads/workflow/hybrid-discovery-executor.ts",
  "../../../src/lib/leads/workflow/hybrid-search-policy.ts",
  "../../../src/lib/leads/workflow/candidate-registry.ts",
  "../../../src/lib/leads/workflow/discovery-gate.ts", "../../../src/lib/leads/workflow/playbook.ts",
  "../../../src/lib/leads/workflow/rag-context.ts", "../../../src/lib/leads/workflow/role-correction-cache.ts",
  "../../../src/lib/leads/workflow/target-completion-policy.ts", "../../../src/lib/leads/workflow/discovery.ts",
  "../../../src/lib/leads/workflow/evidence-correction-agent.ts",
  "../../../src/lib/leads/workflow/qualification-agent.ts", "../../../src/lib/leads/workflow/schemas.ts",
  "../../../src/lib/leads/workflow/types.ts", "../../../src/lib/leads/workflow/cost-quality-policy.ts",
  "../../../src/lib/leads/workflow/evidence-packet.ts", "../../../src/lib/leads/candidate-value.ts",
  "../../../src/lib/leads/channel-membership.ts", "../../../src/lib/leads/evidence-quality.ts",
  "../../../src/lib/leads/evidence-snapshot.ts", "../../../src/lib/leads/networking-relevance.ts",
  "../../../src/lib/leads/primary-channel.ts", "../../../src/lib/leads/scoring-policy.ts",
  "../../../src/providers/contracts.ts", "../../../src/providers/discovery.ts",
  "../../../src/providers/openrouter.ts", "../../../src/providers/resilient-ai.ts",
  "../../../src/providers/openai-compatible.ts", "../../../src/providers/tavily.ts", "../../../src/providers/deepseek.ts",
  "../../../src/lib/rag/openai-provider.ts",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function appendCostEvents(state: FormalRunState, events: ExperimentCostEvent[]): void {
  const ids = new Set(state.costEvents.map((item) => item.eventId));
  for (const event of events) {
    let eventId = event.eventId;
    let repeat = 1;
    while (ids.has(eventId)) eventId = `${event.eventId}:repeat-${++repeat}`;
    ids.add(eventId);
    state.costEvents.push(eventId === event.eventId ? event : { ...event, eventId,
      notes: [...(event.notes ?? []), `Repeated call; base event ${event.eventId}.`] });
  }
}

function publicProduct(result: ProductCellResult) {
  const { raw, discoveryCalls, ...rest } = result;
  void raw;
  return { ...rest, discoveryCalls: sanitizeDiscoveryCalls(discoveryCalls) };
}

function publicControl(result: ControlCellResult) {
  const { raw, ...rest } = result;
  void raw;
  return rest;
}

function publicEvaluation(result: ControlUniqueEvaluationResult) {
  const { raw, ...rest } = result;
  void raw;
  return rest;
}

function utilization(events: ExperimentCostEvent[]) {
  const totals = events.reduce((sum, event) => ({ input: sum.input + event.volume.inputItems,
    raw: sum.raw + event.volume.rawOutputItems, valid: sum.valid + event.volume.validOutputItems,
    used: sum.used + event.volume.downstreamUsedItems, retries: sum.retries + event.retries,
    latencyMs: sum.latencyMs + event.latencyMs }),
  { input: 0, raw: 0, valid: 0, used: 0, retries: 0, latencyMs: 0 });
  return { ...totals, validOutputRate: totals.raw ? totals.valid / totals.raw : 0,
    downstreamUtilization: totals.valid ? totals.used / totals.valid : 0,
    discardedOutputReasons: events.reduce<Record<string, number>>((counts, event) => {
      for (const [reason, count] of Object.entries(event.volume.discardedReasonCounts)) {
        counts[reason] = (counts[reason] ?? 0) + count;
      }
      return counts;
    }, {}) };
}

function remainingEvaluationReserve(state: FormalRunState): number {
  if (state.completedCellIds.length < totalCells) return 8;
  if (state.completedEvaluationCellIds.length < totalCells) {
    return (totalCells - state.completedEvaluationCellIds.length) * 1.25 + 4;
  }
  return Math.max(0, EXPERIMENT_CONFIG.blindAudit.total - state.completedBlindPacketIds.length) * 0.12;
}

function budgetDecision(state: FormalRunState, nextRequiredCallEstimateUsd = 0) {
  const forecast = forecastCompletionCost(state.costEvents, { completedCellIds: state.completedCellIds,
    totalCells, fixedRemainingUsd: remainingEvaluationReserve(state),
    initialEstimateUsd: EXPERIMENT_CONFIG.cost.initialForecastUsd.expected });
  return evaluateBudget(state.costEvents, forecast, { totalBudgetUsd: EXPERIMENT_CONFIG.cost.hardBudgetUsd,
    thresholdsUsd: [...EXPERIMENT_CONFIG.cost.reviewThresholdUsd],
    previouslyReportedThresholdsUsd: state.reportedBudgetThresholdsUsd, nextRequiredCallEstimateUsd });
}

async function persistBudgetReview(state: FormalRunState, label: string, allowForecastPause = true) {
  const decision = budgetDecision(state);
  if (decision.newlyCrossedThresholdsUsd.length > 0) {
    state.reportedBudgetThresholdsUsd.push(...decision.newlyCrossedThresholdsUsd);
    const checkpoint = { schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(), label,
      thresholdsUsd: decision.newlyCrossedThresholdsUsd, cost: summarizeCostEvents(state.costEvents),
      utilization: utilization(state.costEvents), budgetDecision: decision,
      completed: { cells: state.completedCellIds, evaluationCells: state.completedEvaluationCellIds,
        blindPackets: state.completedBlindPacketIds.length },
      projectionAssessment: decision.forecast.expectedCompletionUsd <= EXPERIMENT_CONFIG.cost.hardBudgetUsd
        && decision.forecast.upperUsd <= EXPERIMENT_CONFIG.cost.hardBudgetUsd ? "within-budget" : "cost-warning" };
    await writeJsonAtomic(path.join(artifactRunRoot(),
      `cost/checkpoint-${decision.newlyCrossedThresholdsUsd.join("-")}-${label}.json`), checkpoint);
    console.log(JSON.stringify({ status: "budget-checkpoint", ...checkpoint }, null, 2));
  }
  if ((decision.hardStop || (allowForecastPause && decision.requiresUserDecision))
    && state.status !== "budget-paused") {
    state.status = "budget-paused";
    state.anomalies.push({ at: new Date().toISOString(), severity: "warning", code: "budget-forecast-warning",
      detail: `${label}: ${decision.reasons.join(", ")}` });
    await writeJsonAtomic(path.join(artifactRunRoot(), `cost/budget-warning-${label}.json`), decision);
  }
  await saveRunState(state);
  return decision;
}

async function requireBudget(state: FormalRunState, label: string, estimateUsd: number): Promise<boolean> {
  if (state.status === "budget-paused") return false;
  const decision = budgetDecision(state, estimateUsd);
  if (!decision.requiresUserDecision) return true;
  const authorization = state.budgetForecastAuthorization;
  if (!decision.hardStop && decision.reasons.every((reason) => reason === "forecast-may-exceed-budget")
    && authorization && authorization.authorizedCellId === label && authorization.remainingCellStarts > 0) {
    authorization.remainingCellStarts -= 1;
    authorization.consumedAt = new Date().toISOString();
    authorization.consumedForCellId = label;
    await saveRunState(state);
    return true;
  }
  state.status = "budget-paused";
  state.anomalies.push({ at: new Date().toISOString(), severity: "warning", code: "budget-forecast-warning",
    detail: `${label}: ${decision.reasons.join(", ")}` });
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `cost/budget-warning-before-${label}.json`), decision);
  console.log(JSON.stringify({ status: "budget-paused", label, budgetDecision: decision }, null, 2));
  process.exitCode = 2;
  return false;
}

async function resumeBudgetAfterUserConfirmation(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (state.status !== "budget-paused") {
    throw new Error(`Budget resume requires budget-paused state; received ${state.status}`);
  }
  const decision = budgetDecision(state);
  if (decision.hardStop) throw new Error(`Cannot resume after hard budget stop: ${decision.reasons.join(", ")}`);
  const confirmedAt = new Date().toISOString();
  state.budgetForecastAuthorization = {
    confirmedAt,
    reason: "User confirmed the recommended plan: freeze CO Retail at 14/50, continue the next frozen cell, retain the USD 50 hard stop and report USD 10/20/30 checkpoints.",
    baselineSpentUsd: decision.spentUsd,
    baselineExpectedUsd: decision.forecast.expectedCompletionUsd,
    baselineUpperUsd: decision.forecast.upperUsd,
    authorizedCellId: "CO-distribution",
    remainingCellStarts: 1,
  };
  state.preflightChecks.push({ name: "budget-forecast-user-authorization-v2.0.12", completedAt: confirmedAt,
    detail: { retailFrozenCandidateCount: 14, additionalRetailSearchAuthorized: false,
      nextFrozenCellAuthorized: "CO-distribution", hardBudgetUsd: EXPERIMENT_CONFIG.cost.hardBudgetUsd,
      reviewThresholdsUsd: EXPERIMENT_CONFIG.cost.reviewThresholdUsd,
      baselineExpectedUsd: decision.forecast.expectedCompletionUsd,
      baselineUpperUsd: decision.forecast.upperUsd } });
  state.status = state.completedCellIds.length === totalCells ? "cells-completed" : "running";
  await saveRunState(state);
  const artifact = { schemaVersion: 1, runId: state.runId, confirmedAt,
    authorization: state.budgetForecastAuthorization, budgetDecision: decision };
  await writeJsonAtomic(path.join(artifactRunRoot(), "cost/budget-resume-user-confirmed-v2.0.12.json"), artifact);
  console.log(JSON.stringify({ status: state.status, ...artifact }, null, 2));
}

async function freezeManifest(): Promise<void> {
  validateExperimentConfig();
  const files = await Promise.all(frozenFiles.map(async (relative) => {
    const absolute = path.resolve(experimentRoot, relative);
    return { path: path.relative(process.cwd(), absolute).replace(/\\/g, "/"), sha256: sha256(await readFile(absolute)) };
  }));
  await writeJsonAtomic(path.join(experimentRoot, "config/frozen-manifest.v2.0.14.json"), {
    schemaVersion: 1, experimentId: EXPERIMENT_CONFIG.experimentId, runId: EXPERIMENT_CONFIG.runId,
    createdAt: new Date().toISOString(), requiredGitTag: frozenTag, files,
  });
  console.log(JSON.stringify({ status: "manifest-frozen", fileCount: files.length,
    manifest: "experiments/search-e2e-evaluation/co-v2/config/frozen-manifest.v2.0.14.json" }, null, 2));
}

async function verifyFrozenManifest(requireTag = true): Promise<void> {
  validateExperimentConfig();
  const manifest = JSON.parse(await readFile(path.join(experimentRoot, "config/frozen-manifest.v2.0.14.json"), "utf8")) as {
    requiredGitTag: string; files: Array<{ path: string; sha256: string }> };
  const mismatches: string[] = [];
  for (const item of manifest.files) {
    if (sha256(await readFile(path.resolve(item.path))) !== item.sha256) mismatches.push(item.path);
  }
  if (mismatches.length) throw new Error(`Frozen input hash mismatch: ${mismatches.join(", ")}`);
  if (requireTag) {
    try { execFileSync("git", ["merge-base", "--is-ancestor", manifest.requiredGitTag, "HEAD"],
      { cwd: process.cwd(), stdio: "ignore" }); }
    catch { throw new Error(`Frozen tag ${manifest.requiredGitTag} must be an ancestor of HEAD before paid calls`); }
  }
}

async function runStructuredProviderCheck(state: FormalRunState, checkName: string): Promise<void> {
  if (state.preflightChecks.some((item) => item.name === checkName)) return;
  const startedAt = new Date().toISOString();
  const response = await createLeadAiProvider().execute({
    task: "assistant-intent",
    modelVersion: EXPERIMENT_CONFIG.arms["product-e2e"].models.discoveryGateRoutine,
    promptVersion: "co-provider-recovery-preflight-v1",
    input: { instruction: "Return ok=true. This validates structured public-evidence model routing only." },
    evidenceIds: [],
    dataClassification: "public",
    outputSchema: { type: "object", additionalProperties: false, required: ["ok"],
      properties: { ok: { type: "boolean", const: true } } },
  }, AbortSignal.timeout(30_000));
  if (!(typeof response.output === "object" && response.output !== null
    && (response.output as { ok?: unknown }).ok === true)) throw new Error("Structured provider check returned invalid output");
  const completedAt = new Date().toISOString();
  const costEvent = priceCostEvent({ eventId: `preflight:${checkName}`, runId: state.runId,
    arm: "product-e2e", ledger: "product-e2e-arm", stage: "model-provider-preflight",
    provider: response.actualProviderId ?? "deepseek", requestedModel: response.requestedModelVersion
      ?? EXPERIMENT_CONFIG.arms["product-e2e"].models.discoveryGateRoutine,
    actualModel: response.modelVersion, startedAt, completedAt, latencyMs: response.latencyMs,
    attempts: response.attempts ?? 1, retries: response.retries ?? 0,
    fallbackUsed: Boolean(response.actualProviderId && response.actualProviderId !== "deepseek"),
    status: "completed", usage: { inputTokens: response.usage?.promptTokens ?? 0,
      outputTokens: response.usage?.completionTokens ?? 0,
      reasoningTokens: response.usage?.reasoningTokens ?? 0 },
    volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 1, downstreamUsedItems: 1,
      discardedReasonCounts: {} }, accountCashCostUsd: response.usage?.accountCashCostUsd,
    notes: response.warnings }, rateCard);
  appendCostEvents(state, [costEvent]);
  state.preflightChecks.push({ name: checkName, completedAt,
    detail: { paidCallsMade: 1, secretsRecorded: false, requestedModel: costEvent.requestedModel,
      actualModel: costEvent.actualModel, actualProvider: costEvent.provider,
      fallbackUsed: costEvent.fallbackUsed, attempts: costEvent.attempts } });
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `preflight/${checkName}.json`), {
    schemaVersion: 1, runId: state.runId, status: "passed", completedAt,
    provider: costEvent.provider, requestedModel: costEvent.requestedModel,
    actualModel: costEvent.actualModel, fallbackUsed: costEvent.fallbackUsed,
    attempts: costEvent.attempts, cost: { officialListPriceUsd: costEvent.officialListPriceUsd,
      budgetCostUsd: costEvent.budgetCostUsd, cashCostBasis: costEvent.cashCostBasis },
  });
}

async function runStructuredPeerProviderCheck(state: FormalRunState, checkName: string): Promise<void> {
  if (state.preflightChecks.some((item) => item.name === checkName)) return;
  const config = getOpenRouterConfig();
  const provider = new OpenAiCompatibleProvider({ id: "openrouter-openai-peer", apiKey: config.apiKey,
    baseUrl: config.baseUrl, defaultHeaders: config.defaultHeaders, maxAttempts: 1,
    extraBody: { provider: config.providerPreferences } });
  const startedAt = new Date().toISOString();
  const response = await provider.execute({ task: "assistant-intent", modelVersion: "openai/gpt-4o-mini",
    promptVersion: "co-openai-peer-preflight-v1",
    input: { instruction: "Return ok=true. This validates the public same-tier peer fallback only." },
    evidenceIds: [], dataClassification: "public",
    outputSchema: { type: "object", additionalProperties: false, required: ["ok"],
      properties: { ok: { type: "boolean", const: true } } } }, AbortSignal.timeout(30_000));
  if (!(typeof response.output === "object" && response.output !== null
    && (response.output as { ok?: unknown }).ok === true)) throw new Error("Structured peer check returned invalid output");
  const completedAt = new Date().toISOString();
  const costEvent = priceCostEvent({ eventId: `preflight:${checkName}`, runId: state.runId,
    arm: "product-e2e", ledger: "product-e2e-arm", stage: "model-peer-provider-preflight",
    provider: provider.id, requestedModel: "openai/gpt-4o-mini", actualModel: response.modelVersion,
    startedAt, completedAt, latencyMs: response.latencyMs, attempts: 1, retries: 0,
    fallbackUsed: true, status: "completed", usage: { inputTokens: response.usage?.promptTokens ?? 0,
      outputTokens: response.usage?.completionTokens ?? 0,
      reasoningTokens: response.usage?.reasoningTokens ?? 0 },
    volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 1, downstreamUsedItems: 1,
      discardedReasonCounts: {} }, accountCashCostUsd: response.usage?.accountCashCostUsd,
    notes: ["Direct public-only peer-route capability check; no candidate or private data sent."] }, rateCard);
  appendCostEvents(state, [costEvent]);
  state.preflightChecks.push({ name: checkName, completedAt, detail: { paidCallsMade: 1,
    secretsRecorded: false, requestedModel: costEvent.requestedModel, actualModel: costEvent.actualModel,
    actualProvider: costEvent.provider, attempts: costEvent.attempts } });
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `preflight/${checkName}.json`), {
    schemaVersion: 1, runId: state.runId, status: "passed", completedAt,
    provider: costEvent.provider, requestedModel: costEvent.requestedModel, actualModel: costEvent.actualModel,
    attempts: costEvent.attempts, cost: { officialListPriceUsd: costEvent.officialListPriceUsd,
      budgetCostUsd: costEvent.budgetCostUsd, cashCostBasis: costEvent.cashCostBasis },
  });
}

async function runPreflight(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (state.status !== "created") {
    console.log(JSON.stringify({ status: "preflight-already-recorded", runStatus: state.status }, null, 2));
    return;
  }
  const requiredEnvironment = ["KIMI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY",
    "OPENROUTER_API_KEY", "EMBEDDING_API_KEY", "DATABASE_URL", "SEARCH_E2E_USER_ID"];
  const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
  const discovery = discoveryEnvironmentStatus();
  const requiredDiscovery = new Set(["gemini-full", "brave", "searchapi", "exa", "google-places"]);
  const unavailableDiscovery = discovery.filter((item) => requiredDiscovery.has(item.providerId) && !item.configured)
    .map((item) => item.providerId);
  if (missing.length || unavailableDiscovery.length) {
    throw new Error(`Preflight configuration missing: ${[...missing, ...unavailableDiscovery].join(", ")}`);
  }
  await runStructuredProviderCheck(state, "structured-model-runtime");
  state.preflightChecks.push({ name: "configuration-and-frozen-inputs", completedAt: new Date().toISOString(),
    detail: { requiredEnvironment: requiredEnvironment.map((name) => ({ name, configured: true })),
      discovery: discovery.map(({ providerId, configured }) => ({ providerId, configured })),
      paidCallsMade: 0, secretsRecorded: false } });
  state.blindJudgeModel = "blind-audit-v2.1-dual-judge";
  state.status = "preflight-passed";
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), "preflight/preflight-report.json"), {
    schemaVersion: 1, runId: state.runId, status: "passed", completedAt: new Date().toISOString(),
    checks: state.preflightChecks, paidCallsMade: 1, initialBudgetDecision: budgetDecision(state),
  });
  console.log(JSON.stringify({ status: "preflight-passed", runId: state.runId,
    initialBudgetDecision: budgetDecision(state) }, null, 2));
}

async function runRecoveryPreflight(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (!["preflight-passed", "running"].includes(state.status)) {
    throw new Error(`Provider recovery check cannot run from status ${state.status}`);
  }
  state.experimentId = EXPERIMENT_CONFIG.experimentId;
  await runStructuredProviderCheck(state, "structured-model-runtime-v2.0.8");
  await runStructuredPeerProviderCheck(state, "structured-openai-peer-runtime-v2.0.8");
  const decision = await persistBudgetReview(state, "provider-recovery-v2.0.8");
  console.log(JSON.stringify({ status: "provider-recovery-preflight-passed",
    runId: state.runId, cost: summarizeCostEvents(state.costEvents), budgetDecision: decision }, null, 2));
}

async function runCell(cellId: string): Promise<void> {
  await verifyFrozenManifest(true);
  const cell = cellById(cellId);
  const state = await loadRunState();
  const resumeProduct = process.argv.includes("--resume-product");
  const repairSearch = process.argv.includes("--repair-search");
  const repairIncomplete = process.argv.includes("--repair-incomplete");
  const repairConsistency = process.argv.includes("--repair-consistency");
  const restartProduct = process.argv.includes("--restart-product");
  const resumeRequested = resumeProduct || repairSearch || repairIncomplete || repairConsistency;
  const productRerunRequested = resumeRequested || restartProduct;
  if (!state.blindJudgeModel || !["preflight-passed", "running"].includes(state.status)) {
    throw new Error("Formal cells require a passed preflight and a non-paused budget state");
  }
  if (state.completedCellIds.includes(cellId) && !productRerunRequested) {
    console.log(JSON.stringify({ status: "cell-already-complete", cellId }, null, 2));
    return;
  }
  const productFilename = path.join(rawRunRoot(), `cells/${cellId}/product-e2e.json`);
  const resumeFrom = resumeRequested ? await readJsonIfExists<ProductCellResult>(productFilename) : null;
  const restartFrom = restartProduct ? await readJsonIfExists<ProductCellResult>(productFilename) : null;
  if (resumeRequested && !resumeFrom) throw new Error(`Cannot resume ${cellId}: prior Product artifact is missing`);
  if (resumeProduct && resumeFrom && resumeFrom.finalCandidates.length > 0) {
    throw new Error(`Cannot resume ${cellId}: recovery is limited to a zero-output provider-outage artifact`);
  }
  if (repairIncomplete && resumeFrom) {
    const corrected = (resumeFrom.raw.corrected as Array<{ correction?: { model?: string } }> | undefined) ?? [];
    const assessments = (resumeFrom.raw.assessments as Array<{ scoringStatus?: string }> | undefined) ?? [];
    if (!corrected.some((candidate) => candidate.correction?.model === "deterministic-fallback")
      && !assessments.some((assessment) => assessment.scoringStatus !== "completed")) {
      throw new Error(`Cannot repair ${cellId}: no incomplete semantic outputs were found`);
    }
  }
  if (restartProduct && !restartFrom) throw new Error(`Cannot restart ${cellId}: prior Product artifact is missing`);
  if (productRerunRequested) {
    state.completedCellIds = state.completedCellIds.filter((id) => id !== cellId);
    state.completedArmKeys = state.completedArmKeys.filter((key) => key !== `${cellId}:product-e2e`);
  }
  if (restartFrom) {
    await writeJsonAtomic(path.join(rawRunRoot(), `superseded/${cellId}/product-e2e.v2.0.6.json`), restartFrom);
    await writeJsonAtomic(path.join(artifactRunRoot(), `superseded/${cellId}/product-e2e.v2.0.6.json`),
      publicProduct(restartFrom));
    state.anomalies.push({ at: new Date().toISOString(), cellId, severity: "fatal",
      code: "invalidated-product-arm-country-evidence-contamination",
      detail: "v2.0.6 Product output was archived and excluded from outcome metrics. Sunk costs remain in the experiment ledger; the Product arm restarts cold under v2.0.7 while the frozen Gemini control is reused." });
  }
  state.experimentId = EXPERIMENT_CONFIG.experimentId;
  if (!await requireBudget(state, cellId, EXPERIMENT_CONFIG.cost.initialForecastUsd.expected / totalCells)) return;
  state.status = "running";
  await saveRunState(state);
  let stateWrites = Promise.resolve();
  const enqueue = (mutate: () => void | Promise<void>) => {
    stateWrites = stateWrites.then(async () => { await mutate(); await saveRunState(state); });
    return stateWrites;
  };
  const onCostEvents = (events: ExperimentCostEvent[]) => enqueue(async () => {
    appendCostEvents(state, events);
    await persistBudgetReview(state, `event-${cellId}-${events[0]?.stage ?? "unknown"}`, false);
  }).then(() => {
    if (state.status === "budget-paused") throw new Error("BUDGET_PAUSED_DURING_CELL");
  });
  const executeArm = async (arm: "gemini-native" | "product-e2e") => {
    const armKey = `${cellId}:${arm}`;
    const filename = path.join(rawRunRoot(), `cells/${cellId}/${arm}.json`);
    if (state.completedArmKeys.includes(armKey)) {
      return arm === "gemini-native" ? readJson<ControlCellResult>(filename) : readJson<ProductCellResult>(filename);
    }
    const result = arm === "gemini-native" ? await runControlCell(cell, { onCostEvents })
      : await runProductCell(cell, { onCostEvents, resumeFrom: resumeFrom ?? undefined,
        resumeMode: repairSearch ? "search-extension"
          : repairIncomplete ? "incomplete-recovery"
            : repairConsistency ? "consistency-recovery" : "semantic-recovery" });
    await writeJsonAtomic(filename, result);
    await writeJsonAtomic(path.join(artifactRunRoot(), `cells/${cellId}/${arm}.json`),
      arm === "gemini-native" ? publicControl(result as ControlCellResult) : publicProduct(result as ProductCellResult));
    await enqueue(() => { state.completedArmKeys.push(armKey); });
    return result;
  };
  const settled = await Promise.allSettled(cell.armStartOrder.map((arm) => executeArm(arm)));
  await stateWrites;
  const failures = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected");
  if (failures.length) {
    state.anomalies.push(...failures.map((item) => ({ at: new Date().toISOString(), cellId,
      severity: "fatal" as const, code: "cell-arm-failed",
      detail: item.reason instanceof Error ? item.reason.message : String(item.reason) })));
    await saveRunState(state);
    throw new Error(`${cellId} arm failure: ${failures.map((item) => item.reason instanceof Error
      ? item.reason.message : String(item.reason)).join(" | ")}`);
  }
  const results = settled.map((item) => (item as PromiseFulfilledResult<ControlCellResult | ProductCellResult>).value);
  const control = results.find((item): item is ControlCellResult => item.arm === "gemini-native")!;
  const product = results.find((item): item is ProductCellResult => item.arm === "product-e2e")!;
  if (product.missingSlots) state.anomalies.push({ at: new Date().toISOString(), cellId, severity: "warning",
    code: "product-target-underfill", detail: `Product returned ${product.finalCandidates.length}/${slotsPerCell} after ${product.discoveryRounds.length} rounds; completion=${product.completionReason}.` });
  state.completedCellIds.push(cellId);
  const decision = await persistBudgetReview(state, `after-${cellId}`);
  if (!decision.requiresUserDecision) state.status = state.completedCellIds.length === totalCells ? "cells-completed" : "running";
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `cost/after-${cellId}.json`), {
    schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(),
    cell: { cellId, controlCandidates: control.finalCandidates.length, productCandidates: product.finalCandidates.length,
      controlWallClockMs: control.wallClockMs, productWallClockMs: product.wallClockMs },
    cost: summarizeCostEvents(state.costEvents), utilization: utilization(state.costEvents), budgetDecision: decision,
  });
  console.log(JSON.stringify({ status: state.status, cellId, controlCandidates: control.finalCandidates.length,
    productCandidates: product.finalCandidates.length, cost: summarizeCostEvents(state.costEvents),
    budgetDecision: decision }, null, 2));
  if (decision.requiresUserDecision) process.exitCode = 2;
}

async function loadBundles(): Promise<FrozenCellBundle[]> {
  return Promise.all(experimentCells().map(async (cell) => ({ cell,
    control: await readJson<ControlCellResult>(path.join(rawRunRoot(), `cells/${cell.cellId}/gemini-native.json`)),
    product: await readJson<ProductCellResult>(path.join(rawRunRoot(), `cells/${cell.cellId}/product-e2e.json`)),
  })));
}

class FileDecisionCache implements BlindAuditV2DecisionCache {
  async get(cacheKey: string): Promise<BlindJudgeV2Decision | null> {
    return readJsonIfExists<BlindJudgeV2Decision>(path.join(rawRunRoot(), `blind-audit/cache/${sha256(cacheKey)}.json`));
  }
  async set(cacheKey: string, decision: BlindJudgeV2Decision): Promise<void> {
    await writeJsonAtomic(path.join(rawRunRoot(), `blind-audit/cache/${sha256(cacheKey)}.json`), decision);
  }
}

function renderReport(input: { metrics: ReturnType<typeof calculateExperimentMetrics>;
  blind: Awaited<ReturnType<typeof executeBlindAuditV2>>["metrics"];
  bundles: FrozenCellBundle[]; costs: ExperimentCostEvent[]; findings: string[]; generatedAt: string }) {
  const { metrics, blind, bundles, costs, findings, generatedAt } = input;
  const cost = summarizeCostEvents(costs);
  const rows = metrics.byCell.map((cell) => `| ${cell.cellId} | ${cell.arms["gemini-native"].cellUtility.toFixed(2)} | ${cell.arms["product-e2e"].cellUtility.toFixed(2)} | ${cell.delta.toFixed(2)} | ${cell.arms["gemini-native"].validCount} | ${cell.arms["product-e2e"].validCount} |`).join("\n");
  const gateRows = Object.entries(metrics.gates).map(([name, gate]) => `| ${name} | ${String(gate.actual)} | ${String(gate.threshold)} | ${gate.passed ? "PASS" : "FAIL"} |`).join("\n");
  const totalFinal = bundles.reduce((sum, bundle) => sum + bundle.control.finalCandidates.length + bundle.product.finalCandidates.length, 0);
  return `# Cudy Colombia end-to-end search evaluation v2.0.0\n\nGenerated: ${generatedAt}\n\n## Outcome\n\n${metrics.passed ? "Product E2E passed" : "Product E2E did not pass"} the frozen Colombia win gates. Macro Slot Utility@50: Gemini ${metrics.macroUtility["gemini-native"].toFixed(2)}, Product ${metrics.macroUtility["product-e2e"].toFixed(2)}, delta ${metrics.macroDelta.toFixed(2)}. Product won ${metrics.cellsWonByProduct}/${totalCells} categories. Bootstrap 95% interval: [${metrics.bootstrap.lower95.toFixed(2)}, ${metrics.bootstrap.upper95.toFixed(2)}].\n\n## Category results\n\n| Category cell | Gemini utility | Product utility | Delta | Gemini valid | Product valid |\n|---|---:|---:|---:|---:|---:|\n${rows}\n\n## Frozen win gates\n\n| Gate | Actual | Threshold | Result |\n|---|---:|---:|---|\n${gateRows}\n\n## Blind audit v2.1\n\nTwo independent model families reviewed ${blind.sampleSize} packets: 24 representative and 8 diagnostic stress cases. Representative role-family agreement ${(blind.representative.roleFamilyAgreement * 100).toFixed(1)}%, qualification agreement ${(blind.representative.qualificationAgreement.qualified * 100).toFixed(1)}%, within-cell macro Spearman ${blind.representative.withinCellMacroSpearman.toFixed(3)}, mean bias ${blind.representative.meanBias.toFixed(2)}, MAE ${blind.representative.meanAbsoluteError.toFixed(2)}, citation ID alignment ${(blind.representative.citationIdAlignment * 100).toFixed(1)}%, entailment ${(blind.representative.citationEntailment * 100).toFixed(1)}%. Arbitration ${blind.arbitrationCount}/${blind.sampleSize}; blind gate ${blind.passed ? "PASS" : "FAIL"}.\n\n## Cost, time and utilization\n\nTotal budget cost $${cost.budgetCostUsd.toFixed(4)} across ${cost.eventCount} events: Gemini $${cost.byLedger["gemini-native-arm"].toFixed(4)}, Product $${cost.byLedger["product-e2e-arm"].toFixed(4)}, evaluation $${cost.byLedger["evaluation-overhead"].toFixed(4)}. Unit cost $${(cost.budgetCostUsd / EXPERIMENT_CONFIG.sample.totalSlots).toFixed(4)} per requested slot and $${(cost.budgetCostUsd / Math.max(1, totalFinal)).toFixed(4)} per returned candidate. Summed wall time: Gemini ${(bundles.reduce((sum, item) => sum + item.control.wallClockMs, 0) / 60000).toFixed(2)} minutes, Product ${(bundles.reduce((sum, item) => sum + item.product.wallClockMs, 0) / 60000).toFixed(2)} minutes; time is recorded but is not a win gate.\n\nUtilization telemetry: \`${JSON.stringify(utilization(costs))}\`.\n\n## Observed optimization opportunities\n\n${findings.length ? findings.map((item) => `- ${item}`).join("\n") : "No material provider-level optimization finding met the frozen diagnostic thresholds."}\n\n## Interpretation boundary\n\nThis is a cold-start comparison in Colombia across Distributor/VAD, Reseller/VAR, Retailer/E-tailer and SI/MSP. Each arm had 50 requested slots per category. Product used the frozen new hybrid-search, evidence and scoring workflow; Gemini used one un-tuned Google Search interaction per category. Gemini-only companies received the same evidence, role-correction and scoring mechanism after both result sets were frozen. Cooperation paths, strategy, email and contact generation were excluded.\n`;
}

async function runEvaluation(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (!["cells-completed", "evaluation-running", "blind-audit-running"].includes(state.status)
    || state.completedCellIds.length !== totalCells) throw new Error("Evaluation requires all four frozen cells");
  const bundles = await loadBundles();
  const productIndex = buildProductRecordIndex(bundles);
  const records = new Map(productIndex.records);
  const controlPlan = buildControlUniqueGroups(bundles, productIndex.aliasToCompanyKey);
  const aliases = new Map(controlPlan.originalAliasToKnownKey);
  state.status = "evaluation-running";
  await saveRunState(state);
  let evaluationCostWrites = Promise.resolve();
  const onCostEvents = (events: ExperimentCostEvent[]) => {
    evaluationCostWrites = evaluationCostWrites.then(async () => {
      appendCostEvents(state, events);
      await persistBudgetReview(state, `event-${events[0]?.stage ?? "unknown"}`, false);
    });
    return evaluationCostWrites.then(() => {
      if (state.status === "budget-paused") throw new Error("BUDGET_PAUSED_DURING_EVALUATION");
    });
  };
  for (const bundle of bundles) {
    const filename = path.join(rawRunRoot(), `evaluation/control-unique-${bundle.cell.cellId}.json`);
    let result = await readJsonIfExists<ControlUniqueEvaluationResult>(filename);
    if (!result) {
      if (!await requireBudget(state, `control-evaluation-${bundle.cell.cellId}`, 1.5)) return;
      result = await evaluateControlUniqueGroup(bundle.cell, controlPlan.groups.get(bundle.cell.cellId) ?? [],
        bundle.product.playbook, { onCostEvents });
      await writeJsonAtomic(filename, result);
      await writeJsonAtomic(path.join(artifactRunRoot(), `evaluation/control-unique-${bundle.cell.cellId}.json`),
        publicEvaluation(result));
    }
    const canonical = new Map<string, string>();
    for (const record of result.records) {
      const existing = identityAliases(record.countryCode, record.companyName, record.officialWebsiteUrl)
        .map((alias) => aliases.get(alias)).find((key) => key && records.has(key));
      const key = existing ?? record.companyKey;
      canonical.set(record.companyKey, key);
      if (!records.has(key)) records.set(key, key === record.companyKey ? record : { ...record, companyKey: key });
      for (const alias of identityAliases(record.countryCode, record.companyName, record.officialWebsiteUrl)) aliases.set(alias, key);
    }
    for (const [alias, key] of Object.entries(result.aliasToCompanyKey)) aliases.set(alias, canonical.get(key) ?? key);
    if (!state.completedEvaluationCellIds.includes(bundle.cell.cellId)) state.completedEvaluationCellIds.push(bundle.cell.cellId);
    const decision = await persistBudgetReview(state, `evaluation-${bundle.cell.cellId}`);
    if (decision.requiresUserDecision) return;
  }
  await writeJsonAtomic(path.join(rawRunRoot(), "evaluation/unified-company-index.json"), {
    schemaVersion: 1, runId: state.runId, records: [...records.values()], aliasToCompanyKey: Object.fromEntries(aliases),
  });
  await writeJsonAtomic(path.join(artifactRunRoot(), "evaluation/unified-company-records.json"), {
    schemaVersion: 1, runId: state.runId, recordCount: records.size, records: [...records.values()],
  });
  const sample = buildBlindAuditV2Sample(bundles, records, aliases);
  await writeJsonAtomic(path.join(artifactRunRoot(), "blind-audit/packets-v2.1.json"), {
    schemaVersion: 1, runId: state.runId, packetSetSha256: sha256(JSON.stringify(sample.packets)), packets: sample.packets,
  });
  await writeJsonAtomic(path.join(rawRunRoot(), "blind-audit/mapping-v2.1.json"), sample.mappings);
  state.status = "blind-audit-running";
  await saveRunState(state);
  const judgeModels = EXPERIMENT_CONFIG.blindAudit.judgeModels as [string, string];
  const executed = await executeBlindAuditV2(sample, { judgeModels,
    arbitratorModel: EXPERIMENT_CONFIG.blindAudit.arbitratorModel, concurrency: 2, cache: new FileDecisionCache(),
    onCostEvents, authorizePaidCall: async ({ packetId, stage, judgeId }) => {
      const estimate = stage === "judge" ? 0.5 : 0.35;
      if (!await requireBudget(state, `${packetId}-${judgeId}`, estimate)) {
        throw new Error("BUDGET_PAUSED");
      }
    } });
  state.completedBlindPacketIds = sample.packets.map((packet) => packet.packetId);
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), "blind-audit/calibration-v2.1.json"), {
    schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(), metrics: executed.metrics,
    mappings: sample.mappings, decisions: executed.decisions.map(({ judges, arbitrator, ...decision }) => ({ ...decision,
      judges: judges.map(({ raw, ...judge }) => { void raw; return judge; }),
      ...(arbitrator ? { arbitrator: (({ raw, ...value }) => { void raw; return value; })(arbitrator) } : {}) })),
    cacheStats: executed.cacheStats,
  });
  const metrics = calculateExperimentMetrics(metricSlotsForBundles(bundles, records, aliases), executed.metrics.passed);
  const contributions = calculateProviderContributions(bundles, state.costEvents);
  const findings = optimizationFindings(contributions);
  const generatedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(artifactRunRoot(), "final/metrics.json"), {
    schemaVersion: 1, runId: state.runId, generatedAt, metrics, blindAudit: executed.metrics,
    cost: summarizeCostEvents(state.costEvents), utilization: utilization(state.costEvents),
    runtime: { byCell: bundles.map(({ cell, control, product }) => ({ cellId: cell.cellId,
      geminiWallClockMs: control.wallClockMs, productWallClockMs: product.wallClockMs })) },
  });
  await writeJsonAtomic(path.join(artifactRunRoot(), "final/hybrid-search-optimization-analysis.json"), {
    schemaVersion: 1, runId: state.runId, generatedAt, contributions, findings,
    note: "Observed opportunities only; the frozen experiment and product route were not modified post hoc.",
  });
  await writeTextAtomic(path.join(artifactRunRoot(), "final/SEARCH_E2E_EVALUATION_REPORT.v2.0.0.md"),
    renderReport({ metrics, blind: executed.metrics, bundles, costs: state.costEvents, findings, generatedAt }));
  state.status = "completed";
  await saveRunState(state);
  console.log(JSON.stringify({ status: "completed", runId: state.runId, passed: metrics.passed,
    macroDelta: metrics.macroDelta, blindAuditPassed: executed.metrics.passed,
    cost: summarizeCostEvents(state.costEvents) }, null, 2));
}

async function verifyOnly(): Promise<void> {
  await verifyFrozenManifest(false);
  console.log(JSON.stringify({ status: "verified", cells: experimentCells().map((cell) => cell.cellId) }, null, 2));
}

const phase = process.argv.find((value) => value.startsWith("--phase="))?.slice(8) ?? "verify";
if (phase === "freeze") await freezeManifest();
else if (phase === "verify") await verifyOnly();
else if (phase === "preflight") await runPreflight();
else if (phase === "provider-check") await runRecoveryPreflight();
else if (phase === "resume-budget") await resumeBudgetAfterUserConfirmation();
else if (phase === "cell") {
  const cellId = process.argv.find((value) => value.startsWith("--cell="))?.slice(7);
  if (!cellId) throw new Error("--phase=cell requires --cell=<cellId>");
  await runCell(cellId);
} else if (phase === "evaluate") await runEvaluation();
else throw new Error(`Unknown phase ${phase}`);
