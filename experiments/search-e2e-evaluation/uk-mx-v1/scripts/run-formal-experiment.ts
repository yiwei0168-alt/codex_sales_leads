import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { planAssistantRequest } from "@/lib/assistant/intent-agent";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { configuredDiscoveryGateModel } from "@/lib/leads/workflow/discovery-gate";
import { buildHybridSearchRoute } from "@/lib/leads/workflow/hybrid-search-policy";
import { LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "@/lib/leads/workflow/rag-context";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "@/lib/leads/workflow/types";
import { createDiscoveryProvider, discoveryEnvironmentStatus } from "@/providers/discovery";
import { TavilySearchProvider } from "@/providers/tavily";

import rateCardJson from "../config/official-rate-card.v1.json";
import { buildBlindSample, calculateBlindAuditMetrics, judgeBlindPacket, type BlindDecision } from "../lib/blind-audit";
import { evaluateBudget, forecastCompletionCost, priceCostEvent, summarizeCostEvents,
  type ExperimentCostEvent, type ExperimentRateCard } from "../lib/cost-ledger";
import { runControlCell, type ControlCellResult } from "../lib/control-cell";
import { calculateExperimentMetrics } from "../lib/evaluation-metrics";
import { cellById, experimentCells, EXPERIMENT_CONFIG, intentRolesRecognizeCategory, validateExperimentConfig,
  type ExperimentCell } from "../lib/experiment";
import { calculateProviderContributions, optimizationFindings, renderFinalReport } from "../lib/final-report";
import { runProductCell, type ProductCellResult } from "../lib/product-cell";
import { sanitizeDiscoveryCalls } from "../lib/public-artifact";
import { callClaudeBlindJudge, callGeminiControl } from "../lib/provider-clients";
import { assertCodexDecisionFilesFrozen, codexDirectBlindDecision, codexPacketSha256,
  validateCodexDirectDecision, type CodexDirectDecisionArtifact } from "../lib/codex-direct-review";
import { artifactRunRoot, loadRunState, rawRunRoot, readJson, readJsonIfExists, saveRunState, writeJsonAtomic,
  writeTextAtomic,
  type FormalRunState } from "../lib/run-store";
import { buildControlUniqueGroups, buildProductRecordIndex, evaluateControlUniqueGroup, identityAliases,
  metricSlotsForBundles,
  type ControlUniqueEvaluationResult, type FrozenCellBundle } from "../lib/unified-evaluation";

nextEnv.loadEnvConfig(process.cwd());
const rateCard = rateCardJson as ExperimentRateCard;
const experimentRoot = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");
const frozenTag = "search-e2e-eval-v1.1.6-frozen";

const frozenFiles = [
  "PROTOCOL.md", "README.md", "config/experiment.v1.0.0.json", "config/gemini-control-prompt.md",
  "config/blind-judge-rubric.md", "config/official-rate-card.v1.json",
  "schemas/gemini-control-output.schema.json", "schemas/blind-judge-output.schema.json",
  "schemas/runtime-cost-event.schema.json", "lib/blind-audit.ts", "lib/cost-ledger.ts", "lib/control-cell.ts",
  "lib/codex-direct-review.ts", "lib/evaluation-metrics.ts", "lib/experiment.ts", "lib/final-report.ts", "lib/product-cell.ts",
  "lib/provider-clients.ts", "lib/public-artifact.ts", "lib/run-store.ts", "lib/runtime-schemas.ts", "lib/unified-evaluation.ts",
  "scripts/run-formal-experiment.ts",
  "../../../config/lead-search/hybrid-search-v1.0.0.json",
  "../../../config/lead-scoring/policy-v2.0.0.json",
  "../../../config/lead-workflow/end-to-end-v2.0.0.json",
  "../../../config/lead-workflow/runtime-policy-v3.0.0.json",
  "../../../config/lead-workflow/cost-quality-policy-v3.0.0.json",
  "../../../src/lib/assistant/intent-agent.ts", "../../../src/lib/assistant/types.ts",
  "../../../src/lib/leads/workflow/hybrid-discovery-executor.ts",
  "../../../src/lib/leads/workflow/hybrid-search-policy.ts",
  "../../../src/lib/leads/workflow/candidate-registry.ts",
  "../../../src/lib/leads/workflow/discovery-gate.ts",
  "../../../src/lib/leads/workflow/playbook.ts",
  "../../../src/lib/leads/workflow/rag-context.ts",
  "../../../src/lib/leads/workflow/role-correction-cache.ts",
  "../../../src/lib/leads/workflow/target-completion-policy.ts",
  "../../../src/lib/leads/workflow/discovery.ts", "../../../src/lib/leads/workflow/evidence-correction-agent.ts",
  "../../../src/lib/leads/workflow/qualification-agent.ts", "../../../src/lib/leads/workflow/schemas.ts",
  "../../../src/lib/leads/workflow/types.ts", "../../../src/lib/leads/workflow/cost-quality-policy.ts",
  "../../../src/lib/leads/workflow/evidence-packet.ts",
  "../../../src/lib/leads/candidate-value.ts", "../../../src/lib/leads/channel-membership.ts",
  "../../../src/lib/leads/cooperation-path.ts", "../../../src/lib/leads/evidence-quality.ts",
  "../../../src/lib/leads/evidence-snapshot.ts", "../../../src/lib/leads/networking-relevance.ts",
  "../../../src/lib/leads/primary-channel.ts", "../../../src/lib/leads/scoring-policy.ts",
  "../../../src/providers/contracts.ts", "../../../src/providers/discovery.ts",
  "../../../src/providers/openrouter.ts", "../../../src/providers/resilient-ai.ts",
  "../../../src/providers/tavily.ts", "../../../src/lib/rag/openai-provider.ts",
  "artifacts/runs/2026-09-02-uk-mx-search-e2e-v1-10/runtime/run-summary.json",
  "artifacts/runs/2026-09-02-uk-mx-search-e2e-v1-15/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1/preflight/preflight-report.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1/runtime/run-summary.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1/analysis/invalidation.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-1/runtime/run-summary.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-1/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-1/cells/MX-retail/product-e2e.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-1/cost/after-MX-retail.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-1/analysis/invalidation.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-2/runtime/run-summary.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-2/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-2/cells/MX-retail/product-e2e.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-2/cost/after-MX-retail.json",
  "artifacts/runs/2026-09-05-uk-mx-search-e2e-v1-1-2/analysis/supersession.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-3/preflight/preflight-report.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-3/runtime/run-summary.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-3/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-3/analysis/invalidation.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/preflight/preflight-report.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/runtime/run-summary.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/cells/MX-retail/product-e2e.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/cost/after-MX-retail.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-4/analysis/supersession.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/preflight/preflight-report.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/runtime/run-summary.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/MX-retail/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/MX-retail/product-e2e.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cost/after-MX-retail.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/GB-distribution/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/GB-distribution/product-e2e.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cost/after-GB-distribution.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/MX-si-msp/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/MX-si-msp/product-e2e.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cost/after-MX-si-msp.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/cells/GB-resale/gemini-native.json",
  "artifacts/runs/2026-09-06-uk-mx-search-e2e-v1-1-5/analysis/supersession.json",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function freezeManifest(): Promise<void> {
  validateExperimentConfig();
  const files = await Promise.all(frozenFiles.map(async (relative) => {
    const absolute = path.resolve(experimentRoot, relative);
    return { path: path.relative(process.cwd(), absolute).replace(/\\/g, "/"), sha256: sha256(await readFile(absolute)) };
  }));
  await writeJsonAtomic(path.join(experimentRoot, "config/frozen-manifest.v1.json"), {
    schemaVersion: 1, experimentId: EXPERIMENT_CONFIG.experimentId, runId: EXPERIMENT_CONFIG.runId,
    createdAt: new Date().toISOString(), requiredGitTag: frozenTag, files,
  });
  console.log(JSON.stringify({ status: "manifest-frozen", fileCount: files.length,
    manifest: "experiments/search-e2e-evaluation/uk-mx-v1/config/frozen-manifest.v1.json" }, null, 2));
}

async function verifyFrozenManifest(requireTag = true): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(experimentRoot, "config/frozen-manifest.v1.json"), "utf8")) as {
    requiredGitTag: string; files: Array<{ path: string; sha256: string }> };
  const mismatches: string[] = [];
  for (const item of manifest.files) {
    const actual = sha256(await readFile(path.resolve(item.path)));
    if (actual !== item.sha256) mismatches.push(item.path);
  }
  if (mismatches.length > 0) throw new Error(`Frozen input hash mismatch: ${mismatches.join(", ")}`);
  if (requireTag) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", manifest.requiredGitTag, "HEAD"], {
        cwd: process.cwd(), stdio: "ignore",
      });
    } catch {
      throw new Error(`Frozen tag ${manifest.requiredGitTag} must be an ancestor of HEAD before paid calls`);
    }
  }
}

