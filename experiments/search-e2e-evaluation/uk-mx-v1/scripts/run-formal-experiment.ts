import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { planAssistantRequest } from "@/lib/assistant/intent-agent";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { buildHybridSearchRoute } from "@/lib/leads/workflow/hybrid-search-policy";
import { LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "@/lib/leads/workflow/rag-context";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "@/lib/leads/workflow/types";
import { createDiscoveryProvider, discoveryEnvironmentStatus } from "@/providers/discovery";
import { TavilySearchProvider } from "@/providers/tavily";

import rateCardJson from "../config/official-rate-card.v1.json";
import { evaluateBudget, forecastCompletionCost, priceCostEvent, summarizeCostEvents,
  type ExperimentCostEvent, type ExperimentRateCard } from "../lib/cost-ledger";
import { runControlCell } from "../lib/control-cell";
import { cellById, experimentCells, EXPERIMENT_CONFIG, intentRolesStayWithinCategory, validateExperimentConfig,
  type ExperimentCell } from "../lib/experiment";
import { runProductCell } from "../lib/product-cell";
import { callClaudeBlindJudge, callGeminiControl } from "../lib/provider-clients";
import { artifactRunRoot, loadRunState, rawRunRoot, readJson, saveRunState, writeJsonAtomic,
  type FormalRunState } from "../lib/run-store";

nextEnv.loadEnvConfig(process.cwd());
const rateCard = rateCardJson as ExperimentRateCard;
const experimentRoot = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");
const frozenTag = "search-e2e-eval-v1.0.7-frozen";

const frozenFiles = [
  "PROTOCOL.md", "README.md", "config/experiment.v1.0.0.json", "config/gemini-control-prompt.md",
  "config/blind-judge-rubric.md", "config/official-rate-card.v1.json",
  "schemas/gemini-control-output.schema.json", "schemas/blind-judge-output.schema.json",
  "schemas/runtime-cost-event.schema.json", "lib/cost-ledger.ts", "lib/control-cell.ts", "lib/experiment.ts",
  "lib/product-cell.ts", "lib/provider-clients.ts", "lib/run-store.ts", "scripts/run-formal-experiment.ts",
  "../../../config/lead-search/hybrid-search-v1.0.0.json",
  "../../../config/lead-scoring/policy-v2.0.0.json",
  "../../../config/lead-workflow/end-to-end-v2.0.0.json",
  "../../../config/lead-workflow/runtime-policy-v3.0.0.json",
  "../../../config/lead-workflow/cost-quality-policy-v3.0.0.json",
  "../../../src/lib/assistant/intent-agent.ts", "../../../src/lib/assistant/types.ts",
  "../../../src/lib/leads/workflow/hybrid-discovery-executor.ts",
  "../../../src/lib/leads/workflow/discovery.ts", "../../../src/lib/leads/workflow/evidence-correction-agent.ts",
  "../../../src/lib/leads/workflow/qualification-agent.ts", "../../../src/lib/leads/workflow/schemas.ts",
  "../../../src/providers/discovery.ts", "../../../src/providers/tavily.ts",
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
    const tags = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: process.cwd(), encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
    if (!tags.includes(manifest.requiredGitTag)) throw new Error(`HEAD must be tagged ${manifest.requiredGitTag} before paid calls`);
  }
}

function preflightEvent(input: Parameters<typeof priceCostEvent>[0]): ExperimentCostEvent {
  return priceCostEvent(input, rateCard);
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

async function runPreflight(): Promise<void> {
  await verifyFrozenManifest(true);
  const state = await loadRunState();
  if (state.status === "preflight-passed" || state.status === "running" || state.status === "completed") {
    console.log(JSON.stringify({ status: "preflight-already-passed", runId: state.runId }, null, 2));
    return;
  }
  const missing = ["SEARCH_E2E_USER_ID", "KIMI_API_KEY", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL",
    "DEEPSEEK_API_KEY", "TAVILY_API_KEY", "GEMINI_API_KEY", "CLAUDE_API_KEY"]
    .filter((name) => !process.env[name]?.trim());
  const discoveryStatus = discoveryEnvironmentStatus();
  missing.push(...discoveryStatus.filter((item) => !item.configured).map((item) => item.apiKeyEnv));
  if (missing.length > 0) throw new Error(`Preflight missing required environment variables: ${[...new Set(missing)].join(", ")}`);

  if (!hasPreflightCheck(state, "prior-before-v1.0.7-adjustment")) {
    await checkpointPreflight(state, "prior-before-v1.0.7-adjustment", [preflightEvent({
      eventId: "preflight:prior-before-v1.0.7-adjustment", runId: state.runId,
      ledger: "product-e2e-arm", arm: "product-e2e", stage: "prior-preflight-adjustment", provider: "kimi",
      requestedModel: "kimi-k2.6", actualModel: "kimi-k2.6", startedAt: state.createdAt,
      completedAt: state.createdAt, latencyMs: 0, attempts: 8, retries: 0, fallbackUsed: false, status: "completed",
      usage: {}, accountCashCostUsd: EXPERIMENT_CONFIG.cost.priorPreflightAdjustmentUsd,
      volume: { inputItems: 8, rawOutputItems: 7, validOutputItems: 3, downstreamUsedItems: 0,
        discardedReasonCounts: { timeout: 1, schemaInvalid: 3, fallback: 1, overlyStrictSemanticGate: 1,
          negatedSpecialRoleMisread: 2 } },
      notes: ["Carries the v1.0.0-v1.0.6 Kimi preflight budget: USD 0.02 conservative allowance plus USD 0.0272774182 priced usage, rounded upward."]
    })], { amountUsd: EXPERIMENT_CONFIG.cost.priorPreflightAdjustmentUsd, attempts: 8 });
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
      || !intentRolesStayWithinCategory(intent.leadPlan.roles, plan.roles)) {
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
    if (!gemini.output || gemini.output.candidates.length < 1 || (gemini.usage.groundingQueries ?? 0) < 1) {
      throw new Error(`Gemini control preflight failed: ${gemini.parseError ?? "no candidates or search query"}`);
    }
    const geminiEvent = preflightEvent({ eventId: "preflight:gemini-control", runId: state.runId,
      ledger: "gemini-native-arm", arm: "gemini-native", stage: "preflight-control", provider: "gemini-full",
      requestedModel: gemini.requestedModel, actualModel: gemini.actualModel, startedAt: gemini.startedAt,
      completedAt: gemini.completedAt, latencyMs: gemini.latencyMs, attempts: gemini.attempts, retries: gemini.retries,
      fallbackUsed: gemini.actualModel !== gemini.requestedModel, status: "completed", usage: gemini.usage,
      volume: { inputItems: 1, rawOutputItems: gemini.output.candidates.length,
        validOutputItems: gemini.output.candidates.length, downstreamUsedItems: gemini.output.candidates.length,
        discardedReasonCounts: {} } });
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
    if (!blind.output && blindModel === EXPERIMENT_CONFIG.blindAudit.primaryModel) {
      const invalidEvent = preflightEvent({ eventId: "preflight:blind-primary-invalid", runId: state.runId,
        ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
        provider: "anthropic", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
        startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
        attempts: blind.attempts, retries: blind.retries, fallbackUsed: false, status: "failed", usage: blind.usage,
        volume: { inputItems: 1, rawOutputItems: 1, validOutputItems: 0, downstreamUsedItems: 0,
          discardedReasonCounts: { schemaInvalid: 1 } } });
      await checkpointPreflight(state, "claude-blind-primary-invalid", [invalidEvent],
        { model: blind.actualModel, parseError: blind.parseError ?? "unknown" });
      blindModel = EXPERIMENT_CONFIG.blindAudit.preflightOnlyFallbackModel;
      blind = await callClaudeBlindJudge(blindPacket, blindModel);
    }
    if (!blind.output) throw new Error(`Claude blind-judge preflight failed: ${blind.parseError}`);
    const blindEvent = preflightEvent({ eventId: "preflight:blind-judge", runId: state.runId,
      ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "preflight-blind-judge",
      provider: "anthropic", requestedModel: blind.requestedModel, actualModel: blind.actualModel,
      startedAt: blind.startedAt, completedAt: blind.completedAt, latencyMs: blind.latencyMs,
      attempts: blind.attempts, retries: blind.retries,
      fallbackUsed: blindModel !== EXPERIMENT_CONFIG.blindAudit.primaryModel,
      status: "completed", usage: blind.usage, volume: { inputItems: 1, rawOutputItems: 1,
        validOutputItems: 1, downstreamUsedItems: 1, discardedReasonCounts: {} } });
    await checkpointPreflight(state, "claude-blind-judge", [blindEvent],
      { model: blind.actualModel }, blindModel);
  }

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

function publicProductResult(result: Awaited<ReturnType<typeof runProductCell>>) {
  const { raw: _raw, discoveryCalls, ...rest } = result;
  return { ...rest, discoveryCalls: discoveryCalls.map(({ items: _items, query, ...call }) => ({
    ...call, querySha256: sha256(query),
  })) };
}

function publicControlResult(result: Awaited<ReturnType<typeof runControlCell>>) {
  const { raw: _raw, ...rest } = result;
  return rest;
}

async function budgetDecision(state: FormalRunState, nextRequiredCallEstimateUsd = 0) {
  const forecast = forecastCompletionCost(state.costEvents, { completedCellIds: state.completedCellIds,
    totalCells: 8, fixedRemainingUsd: 10, initialEstimateUsd: EXPERIMENT_CONFIG.cost.initialForecastUsd.expected });
  return evaluateBudget(state.costEvents, forecast, { totalBudgetUsd: EXPERIMENT_CONFIG.cost.hardBudgetUsd,
    thresholdsUsd: [...EXPERIMENT_CONFIG.cost.reviewThresholdUsd],
    previouslyReportedThresholdsUsd: state.reportedBudgetThresholdsUsd, nextRequiredCallEstimateUsd });
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
  } else if (state.completedCellIds.length === 8) state.status = "completed";
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
} else throw new Error(`Unknown phase ${phase}`);