function preflightEvent(input: Parameters<typeof priceCostEvent>[0]): ExperimentCostEvent {
  return priceCostEvent(input, rateCard);
}

function providerFailureDiscardReason(kind: string | undefined): string {
  if (kind === "timeout") return "timeout";
  if (kind === "http") return "providerHttpFailure";
  if (kind === "invalid-response") return "providerResponseInvalid";
  return "transportFailure";
}

function hasPreflightCheck(state: FormalRunState, name: string): boolean {
  return state.preflightChecks.some((item) => item.name === name);
}

function appendRecordedCostEvents(state: FormalRunState, events: ExperimentCostEvent[]): void {
  const knownEventIds = new Set(state.costEvents.map((item) => item.eventId));
  for (const event of events) {
    let eventId = event.eventId;
    let repeat = 1;
    while (knownEventIds.has(eventId)) eventId = `${event.eventId}:repeat-${++repeat}`;
    knownEventIds.add(eventId);
    state.costEvents.push(eventId === event.eventId ? event : { ...event, eventId,
      notes: [...(event.notes ?? []), `Repeated call; base event ${event.eventId}.`] });
  }
}

async function checkpointPreflight(state: FormalRunState, name: string, events: ExperimentCostEvent[],
  detail: Record<string, unknown>, blindJudgeModel?: string): Promise<void> {
  const unpriced = events.filter((item) => item.budgetCostUsd === null);
  if (unpriced.length > 0) {
    throw new Error(`Preflight has unpriced events: ${unpriced.map((item) => item.eventId).join(", ")}`);
  }
  appendRecordedCostEvents(state, events);
  if (!hasPreflightCheck(state, name)) {
    state.preflightChecks.push({ name, completedAt: new Date().toISOString(), detail });
  }
  if (blindJudgeModel) state.blindJudgeModel = blindJudgeModel;
  await saveRunState(state);
}

async function checkpointPreflightFailure(state: FormalRunState, name: string, events: ExperimentCostEvent[],
  detail: string): Promise<void> {
  const unpriced = events.filter((item) => item.budgetCostUsd === null);
  if (unpriced.length > 0) throw new Error(`Failed preflight call is unpriced: ${unpriced.map((item) => item.eventId).join(", ")}`);
  appendRecordedCostEvents(state, events);
  state.anomalies.push({ at: new Date().toISOString(), severity: "warning",
    code: `preflight-${name}-failed`, detail: detail.slice(0, 1_000) });
  await saveRunState(state);
}

function canadaPlan(category: "distribution" | "resale" | "retail" | "si-msp" = "distribution"): LeadSearchPlan {
  const roles = category === "distribution" ? ["Distributor", "VAD"] as const
    : category === "resale" ? ["Reseller", "VAR", "Dealer"] as const
      : category === "retail" ? ["Retailer", "E-tailer"] as const : ["SI", "MSP"] as const;
  return { countryCode: "CA", countryName: "Canada", objective: "new-market", roles: [...roles], targetCount: 2,
    queryLanguage: "en", userRequest: `Find and evaluate 2 companies in Canada whose primary role is ${roles.join("/")}. Restrict the task to this market and category.`,
    opportunityTargets: [], coverageMode: "auto", verifiedOnly: false };
}

function syntheticCandidate(): CorrectedLeadWorkflowCandidate {
  const runId = "synthetic-preflight-run";
  const evidenceId = "synthetic-preflight-evidence";
  const findings = [
    { findingId: "preflight-identity", kind: "identity" as const, statement: "Example Network Canada is an operating company.",
      status: "supported" as const, roles: ["Reseller" as const], evidenceIds: [evidenceId], sourceTypes: ["official-website" as const], confidence: 90, notes: [] },
    { findingId: "preflight-country", kind: "country-presence" as const, statement: "The company operates in Canada.",
      status: "supported" as const, roles: ["Reseller" as const], evidenceIds: [evidenceId], sourceTypes: ["official-website" as const], confidence: 90, notes: [] },
    { findingId: "preflight-networking", kind: "active-networking" as const, statement: "The company sells SMB routers, Wi-Fi and switches.",
      status: "supported" as const, roles: ["Reseller" as const], evidenceIds: [evidenceId], sourceTypes: ["official-website" as const], confidence: 90, notes: [] },
    { findingId: "preflight-role", kind: "role" as const, statement: "The company resells networking products to SMB customers.",
      status: "supported" as const, roles: ["Reseller" as const], evidenceIds: [evidenceId], sourceTypes: ["official-website" as const], confidence: 90, notes: [] },
  ];
  return { candidateId: "preflight-company-0001", evidenceSnapshotRunId: runId,
    companyName: "Example Network Canada", domain: "example.com", officialWebsiteUrl: "https://example.com/",
    queryRoles: ["Reseller"], queryFamily: "resale", providerScore: 0, evidenceWarnings: [], evidence: [{
      id: evidenceId, url: "https://example.com/", title: "Synthetic preflight evidence",
      excerpt: "Example Network Canada operates in Canada and resells SMB routers, Wi-Fi access points and switches to business customers with configuration and support.",
      sourceType: "official-website", provider: "synthetic-preflight", capturedAt: new Date().toISOString(),
      evidenceRunId: runId, freshnessStatus: "fresh", contentHash: sha256("synthetic-preflight") }],
    correction: { originalCompanyName: "Example Network Canada", originalDomain: "example.com",
      originalOfficialWebsiteUrl: "https://example.com/", resolvedRoles: ["Reseller"], resolvedFamilies: ["resale"],
      primaryRole: "Reseller", primaryFamily: "resale", primaryChannelReason: "Synthetic role evidence.",
      usedSmallLongTailChannelException: false, identityChanged: false, routingChanged: false,
      supplementalEvidenceIds: [], reliedEvidenceIds: [evidenceId], findings, reasons: ["Synthetic schema preflight"],
      confidence: 90, model: "synthetic", promptVersion: "synthetic", escalated: false, warnings: [] } };
}

function syntheticPlaybook(): LeadMarketPlaybook {
  return { marketHypothesis: "Synthetic Canada preflight only.", productAngles: ["SMB Wi-Fi, routers and switches"],
    preferredCompanyTraits: ["business customer access"], exclusions: [], rolePriorities: [{ family: "resale",
      roles: ["Reseller"], weight: 1, reason: "Synthetic" }], searchQueries: [{ family: "resale",
      roles: ["Reseller"], query: "synthetic", priority: 1 }], ragCitationIds: [],
    generatedBy: "deterministic-fallback", warnings: [] };
}

async function completePreflight(state: FormalRunState): Promise<void> {
  state.status = "preflight-passed";
  await saveRunState(state);
  const forecast = forecastCompletionCost(state.costEvents, { completedCellIds: [], totalCells: 8,
    fixedRemainingUsd: 10, initialEstimateUsd: EXPERIMENT_CONFIG.cost.initialForecastUsd.expected });
  const decision = evaluateBudget(state.costEvents, forecast, { totalBudgetUsd: 100, thresholdsUsd: [20, 40, 60, 80] });
  await writeJsonAtomic(path.join(artifactRunRoot(), "preflight/preflight-report.json"), {
    schemaVersion: 1, runId: state.runId, status: "passed", completedAt: new Date().toISOString(),
    checks: state.preflightChecks, chosenBlindJudgeModel: state.blindJudgeModel,
    cost: summarizeCostEvents(state.costEvents), budgetDecision: decision,
  });
  console.log(JSON.stringify({ status: "preflight-passed", blindJudgeModel: state.blindJudgeModel,
    cost: summarizeCostEvents(state.costEvents), budgetDecision: decision }, null, 2));
}

async function selectBlindJudgeThroughOpenRouter(state: FormalRunState): Promise<void> {
  if (hasPreflightCheck(state, "openrouter-blind-judge")) return;
  const packet = { packetId: "preflight-packet-0001", targetMarket: "Canada",
    requestedCategory: "resale", cudyBrief: "Affordable reliable networking for consumers and SMBs.",
    company: { name: "Example Network Canada", domain: "example.com" }, evidence: [{
      evidenceId: "preflight-evidence-0001", sourceType: "official-website", url: "https://example.com/",
      excerpt: "Synthetic preflight: an operating Canadian SMB networking reseller selling routers and switches with support." }] };
  const models = [EXPERIMENT_CONFIG.blindAudit.primaryModel,
    EXPERIMENT_CONFIG.blindAudit.gatewayFallbackModel];
  const events: ExperimentCostEvent[] = [];
  const failures: string[] = [];
  for (const [index, model] of models.entries()) {
    const call = await callClaudeBlindJudge(packet, model);
    const valid = Boolean(call.output);
    events.push(preflightEvent({ eventId: `preflight:openrouter-blind-judge:${index + 1}`, runId: state.runId,
      ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
      provider: "openrouter", requestedModel: call.requestedModel, actualModel: call.actualModel,
      startedAt: call.startedAt, completedAt: call.completedAt, latencyMs: call.latencyMs,
      attempts: call.attempts, retries: call.retries, fallbackUsed: index > 0,
      status: valid ? "completed" : "failed", usage: call.usage,
      accountCashCostUsd: call.accountCashCostUsd,
      volume: { inputItems: 1, rawOutputItems: call.requestError ? 0 : 1,
        validOutputItems: valid ? 1 : 0, downstreamUsedItems: valid ? 1 : 0,
        discardedReasonCounts: valid ? {} : call.requestError
          ? { [providerFailureDiscardReason(call.requestFailureKind)]: 1 } : { schemaInvalid: 1 } },
      notes: valid ? [] : [call.requestError ?? call.parseError ?? "No valid structured output"] }));
    if (valid) {
      await checkpointPreflight(state, "openrouter-blind-judge", events,
        { selectedModel: call.actualModel, fallbackUsed: index > 0, failures }, call.actualModel);
      return;
    }
    failures.push(`${model}: ${call.requestError ?? call.parseError ?? "invalid output"}`.slice(0, 1_000));
  }
  await checkpointPreflight(state, "openrouter-blind-judge", events, {
    selectedModel: EXPERIMENT_CONFIG.blindAudit.unavailableFallbackMode,
    fallbackChain: [...models, EXPERIMENT_CONFIG.blindAudit.unavailableFallbackMode], failures,
    externalSearchAllowed: false, apiCallUsedForFinalFallback: false,
    requireDecisionCommitAndPushBeforeDeblind: true,
  }, EXPERIMENT_CONFIG.blindAudit.unavailableFallbackMode);
}

async function runPreflight(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (["preflight-passed", "running", "cells-completed", "evaluation-running", "blind-audit-running", "completed"]
    .includes(state.status)) {
    console.log(JSON.stringify({ status: "preflight-already-passed", runId: state.runId }, null, 2));
    return;
  }
  const missing = ["SEARCH_E2E_USER_ID", "KIMI_API_KEY", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL",
    "DEEPSEEK_API_KEY", "TAVILY_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]
    .filter((name) => !process.env[name]?.trim());
  const discoveryStatus = discoveryEnvironmentStatus();
  missing.push(...discoveryStatus.filter((item) => !item.configured).map((item) => item.apiKeyEnv));
  if (missing.length > 0) throw new Error(`Preflight missing required environment variables: ${[...new Set(missing)].join(", ")}`);

  if (!hasPreflightCheck(state, "prior-before-v1.1.6-adjustment")) {
    const productAdjustmentBase = preflightEvent({ eventId: "preflight:prior-product-before-v1.1.6", runId: state.runId,
      ledger: "product-e2e-arm", arm: "product-e2e", stage: "prior-preflight-adjustment",
      provider: "mixed-product-preflight", startedAt: state.createdAt, completedAt: state.createdAt,
      latencyMs: 0, attempts: 0, retries: 0, fallbackUsed: false, status: "completed", usage: {},
      accountCashCostUsd: EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd,
      volume: { inputItems: 0, rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { historicalCostCarryOnly: 1 } },
      notes: ["Exact product-ledger carry-forward through v1.1.5. Historical stage volumes remain in frozen source artifacts and are not double-counted in this run."] });
    const productAdjustment = { ...productAdjustmentBase, accountCashCostUsd: undefined,
      officialListPriceUsd: EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd,
      budgetCostUsd: EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd,
      cashCostBasis: "official-conservative" as const };
    const controlAdjustmentBase = preflightEvent({ eventId: "preflight:prior-gemini-control-before-v1.1.6",
      runId: state.runId, ledger: "gemini-native-arm", arm: "gemini-native", stage: "prior-preflight-adjustment",
      provider: "historical-carry", startedAt: state.createdAt, completedAt: state.createdAt,
      latencyMs: 0, attempts: 0, retries: 0, fallbackUsed: false, status: "completed", usage: {},
      accountCashCostUsd: EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd,
      volume: { inputItems: 0, rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { historicalCostCarryOnly: 1 } },
      notes: ["Exact Gemini-ledger carry-forward. Historical attempt and output volumes remain in frozen source artifacts; MX Retail is reused without a second charge."] });
    const controlAdjustment = { ...controlAdjustmentBase, accountCashCostUsd: undefined,
      officialListPriceUsd: EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd,
      budgetCostUsd: EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd,
      cashCostBasis: "official-conservative" as const };
    const evaluationAdjustmentBase = preflightEvent({ eventId: "preflight:prior-evaluation-before-v1.1.6",
      runId: state.runId, ledger: "evaluation-overhead", arm: "shared-evaluation",
      stage: "prior-preflight-adjustment", provider: "historical-carry", startedAt: state.createdAt,
      completedAt: state.createdAt, latencyMs: 0, attempts: 0, retries: 0, fallbackUsed: false,
      status: "completed", usage: {}, accountCashCostUsd: EXPERIMENT_CONFIG.cost.priorEvaluationAdjustmentUsd,
      volume: { inputItems: 0, rawOutputItems: 0, validOutputItems: 0, downstreamUsedItems: 0,
        discardedReasonCounts: { historicalCostCarryOnly: 1 } },
      notes: ["Carries the v1.1.0 blind-judge preflight cost without duplicating historical input/output volumes or gateway attempts."] });
    const evaluationAdjustment = { ...evaluationAdjustmentBase, accountCashCostUsd: undefined,
      officialListPriceUsd: EXPERIMENT_CONFIG.cost.priorEvaluationAdjustmentUsd,
      budgetCostUsd: EXPERIMENT_CONFIG.cost.priorEvaluationAdjustmentUsd,
      cashCostBasis: "official-conservative" as const };
    await checkpointPreflight(state, "prior-before-v1.1.6-adjustment",
      [productAdjustment, controlAdjustment, evaluationAdjustment],
      { productUsd: EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd,
        geminiControlUsd: EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd,
        evaluationUsd: EXPERIMENT_CONFIG.cost.priorEvaluationAdjustmentUsd });
  }

  if (!hasPreflightCheck(state, "frozen-treatment-model-bindings")) {
    const models = EXPERIMENT_CONFIG.arms["product-e2e"].models;
    const productionGateModel = configuredDiscoveryGateModel();
    if (models.discoveryGateRoutine !== "deepseek-v4-flash"
      || models.roleCorrectionRoutine !== "deepseek-v4-flash"
      || models.qualificationRoutine !== "deepseek-v4-flash"
      || models.materialEscalation !== "deepseek-v4-pro"
      || productionGateModel !== "deepseek-v4-flash") {
      throw new Error(`Treatment model binding preflight failed: ${JSON.stringify({ models, productionGateModel })}`);
    }
    await checkpointPreflight(state, "frozen-treatment-model-bindings", [], {
      ...models, productionGateModel, globalRoutineModelIgnoredByDiscoveryGate: true,
    });
  }

  if (EXPERIMENT_CONFIG.preflightReuse.requiredChecks.length > 0) {
    const reuse = EXPERIMENT_CONFIG.preflightReuse;
    const source = await readJson<{ experimentId: string; runId: string;
      preflightChecks: Array<{ name: string }>; costEvents: ExperimentCostEvent[] }>(path.resolve(reuse.sourceSummaryPath));
    if (source.experimentId !== reuse.sourceExperimentId || source.runId !== reuse.sourceRunId) {
      throw new Error("Inherited preflight source identity mismatch");
    }
    const sourceChecks = new Set(source.preflightChecks.map((item) => item.name));
    const missingChecks = reuse.requiredChecks.filter((name) => !sourceChecks.has(name));
    if (missingChecks.length > 0) throw new Error(`Inherited preflight is missing checks: ${missingChecks.join(", ")}`);
    const sourceProductUsd = source.costEvents.filter((event) => event.ledger === "product-e2e-arm")
      .reduce((sum, event) => sum + (event.budgetCostUsd ?? 0), 0);
    const sourceControlUsd = source.costEvents.filter((event) => event.ledger === "gemini-native-arm")
      .reduce((sum, event) => sum + (event.budgetCostUsd ?? 0), 0);
    if (Math.abs(sourceProductUsd - reuse.sourceProductBudgetUsd) > 0.000001
      || Math.abs(sourceControlUsd - reuse.sourceGeminiControlBudgetUsd) > 0.000001) {
      throw new Error("Inherited preflight source cost does not match its frozen source ledger totals");
    }
    if (EXPERIMENT_CONFIG.cost.priorProductPreflightAdjustmentUsd + 0.000001 < sourceProductUsd
      || EXPERIMENT_CONFIG.cost.priorGeminiControlAdjustmentUsd + 0.000001 < sourceControlUsd) {
      throw new Error("Cumulative carry-forward cost cannot be lower than the inherited preflight source cost");
    }
    await checkpointPreflight(state, "inherited-non-judge-preflight", [], {
      sourceExperimentId: source.experimentId, sourceRunId: source.runId,
      checks: reuse.requiredChecks, productUsd: sourceProductUsd, geminiControlUsd: sourceControlUsd,
    });
    const blindReuse = EXPERIMENT_CONFIG.blindAudit.preflightReuse;
    if (blindReuse.sourceRunId) {
      const blindSource = await readJson<{ runId: string; chosenBlindJudgeModel: string;
        cost: { byLedger: Record<string, number> } }>(path.resolve(blindReuse.sourceReportPath));
      if (blindSource.runId !== blindReuse.sourceRunId
        || blindSource.chosenBlindJudgeModel !== blindReuse.selectedModel
        || Math.abs((blindSource.cost.byLedger["evaluation-overhead"] ?? 0)
          - blindReuse.sourceEvaluationBudgetUsd) > 0.000001) {
        throw new Error("Inherited blind-judge preflight identity, selected model or cost mismatch");
      }
      await checkpointPreflight(state, "inherited-blind-judge-preflight", [], {
        sourceExperimentId: blindReuse.sourceExperimentId,
        sourceRunId: blindReuse.sourceRunId,
        selectedModel: blindReuse.selectedModel,
        evaluationUsd: blindReuse.sourceEvaluationBudgetUsd,
        gatewayCallsRepeated: 0,
      }, blindReuse.selectedModel);
    } else {
      await selectBlindJudgeThroughOpenRouter(state);
    }
    await completePreflight(state);
    return;
  }
  const plan = canadaPlan("distribution");
  if (!hasPreflightCheck(state, "kimi-intent")) {
    const intentStarted = new Date().toISOString();
    const intent = await planAssistantRequest(plan.userRequest);
    const intentCompleted = new Date().toISOString();
    const intentEvents = (intent.plannerCalls ?? []).map((call, index) => preflightEvent({
      eventId: `preflight:intent:${index + 1}`, runId: state.runId,
      ledger: "product-e2e-arm", arm: "product-e2e", stage: "preflight-intent", provider: "kimi",
      requestedModel: call.requestedModel, actualModel: call.actualModel, startedAt: intentStarted,
      completedAt: intentCompleted, latencyMs: call.latencyMs, attempts: call.attempts, retries: call.retries,
      fallbackUsed: false, status: call.succeeded === false ? "failed" : "completed",
      usage: { inputTokens: call.inputTokens, cachedInputTokens: call.cachedInputTokens,
        outputTokens: call.outputTokens },
      ...(call.usageAvailable === false ? { accountCashCostUsd: EXPERIMENT_CONFIG.cost.unknownUsageCallReserveUsd } : {}),
      volume: { inputItems: 1, rawOutputItems: call.outputTokens > 0 || call.usageAvailable ? 1 : 0,
        validOutputItems: call.succeeded === false ? 0 : 1,
        downstreamUsedItems: call.succeeded === false ? 0 : 1,
        discardedReasonCounts: call.succeeded === false ? { providerFailure: 1 } : {} },
      notes: [...(call.failureReason ? [call.failureReason] : []),
        ...(call.usageAvailable === false ? ["Provider usage unavailable; conservative reserve applied."] : [])] }));
    if (!intent.leadPlan || intent.plannerSource === "deterministic-fallback") {
      const detail = intent.warnings.join(" | ") || "Kimi intent preflight failed";
      await checkpointPreflightFailure(state, "kimi-intent", intentEvents, detail);
      throw new Error(detail);
    }
    if (intent.leadPlan.countryCode !== plan.countryCode || intent.leadPlan.targetCount !== plan.targetCount
      || intent.leadPlan.objective !== plan.objective
      || !intentRolesRecognizeCategory(intent.leadPlan.roles, plan.roles)) {
      const detail = `Kimi intent preflight diverged: returned country=${intent.leadPlan.countryCode}, count=${intent.leadPlan.targetCount}, objective=${intent.leadPlan.objective}, roles=${intent.leadPlan.roles.join("|")}`;
      await checkpointPreflightFailure(state, "kimi-intent-semantics", intentEvents, detail);
      throw new Error(detail);
    }
    await checkpointPreflight(state, "kimi-intent", intentEvents,
      { model: intent.plannerModel, source: intent.plannerSource, semanticsMatch: true,
        returnedRoles: intent.leadPlan.roles, frozenExecutionRoles: plan.roles });
  }

  if (!hasPreflightCheck(state, "local-rag")) {
    const embeddingUsage: Array<{ model: string; inputItems: number; inputTokens: number; latencyMs: number }> = [];
    const ragStarted = new Date().toISOString();
    const rag = await retrieveLeadRagContext(process.env.SEARCH_E2E_USER_ID!.trim(), plan, {
      onEmbeddingUsage: (usage) => { embeddingUsage.push(...usage); },
    });
    const ragCompleted = new Date().toISOString();
    if (!rag.some((item) => item.collection === "product") || !rag.some((item) => item.collection === "company")
      || !rag.some((item) => item.collection === "industry")) throw new Error("RAG preflight lacks required collections");
    const ragEvents = embeddingUsage.map((usage, index) => preflightEvent({
      eventId: `preflight:rag:${index + 1}`, runId: state.runId, ledger: "product-e2e-arm", arm: "product-e2e",
      stage: "preflight-rag", provider: "alibaba-model-studio", requestedModel: "text-embedding-v4",
      actualModel: usage.model, startedAt: ragStarted, completedAt: ragCompleted, latencyMs: usage.latencyMs,
      attempts: 1, retries: 0, fallbackUsed: false, status: "completed", usage: { inputTokens: usage.inputTokens,
        outputTokens: 0 }, volume: { inputItems: usage.inputItems, rawOutputItems: usage.inputItems,
        validOutputItems: usage.inputItems, downstreamUsedItems: usage.inputItems, discardedReasonCounts: {} } }));
    await checkpointPreflight(state, "local-rag", ragEvents, { citationCount: rag.length });
  }

  const routeSteps = new Map<string, ReturnType<typeof buildHybridSearchRoute>[number]>();
  for (const category of ["distribution", "resale", "retail", "si-msp"] as const) {
    for (const step of buildHybridSearchRoute(canadaPlan(category))) {
      const key = `${step.provider}/${step.engine}`;
      if (!routeSteps.has(key)) routeSteps.set(key, step);
    }
  }
  for (const [key, step] of routeSteps) {
    const checkName = `discovery-${key}`;
    if (hasPreflightCheck(state, checkName)) continue;
    const startedAt = new Date().toISOString();
    const result = await createDiscoveryProvider(step.provider).search({ query: "networking equipment company Canada official website",
      countryCode: "CA", countryName: "Canada", languageCode: "en", maxResults: 2, category: step.category,
      track: "preflight", engine: step.engine, mechanism: step.mechanism }, AbortSignal.timeout(150_000));
    const completedAt = new Date().toISOString();
    const model = step.provider.startsWith("gemini") ? process.env.GEMINI_DISCOVERY_MODEL?.trim()
      || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash" : undefined;
    const discoveryEvent = preflightEvent({ eventId: `preflight:discovery:${key}`, runId: state.runId,
      ledger: "product-e2e-arm", arm: "product-e2e", stage: "preflight-discovery", provider: step.provider,
      requestedModel: model, actualModel: model, startedAt, completedAt, latencyMs: result.latencyMs,
      attempts: result.requestCount, retries: result.retryCount, fallbackUsed: false, status: "completed",
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
        groundingQueries: result.usage.groundingQueries, searchRequests: result.requestCount,
        searchResults: result.items.length, extractedPages: step.provider === "exa" ? result.items.length : 0,
        paidSearchCredits: result.usage.paidSearchCredits }, volume: { inputItems: 1, rawOutputItems: result.items.length,
        validOutputItems: result.items.length, downstreamUsedItems: result.items.length, discardedReasonCounts: {} } });
    await checkpointPreflight(state, checkName, [discoveryEvent],
      { results: result.items.length, retries: result.retryCount });
  }

  if (!hasPreflightCheck(state, "tavily-evidence")) {
    const tavilyStarted = new Date().toISOString();
    const tavily = await new TavilySearchProvider({ maxAttempts: 2 }).search({ query: "Cudy official networking website",
      searchDepth: "basic", maxResults: 2, includeRawContent: false }, AbortSignal.timeout(45_000));
    const tavilyCompleted = new Date().toISOString();
    const tavilyEvent = preflightEvent({ eventId: "preflight:tavily", runId: state.runId, ledger: "product-e2e-arm",
      arm: "product-e2e", stage: "preflight-evidence", provider: "tavily", startedAt: tavilyStarted,
      completedAt: tavilyCompleted, latencyMs: tavily.latencyMs ?? 0, attempts: tavily.attempts ?? 1,
      retries: tavily.retries ?? 0, fallbackUsed: false, status: "completed", usage: { paidSearchCredits: tavily.creditsUsed },
      volume: { inputItems: 1, rawOutputItems: tavily.results.length, validOutputItems: tavily.results.length,
        downstreamUsedItems: tavily.results.length, discardedReasonCounts: {} } });
    await checkpointPreflight(state, "tavily-evidence", [tavilyEvent], { results: tavily.results.length });
  }

  if (!hasPreflightCheck(state, "deepseek-score-only")) {
    const scoringStarted = new Date().toISOString();
    const scored = await new LeadQualificationAgent(undefined, { routineModel: "deepseek-v4-flash",
      escalationModel: "deepseek-v4-flash", includeCooperationPaths: false, concurrency: 1 })
      .evaluateWithUsage([syntheticCandidate()], syntheticPlaybook(), "CA", "Canada", "new-market");
    const scoringCompleted = new Date().toISOString();
    if (scored.assessments.length !== 1 || scored.assessments[0].cooperationPaths.length !== 0) {
      throw new Error("DeepSeek score-only schema preflight failed");
    }
    const scoringEvents = scored.usage.map((usage, index) => preflightEvent({
      eventId: `preflight:score:${index + 1}`, runId: state.runId, ledger: "product-e2e-arm", arm: "product-e2e",
      stage: "preflight-score-only", provider: usage.providerId ?? "deepseek", requestedModel: usage.requestedModel,
      actualModel: usage.actualModel, startedAt: scoringStarted, completedAt: scoringCompleted, latencyMs: usage.latencyMs,
      attempts: usage.attempts ?? 1, retries: usage.retries ?? 0, fallbackUsed: usage.fallbackUsed,
      status: "completed", usage: { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens,
        reasoningTokens: usage.reasoningTokens }, volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 1,
        downstreamUsedItems: 1, discardedReasonCounts: {} } }));
    await checkpointPreflight(state, "deepseek-score-only", scoringEvents,
      { model: scored.assessments[0].model, cooperationPathsGenerated: 0 });
  }

  const canadaCell = { ...experimentCells()[0], cellId: "CA-preflight", countryCode: "CA", countryName: "Canada",
    primaryLanguage: "en", supplementaryLanguages: [] } as unknown as ExperimentCell;
  const controlPrompt = ["Preflight only; this is not an experiment market.", "Market: Canada (CA).",
    "Find exactly 2 real Distributor/VAD companies with official websites using Google Search.",
    "Return the same strict JSON structure required by the formal control, with category=distribution and ranks 1-2.",
    "Do not score, generate paths, contacts, strategy or email."].join("\n");
  if (!hasPreflightCheck(state, "gemini-3.6-flash-structured-search")) {
    const gemini = await callGeminiControl(canadaCell, { prompt: controlPrompt, maxOutputTokens: 4_096 });
    const validCandidates = gemini.output?.candidates.length ?? 0;
    const geminiEvent = preflightEvent({ eventId: "preflight:gemini-control", runId: state.runId,
      ledger: "gemini-native-arm", arm: "gemini-native", stage: "preflight-control", provider: "gemini-full",
      requestedModel: gemini.requestedModel, actualModel: gemini.actualModel, startedAt: gemini.startedAt,
      completedAt: gemini.completedAt, latencyMs: gemini.latencyMs, attempts: gemini.attempts, retries: gemini.retries,
      fallbackUsed: gemini.actualModel !== gemini.requestedModel,
      status: gemini.output ? "completed" : "failed", usage: gemini.usage,
      volume: { inputItems: 1, rawOutputItems: gemini.requestError ? 0 : gemini.output ? validCandidates : 1,
        validOutputItems: validCandidates, downstreamUsedItems: validCandidates,
        discardedReasonCounts: gemini.output ? {} : gemini.requestError
          ? { [providerFailureDiscardReason(gemini.requestFailureKind)]: 1 } : { schemaInvalid: 1 } } });
    if (!gemini.output || gemini.output.candidates.length < 1 || (gemini.usage.groundingQueries ?? 0) < 1) {
      const detail = `Gemini control preflight failed: ${gemini.requestError ?? gemini.parseError ?? "no candidates or search query"}`;
      await checkpointPreflightFailure(state, "gemini-3.6-flash-structured-search", [geminiEvent], detail);
      throw new Error(detail);
    }
    await checkpointPreflight(state, "gemini-3.6-flash-structured-search", [geminiEvent],
      { candidates: gemini.output.candidates.length, searchQueries: gemini.usage.groundingQueries });
  }

  const blindPacket = { packetId: "preflight-packet-0001", targetMarket: "Canada",
    requestedCategory: "resale", cudyBrief: "Affordable reliable networking for consumers and SMBs.",
    company: { name: "Example Network Canada", domain: "example.com" }, evidence: [{
      evidenceId: "preflight-evidence-0001", sourceType: "official-website", url: "https://example.com/",
      excerpt: "Synthetic preflight: an operating Canadian SMB networking reseller selling routers and switches with support." }] };
  if (!hasPreflightCheck(state, "claude-blind-judge")) {
    let blindModel = hasPreflightCheck(state, "claude-blind-primary-invalid")
      ? EXPERIMENT_CONFIG.blindAudit.preflightOnlyFallbackModel : EXPERIMENT_CONFIG.blindAudit.primaryModel;
    let blind = await callClaudeBlindJudge(blindPacket, blindModel);
    if (blind.requestError) {
      const failedEvent = preflightEvent({ eventId: "preflight:blind-judge-request-failed", runId: state.runId,
        ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
        provider: "openrouter", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
        startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
        attempts: blind.attempts, retries: blind.retries,
        fallbackUsed: blindModel !== EXPERIMENT_CONFIG.blindAudit.primaryModel,
        status: "failed", usage: blind.usage, accountCashCostUsd: blind.accountCashCostUsd,
        volume: { inputItems: 1, rawOutputItems: 0,
          validOutputItems: 0, downstreamUsedItems: 0,
          discardedReasonCounts: { [providerFailureDiscardReason(blind.requestFailureKind)]: 1 } },
        notes: [`Request failed before a valid provider response: ${blind.requestFailureKind ?? "unknown"}.`] });
      const detail = `Claude blind-judge ${blind.requestFailureKind ?? "request"} failure after ${blind.attempts} attempt(s): ${blind.requestError}`;
      await checkpointPreflightFailure(state, "claude-blind-judge-request", [failedEvent], detail);
      throw new Error(detail);
    }
    if (!blind.output && blindModel === EXPERIMENT_CONFIG.blindAudit.primaryModel) {
      const invalidEvent = preflightEvent({ eventId: "preflight:blind-primary-invalid", runId: state.runId,
        ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
        provider: "openrouter", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
        startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
        attempts: blind.attempts, retries: blind.retries, fallbackUsed: false, status: "failed", usage: blind.usage,
        accountCashCostUsd: blind.accountCashCostUsd,
        volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 0, downstreamUsedItems: 0,
          discardedReasonCounts: { schemaInvalid: 1 } } });
      await checkpointPreflight(state, "claude-blind-primary-invalid", [invalidEvent],
        { model: blind.actualModel, parseError: blind.parseError ?? "unknown" });
      blindModel = EXPERIMENT_CONFIG.blindAudit.preflightOnlyFallbackModel;
      blind = await callClaudeBlindJudge(blindPacket, blindModel);
      if (blind.requestError) {
        const failedEvent = preflightEvent({ eventId: "preflight:blind-fallback-request-failed", runId: state.runId,
          ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
          provider: "openrouter", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
          startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
          attempts: blind.attempts, retries: blind.retries, fallbackUsed: true,
          status: "failed", usage: blind.usage, accountCashCostUsd: blind.accountCashCostUsd,
          volume: { inputItems: 1, rawOutputItems: 0,
            validOutputItems: 0, downstreamUsedItems: 0,
            discardedReasonCounts: { [providerFailureDiscardReason(blind.requestFailureKind)]: 1 } },
          notes: [`Fallback request failed before a valid provider response: ${blind.requestFailureKind ?? "unknown"}.`] });
        const detail = `Claude blind-judge fallback ${blind.requestFailureKind ?? "request"} failure after ${blind.attempts} attempt(s): ${blind.requestError}`;
        await checkpointPreflightFailure(state, "claude-blind-fallback-request", [failedEvent], detail);
        throw new Error(detail);
      }
    }
    if (!blind.output) throw new Error(`Claude blind-judge preflight failed: ${blind.parseError}`);
    const blindEvent = preflightEvent({ eventId: "preflight:blind-judge", runId: state.runId,
      ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
      provider: "openrouter", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
      startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
      attempts: blind.attempts, retries: blind.retries,
      fallbackUsed: blindModel !== EXPERIMENT_CONFIG.blindAudit.primaryModel,
      status: "completed", usage: blind.usage, accountCashCostUsd: blind.accountCashCostUsd,
      volume: { inputItems: 1, rawOutputItems: 1,
        validOutputItems: 1, downstreamUsedItems: 1, discardedReasonCounts: {} } });
    await checkpointPreflight(state, "claude-blind-judge", [blindEvent],
      { model: blind.actualModel }, blindModel);
  }

  await completePreflight(state);
}

function publicProductResult(result: Awaited<ReturnType<typeof runProductCell>>) {
  const { raw, discoveryCalls, ...rest } = result;
  void raw;
  return { ...rest, discoveryCalls: sanitizeDiscoveryCalls(discoveryCalls) };
}

function publicControlResult(result: Awaited<ReturnType<typeof runControlCell>>) {
  const { raw, ...rest } = result;
  void raw;
  return rest;
}

async function budgetDecision(state: FormalRunState, nextRequiredCallEstimateUsd = 0) {
  const forecast = forecastCompletionCost(state.costEvents, { completedCellIds: state.completedCellIds,
    totalCells: 8, fixedRemainingUsd: 10, initialEstimateUsd: EXPERIMENT_CONFIG.cost.initialForecastUsd.expected });
  return evaluateBudget(state.costEvents, forecast, { totalBudgetUsd: EXPERIMENT_CONFIG.cost.hardBudgetUsd,
    thresholdsUsd: [...EXPERIMENT_CONFIG.cost.reviewThresholdUsd],
    previouslyReportedThresholdsUsd: state.reportedBudgetThresholdsUsd, nextRequiredCallEstimateUsd });
}

async function persistBudgetReview(state: FormalRunState, label: string) {
  const decision = await budgetDecision(state);
  if (decision.newlyCrossedThresholdsUsd.length > 0) {
    state.reportedBudgetThresholdsUsd.push(...decision.newlyCrossedThresholdsUsd);
    await writeJsonAtomic(path.join(artifactRunRoot(),
      `cost/checkpoint-${decision.newlyCrossedThresholdsUsd.join("-")}-${label}.json`), {
      schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(), label,
      completedCellIds: state.completedCellIds, completedEvaluationCellIds: state.completedEvaluationCellIds,
      completedBlindPacketIds: state.completedBlindPacketIds,
      cost: summarizeCostEvents(state.costEvents), budgetDecision: decision,
    });
  }
  if (decision.requiresUserDecision) {
    state.status = "budget-paused";
    state.anomalies.push({ at: new Date().toISOString(), severity: "warning",
      code: "budget-forecast-warning", detail: `${label}: ${decision.reasons.join(", ")}` });
  }
  await saveRunState(state);
  return decision;
}

async function requireEvaluationBudget(state: FormalRunState, label: string, estimateUsd: number): Promise<boolean> {
  const decision = await budgetDecision(state, estimateUsd);
  if (!decision.requiresUserDecision) return true;
  state.status = "budget-paused";
  state.anomalies.push({ at: new Date().toISOString(), severity: "warning",
    code: "budget-forecast-warning", detail: `${label}: ${decision.reasons.join(", ")}` });
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `cost/budget-warning-before-${label}.json`), decision);
  console.log(JSON.stringify({ status: "budget-paused", label, budgetDecision: decision }, null, 2));
  process.exitCode = 2;
  return false;
}

async function runCell(cellId: string): Promise<void> {
  await verifyFrozenManifest(true);
  const cell = cellById(cellId);
  const state = await loadRunState();
  if (!state.blindJudgeModel || !["preflight-passed", "running"].includes(state.status)) {
    throw new Error("Formal cells require a passed frozen preflight");
  }
  if (state.completedCellIds.includes(cell.cellId)) {
    console.log(JSON.stringify({ status: "cell-already-complete", cellId: cell.cellId }, null, 2));
    return;
  }
  const preDecision = await budgetDecision(state, EXPERIMENT_CONFIG.cost.initialForecastUsd.expected / 8);
  if (preDecision.requiresUserDecision) {
    state.status = "budget-paused";
    state.anomalies.push({ at: new Date().toISOString(), cellId: cell.cellId, severity: "warning",
      code: "budget-forecast-warning", detail: preDecision.reasons.join(", ") });
    await saveRunState(state);
    await writeJsonAtomic(path.join(artifactRunRoot(), `cost/budget-warning-before-${cell.cellId}.json`), preDecision);
    console.log(JSON.stringify({ status: "budget-paused", cellId: cell.cellId, budgetDecision: preDecision }, null, 2));
    process.exitCode = 2;
    return;
  }

  state.status = "running";
  await saveRunState(state);
  let stateWriteQueue = Promise.resolve();
  const enqueueStateWrite = (mutate: () => void): Promise<void> => {
    stateWriteQueue = stateWriteQueue.then(async () => { mutate(); await saveRunState(state); });
    return stateWriteQueue;
  };
  const onCostEvents = (events: ExperimentCostEvent[]): Promise<void> => enqueueStateWrite(() => {
    appendRecordedCostEvents(state, events);
  });
  const executeArm = async (arm: "gemini-native" | "product-e2e") => {
    const armKey = `${cell.cellId}:${arm}`;
    const rawPath = path.join(rawRunRoot(), `cells/${cell.cellId}/${arm}.json`);
    if (state.completedArmKeys.includes(armKey)) {
      return arm === "gemini-native"
        ? readJson<Awaited<ReturnType<typeof runControlCell>>>(rawPath)
        : readJson<Awaited<ReturnType<typeof runProductCell>>>(rawPath);
    }
    const reuse = EXPERIMENT_CONFIG.reusedFrozenArms.find((item) =>
      item.cellId === cell.cellId && item.arm === arm);
    if (reuse) {
      if (arm === "gemini-native") {
        const source = await readJson<Omit<ControlCellResult, "raw">>(path.resolve(reuse.sourceArtifactPath));
        if (source.cellId !== cell.cellId || source.arm !== arm
          || source.requestedModel !== EXPERIMENT_CONFIG.arms["gemini-native"].model
          || source.finalCandidates.length !== EXPERIMENT_CONFIG.sample.slotsPerArmPerCell) {
          throw new Error(`Frozen-arm reuse validation failed for ${armKey}`);
        }
        const reused: ControlCellResult = { ...source, runId: state.runId, costEvents: [],
          warnings: [...source.warnings, `Reused unchanged frozen control from ${reuse.sourceRunId}.`],
          raw: { reusedFromRunId: reuse.sourceRunId, sourceArtifactPath: reuse.sourceArtifactPath } };
        await writeJsonAtomic(rawPath, reused);
        await writeJsonAtomic(path.join(artifactRunRoot(), `cells/${cell.cellId}/${arm}.json`),
          publicControlResult(reused));
        await enqueueStateWrite(() => { state.completedArmKeys.push(armKey); });
        return reused;
      }
      const source = await readJson<Omit<ProductCellResult, "raw">>(path.resolve(reuse.sourceArtifactPath));
      if (source.cellId !== cell.cellId || source.arm !== arm
        || source.finalCandidates.length + source.missingSlots !== EXPERIMENT_CONFIG.sample.slotsPerArmPerCell
        || JSON.stringify(source.treatmentModels) !== JSON.stringify(EXPERIMENT_CONFIG.arms["product-e2e"].models)) {
        throw new Error(`Frozen-arm reuse validation failed for ${armKey}`);
      }
      const reused: ProductCellResult = { ...source, runId: state.runId, costEvents: [],
        warnings: [...source.warnings, `Reused unchanged frozen product quality result from ${reuse.sourceRunId}; its cost is carried once in the historical adjustment.`],
        raw: { ragContext: { reusedFromRunId: reuse.sourceRunId }, discovered: { sourceArtifactPath: reuse.sourceArtifactPath },
          enriched: null, corrected: null, assessments: null } };
      await writeJsonAtomic(rawPath, reused);
      await writeJsonAtomic(path.join(artifactRunRoot(), `cells/${cell.cellId}/${arm}.json`),
        publicProductResult(reused));
      await enqueueStateWrite(() => { state.completedArmKeys.push(armKey); });
      return reused;
    }
    const result = arm === "gemini-native"
      ? await runControlCell(cell, { onCostEvents }) : await runProductCell(cell, { onCostEvents });
    await writeJsonAtomic(rawPath, result);
    await writeJsonAtomic(path.join(artifactRunRoot(), `cells/${cell.cellId}/${arm}.json`),
      arm === "gemini-native" ? publicControlResult(result as Awaited<ReturnType<typeof runControlCell>>)
        : publicProductResult(result as Awaited<ReturnType<typeof runProductCell>>));
    await enqueueStateWrite(() => {
      if (!state.completedArmKeys.includes(armKey)) state.completedArmKeys.push(armKey);
    });
    return result;
  };
  const runners = { "gemini-native": () => executeArm("gemini-native"),
    "product-e2e": () => executeArm("product-e2e") };
  const firstArm = cell.armStartOrder[0];
  const secondArm = cell.armStartOrder[1];
  const firstPromise = runners[firstArm]();
  await Promise.resolve();
  const secondPromise = runners[secondArm]();
  const settled = await Promise.allSettled([firstPromise, secondPromise]);
  await stateWriteQueue;
  const failures = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected");
  if (failures.length > 0) {
    await enqueueStateWrite(() => {
      state.anomalies.push(...failures.map((item) => ({ at: new Date().toISOString(), cellId: cell.cellId,
        severity: "fatal" as const, code: "cell-arm-failed",
        detail: item.reason instanceof Error ? item.reason.message : String(item.reason) })));
    });
    throw new Error(`${cell.cellId} arm failure: ${failures.map((item) => item.reason instanceof Error
      ? item.reason.message : String(item.reason)).join(" | ")}`);
  }
  const [first, second] = settled.map((item) => (item as PromiseFulfilledResult<Awaited<ReturnType<typeof executeArm>>>).value);
  const control = (first.arm === "gemini-native" ? first : second) as Awaited<ReturnType<typeof runControlCell>>;
  const product = (first.arm === "product-e2e" ? first : second) as Awaited<ReturnType<typeof runProductCell>>;

  if (product.missingSlots > 0) {
    state.anomalies.push({ at: new Date().toISOString(), cellId: cell.cellId, severity: "warning",
      code: "product-target-underfill",
      detail: `Product returned ${product.finalCandidates.length}/30 after ${product.discoveryRounds.length} round(s); completion=${product.completionReason}.` });
  }

  state.completedCellIds.push(cell.cellId);
  const decision = await budgetDecision(state);
  if (decision.newlyCrossedThresholdsUsd.length > 0) {
    state.reportedBudgetThresholdsUsd.push(...decision.newlyCrossedThresholdsUsd);
    await writeJsonAtomic(path.join(artifactRunRoot(),
      `cost/checkpoint-${decision.newlyCrossedThresholdsUsd.join("-")}.json`), {
      schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(), completedCellIds: state.completedCellIds,
      cost: summarizeCostEvents(state.costEvents), budgetDecision: decision,
      unitCosts: { perRequestedSlotUsd: decision.spentUsd / (state.completedCellIds.length * 60),
        perFinalCandidateUsd: decision.spentUsd / Math.max(1, control.finalCandidates.length + product.finalCandidates.length) },
    });
  }
  if (decision.requiresUserDecision) {
    state.status = "budget-paused";
    state.anomalies.push({ at: new Date().toISOString(), cellId: cell.cellId, severity: "warning",
      code: "budget-forecast-warning", detail: decision.reasons.join(", ") });
  } else if (state.completedCellIds.length === 8) state.status = "cells-completed";
  await saveRunState(state);
  await writeJsonAtomic(path.join(artifactRunRoot(), `cost/after-${cell.cellId}.json`), {
    schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(),
    cost: summarizeCostEvents(state.costEvents), budgetDecision: decision,
  });
  console.log(JSON.stringify({ status: state.status, cellId: cell.cellId, armOrder: cell.armStartOrder,
    geminiCandidates: control.finalCandidates.length, productCandidates: product.finalCandidates.length,
    cost: summarizeCostEvents([...control.costEvents, ...product.costEvents]), budgetDecision: decision }, null, 2));
  if (state.status === "budget-paused") process.exitCode = 2;
}

async function loadFrozenCellBundles(): Promise<FrozenCellBundle[]> {
  return Promise.all(experimentCells().map(async (cell) => ({ cell,
    control: await readJson<ControlCellResult>(path.join(rawRunRoot(), `cells/${cell.cellId}/gemini-native.json`)),
    product: await readJson<ProductCellResult>(path.join(rawRunRoot(), `cells/${cell.cellId}/product-e2e.json`)),
  })));
}

function publicControlEvaluation(result: ControlUniqueEvaluationResult) {
  return Object.fromEntries(Object.entries(result).filter(([key]) => key !== "raw"));
}

function publicBlindDecision(decision: BlindDecision) {
  return Object.fromEntries(Object.entries(decision).filter(([key]) => key !== "raw"));
}

async function runEvaluation(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (state.status === "completed") {
    console.log(JSON.stringify({ status: "evaluation-already-completed", runId: state.runId }, null, 2));
    return;
  }
  if (state.completedCellIds.length !== 8 || !state.blindJudgeModel
    || !["cells-completed", "evaluation-running", "blind-audit-running"].includes(state.status)) {
    throw new Error("Evaluation requires all eight frozen cells and a preflight-selected blind-judge model");
  }
  const bundles = await loadFrozenCellBundles();
  const productIndex = buildProductRecordIndex(bundles);
  const records = new Map(productIndex.records);
  const controlPlan = buildControlUniqueGroups(bundles, productIndex.aliasToCompanyKey);
  const aliasToCompanyKey = new Map(controlPlan.originalAliasToKnownKey);
  state.status = "evaluation-running";
  await saveRunState(state);
  const onCostEvents = async (events: ExperimentCostEvent[]) => {
    appendRecordedCostEvents(state, events);
    await saveRunState(state);
  };

  for (const bundle of bundles) {
    const filename = path.join(rawRunRoot(), `evaluation/control-unique-${bundle.cell.cellId}.json`);
    let result = await readJsonIfExists<ControlUniqueEvaluationResult>(filename);
    if (!result) {
      if (!await requireEvaluationBudget(state, `control-evaluation-${bundle.cell.cellId}`, 1)) return;
      result = await evaluateControlUniqueGroup(bundle.cell, controlPlan.groups.get(bundle.cell.cellId) ?? [],
        bundle.product.playbook, { onCostEvents });
      await writeJsonAtomic(filename, result);
      await writeJsonAtomic(path.join(artifactRunRoot(), `evaluation/control-unique-${bundle.cell.cellId}.json`),
        publicControlEvaluation(result));
    }
    const canonicalEvaluatedKeys = new Map<string, string>();
    for (const record of result.records) {
      const existingKey = identityAliases(record.countryCode, record.companyName, record.officialWebsiteUrl)
        .map((alias) => aliasToCompanyKey.get(alias)).find((key) => key && records.has(key));
      const canonicalKey = existingKey ?? record.companyKey;
      canonicalEvaluatedKeys.set(record.companyKey, canonicalKey);
      if (!records.has(canonicalKey)) records.set(canonicalKey,
        canonicalKey === record.companyKey ? record : { ...record, companyKey: canonicalKey });
      for (const alias of identityAliases(record.countryCode, record.companyName, record.officialWebsiteUrl)) {
        aliasToCompanyKey.set(alias, canonicalKey);
      }
    }
    for (const [alias, key] of Object.entries(result.aliasToCompanyKey)) {
      aliasToCompanyKey.set(alias, canonicalEvaluatedKeys.get(key) ?? key);
    }
    if (!state.completedEvaluationCellIds.includes(bundle.cell.cellId)) {
      state.completedEvaluationCellIds.push(bundle.cell.cellId);
      await saveRunState(state);
    }
    const decision = await persistBudgetReview(state, `evaluation-${bundle.cell.cellId}`);
    if (decision.requiresUserDecision) return;
  }
  await writeJsonAtomic(path.join(rawRunRoot(), "evaluation/unified-company-index.json"), {
    schemaVersion: 1, runId: state.runId, records: [...records.values()],
    aliasToCompanyKey: Object.fromEntries(aliasToCompanyKey), duplicateProductAliases: productIndex.duplicateAliases,
  });
  await writeJsonAtomic(path.join(artifactRunRoot(), "evaluation/unified-company-records.json"), {
    schemaVersion: 1, runId: state.runId, records: [...records.values()],
    recordCount: records.size, duplicateProductAliasCount: productIndex.duplicateAliases.length,
  });

  const judgeSample = async (targetSize: 32 | 64) => {
    const sample = buildBlindSample(bundles, records, aliasToCompanyKey, targetSize);
    await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/packets-${targetSize}.json`), {
      schemaVersion: 1, runId: state.runId, targetSize,
      packetSetSha256: sha256(JSON.stringify(sample.packets)), packets: sample.packets,
    });
    await writeJsonAtomic(path.join(rawRunRoot(), `blind-audit/mapping-${targetSize}.json`), sample.mappings);
    const directReview = state.blindJudgeModel === "codex-in-session";
    const directEntries = sample.packets.map((packet) => ({ packetId: packet.packetId,
      packetSha256: codexPacketSha256(packet),
      packetPath: `experiments/search-e2e-evaluation/uk-mx-v1/artifacts/runs/${state.runId}/blind-audit/codex-direct/packets/${packet.packetId}.json`,
      decisionPath: `experiments/search-e2e-evaluation/uk-mx-v1/artifacts/runs/${state.runId}/blind-audit/codex-direct/decisions/${packet.packetId}.json`,
    }));
    if (directReview) {
      for (let index = 0; index < sample.packets.length; index += 1) {
        await writeJsonAtomic(path.resolve(directEntries[index].packetPath), sample.packets[index]);
      }
      await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/codex-direct/manifest-${targetSize}.json`), {
        schemaVersion: 1, runId: state.runId, targetSize, reviewer: "codex-in-session",
        externalSearchAllowed: false, identitiesHidden: true, scoresHidden: true,
        requireDecisionCommitAndPushBeforeDeblind: true, packets: directEntries,
      });
    }
    const decisions: BlindDecision[] = [];
    state.status = "blind-audit-running";
    await saveRunState(state);
    if (directReview) {
      const artifacts: Array<{ packet: (typeof sample.packets)[number]; artifact: CodexDirectDecisionArtifact;
        decisionPath: string }> = [];
      const missingDecisionPaths: string[] = [];
      for (let index = 0; index < sample.packets.length; index += 1) {
        const packet = sample.packets[index];
        const decisionPath = directEntries[index].decisionPath;
        const value = await readJsonIfExists<unknown>(path.resolve(decisionPath));
        if (!value) {
          missingDecisionPaths.push(decisionPath);
          continue;
        }
        artifacts.push({ packet, artifact: validateCodexDirectDecision(packet, value), decisionPath });
      }
      if (missingDecisionPaths.length > 0) {
        console.log(JSON.stringify({ status: "codex-direct-review-required", targetSize,
          packetManifest: `experiments/search-e2e-evaluation/uk-mx-v1/artifacts/runs/${state.runId}/blind-audit/codex-direct/manifest-${targetSize}.json`,
          missingDecisionCount: missingDecisionPaths.length, missingDecisionPaths }, null, 2));
        return null;
      }
      const freeze = assertCodexDecisionFilesFrozen([
        `experiments/search-e2e-evaluation/uk-mx-v1/artifacts/runs/${state.runId}/blind-audit/packets-${targetSize}.json`,
        `experiments/search-e2e-evaluation/uk-mx-v1/artifacts/runs/${state.runId}/blind-audit/codex-direct/manifest-${targetSize}.json`,
        ...directEntries.map((entry) => entry.packetPath), ...artifacts.map((item) => item.decisionPath),
      ]);
      for (const { packet, artifact } of artifacts) {
        const decision = codexDirectBlindDecision(packet, artifact, state.runId);
        const filename = path.join(rawRunRoot(), `blind-audit/decisions/${packet.packetId}.json`);
        await writeJsonAtomic(filename, decision);
        await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/decisions/${packet.packetId}.json`),
          publicBlindDecision(decision));
        decisions.push(decision);
        if (!state.completedBlindPacketIds.includes(packet.packetId)) {
          appendRecordedCostEvents(state, [decision.costEvent]);
          state.completedBlindPacketIds.push(packet.packetId);
          await saveRunState(state);
          const budget = await persistBudgetReview(state, `blind-${packet.packetId}`);
          if (budget.requiresUserDecision) return null;
        }
      }
      await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/codex-direct/freeze-${targetSize}.json`), {
        schemaVersion: 1, runId: state.runId, targetSize, decisionCommit: freeze.commit,
        upstreamCommit: freeze.upstream, validatedDecisionCount: artifacts.length,
        deblindedAt: new Date().toISOString(),
      });
    } else {
    for (const packet of sample.packets) {
      const filename = path.join(rawRunRoot(), `blind-audit/decisions/${packet.packetId}.json`);
      let decision = await readJsonIfExists<BlindDecision>(filename);
      if (!decision) {
        if (!await requireEvaluationBudget(state, `blind-${packet.packetId}`, 0.5)) return null;
        decision = await judgeBlindPacket(packet, state.blindJudgeModel!, { onCostEvents });
        await writeJsonAtomic(filename, decision);
        await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/decisions/${packet.packetId}.json`),
          publicBlindDecision(decision));
      }
      decisions.push(decision);
      if (!state.completedBlindPacketIds.includes(packet.packetId)) {
        state.completedBlindPacketIds.push(packet.packetId);
        await saveRunState(state);
      }
      const budget = await persistBudgetReview(state, `blind-${packet.packetId}`);
      if (budget.requiresUserDecision) return null;
    }
    }
    const metrics = calculateBlindAuditMetrics(sample.mappings, decisions);
    await writeJsonAtomic(path.join(artifactRunRoot(), `blind-audit/calibration-${targetSize}.json`), {
      schemaVersion: 1, runId: state.runId, generatedAt: new Date().toISOString(), metrics,
      mappings: sample.mappings, decisions: decisions.map(publicBlindDecision),
    });
    return metrics;
  };

  let blind = await judgeSample(32);
  if (!blind) return;
  if (!blind.passed) blind = await judgeSample(64);
  if (!blind) return;
  const metrics = calculateExperimentMetrics(metricSlotsForBundles(bundles, records, aliasToCompanyKey), blind.passed);
  const generatedAt = new Date().toISOString();
  const contributions = calculateProviderContributions(bundles, state.costEvents);
  const findings = optimizationFindings(contributions);
  await writeJsonAtomic(path.join(artifactRunRoot(), "final/metrics.json"), {
    schemaVersion: 1, runId: state.runId, generatedAt, metrics, blindAudit: blind,
    cost: summarizeCostEvents(state.costEvents),
    runtime: { byCell: bundles.map(({ cell, control, product }) => ({ cellId: cell.cellId,
      geminiWallClockMs: control.wallClockMs, productWallClockMs: product.wallClockMs })),
      geminiWallClockMs: bundles.reduce((sum, item) => sum + item.control.wallClockMs, 0),
      productWallClockMs: bundles.reduce((sum, item) => sum + item.product.wallClockMs, 0) },
  });
  await writeJsonAtomic(path.join(artifactRunRoot(), "final/hybrid-search-optimization-analysis.json"), {
    schemaVersion: 1, runId: state.runId, generatedAt, contributions, findings,
    note: "Observed opportunities only; no frozen experiment or product route was modified post hoc.",
  });
  await writeTextAtomic(path.join(artifactRunRoot(), "final/SEARCH_E2E_EVALUATION_REPORT.v1.0.15.md"),
    renderFinalReport({ metrics, blind, bundles, costs: state.costEvents, generatedAt })
      .replace("evaluation v1.0.9", "evaluation v1.0.15"));
  state.status = "completed";
  await saveRunState(state);
  console.log(JSON.stringify({ status: "completed", runId: state.runId, passed: metrics.passed,
    macroDelta: metrics.macroDelta, blindAudit: blind, cost: summarizeCostEvents(state.costEvents) }, null, 2));
}

async function verifyOnly(): Promise<void> {
  validateExperimentConfig();
  await verifyFrozenManifest(false);
  console.log(JSON.stringify({ status: "verified", cells: experimentCells().map((cell) => cell.cellId) }, null, 2));
}

const phase = process.argv.find((value) => value.startsWith("--phase="))?.slice("--phase=".length) ?? "verify";
if (phase === "freeze") await freezeManifest();
else if (phase === "verify") await verifyOnly();
else if (phase === "preflight") await runPreflight();
else if (phase === "cell") {
  const cellId = process.argv.find((value) => value.startsWith("--cell="))?.slice("--cell=".length);
  if (!cellId) throw new Error("--phase=cell requires --cell=<cellId>");
  await runCell(cellId);
} else if (phase === "evaluate") await runEvaluation();
else throw new Error(`Unknown phase ${phase}`);
