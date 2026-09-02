import { createHash } from "node:crypto";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { LeadEvidenceCorrectionAgent } from "@/lib/leads/workflow/evidence-correction-agent";
import { collectLeadEvidence } from "@/lib/leads/workflow/discovery";
import { LeadQualificationAgent } from "@/lib/leads/workflow/qualification-agent";
import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook, LeadWorkflowCandidate,
  WorkflowModelUsage } from "@/lib/leads/workflow/types";

import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentRateCard, type ExperimentVolume } from "./cost-ledger";
import type { ControlCellResult, ControlFinalCandidate } from "./control-cell";
import { EXPERIMENT_CONFIG, leadPlanForCell, primaryRoleMatchesCategory, type ExperimentCell } from "./experiment";
import type { ProductCellResult, ProductFinalCandidate } from "./product-cell";

const rateCard = rateCardJson as ExperimentRateCard;

export interface FrozenCellBundle {
  cell: ExperimentCell;
  control: ControlCellResult;
  product: ProductCellResult;
}

export interface UnifiedCompanyRecord {
  companyKey: string;
  countryCode: string;
  companyName: string;
  domain: string;
  officialWebsiteUrl: string;
  primaryRole: string;
  supportedRoles: string[];
  totalScore: number;
  eligibilityStatus: string;
  isRealOperatingCompany: boolean;
  operatesInTargetMarket: boolean;
  evidence: Array<{ id: string; url: string; title: string; excerpt: string; sourceType: string }>;
  source: "product-reused" | "gemini-unique-evaluated";
  assessmentModel: string;
}

export interface ControlUniqueInput {
  sourceCellId: string;
  sourceRanks: Array<{ cellId: string; rank: number }>;
  originalAliases: string[];
  candidate: LeadWorkflowCandidate;
}

export interface ControlUniqueEvaluationResult {
  schemaVersion: 1;
  runId: string;
  cellId: string;
  inputCount: number;
  records: UnifiedCompanyRecord[];
  aliasToCompanyKey: Record<string, string>;
  costEvents: ExperimentCostEvent[];
  warnings: string[];
  raw: { enriched: unknown; corrected: unknown; assessments: unknown };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase("en-US").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(limited|ltd|llc|inc|corp|corporation|plc|sa de cv|s de rl|group|grupo)\b/g, "")
    .replace(/[^a-z0-9]+/g, "").trim();
}

function domainFromUrl(value: string): string {
  try { return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, ""); }
  catch { return ""; }
}

export function identityAliases(countryCode: string, companyName: string, website: string): string[] {
  const domain = domainFromUrl(website);
  const name = normalizedName(companyName);
  return [...new Set([...(domain ? [`${countryCode}:domain:${domain}`] : []),
    ...(name ? [`${countryCode}:name:${name}`] : [])])];
}

function companyKey(countryCode: string, companyName: string, website: string): string {
  return identityAliases(countryCode, companyName, website)[0]
    ?? `${countryCode}:unknown:${hash(`${companyName}|${website}`).slice(0, 20)}`;
}

function productRecord(cell: ExperimentCell, candidate: ProductFinalCandidate): UnifiedCompanyRecord {
  return { companyKey: companyKey(cell.countryCode, candidate.companyName, candidate.officialWebsiteUrl),
    countryCode: cell.countryCode, companyName: candidate.companyName, domain: candidate.domain,
    officialWebsiteUrl: candidate.officialWebsiteUrl, primaryRole: candidate.primaryRole,
    supportedRoles: candidate.supportedRoles, totalScore: candidate.totalScore,
    eligibilityStatus: candidate.eligibilityStatus, isRealOperatingCompany: true, operatesInTargetMarket: true,
    evidence: candidate.evidence.map((item) => ({ id: item.id, url: item.url, title: item.title,
      excerpt: item.excerpt, sourceType: item.sourceType })), source: "product-reused",
    assessmentModel: "product-current-run" };
}

export function buildProductRecordIndex(bundles: FrozenCellBundle[]): {
  records: Map<string, UnifiedCompanyRecord>; aliasToCompanyKey: Map<string, string>; duplicateAliases: string[];
} {
  const records = new Map<string, UnifiedCompanyRecord>();
  const aliasToCompanyKey = new Map<string, string>();
  const duplicateAliases: string[] = [];
  for (const { cell, product } of bundles) {
    for (const candidate of product.finalCandidates) {
      const aliases = identityAliases(cell.countryCode, candidate.companyName, candidate.officialWebsiteUrl);
      const existingKey = aliases.map((alias) => aliasToCompanyKey.get(alias)).find(Boolean);
      if (existingKey) {
        duplicateAliases.push(...aliases);
        for (const alias of aliases) aliasToCompanyKey.set(alias, existingKey);
        continue;
      }
      const record = productRecord(cell, candidate);
      records.set(record.companyKey, record);
      for (const alias of aliases) aliasToCompanyKey.set(alias, record.companyKey);
    }
  }
  return { records, aliasToCompanyKey, duplicateAliases: [...new Set(duplicateAliases)] };
}

function queryFamily(cell: ExperimentCell): LeadWorkflowCandidate["queryFamily"] {
  return cell.categoryId === "si-msp" ? "services" : cell.categoryId;
}

function controlCandidateInput(cell: ExperimentCell, candidate: ControlFinalCandidate): LeadWorkflowCandidate {
  const domain = domainFromUrl(candidate.officialWebsite);
  const snapshot = `${EXPERIMENT_CONFIG.runId}-${cell.cellId}-gemini-evaluation`;
  const excerpt = [candidate.marketSignal, candidate.roleSignal, candidate.relevanceSignal].join(" ").slice(0, 1_600);
  return { candidateId: `gemini-${hash(`${cell.countryCode}|${candidate.companyName}|${candidate.officialWebsite}`).slice(0, 24)}`,
    evidenceSnapshotRunId: snapshot, companyName: candidate.companyName, domain,
    officialWebsiteUrl: candidate.officialWebsite, queryRoles: [...cell.roles], queryFamily: queryFamily(cell),
    providerScore: 0, evidenceWarnings: [], evidence: candidate.evidenceUrls.map((url, index) => ({
      id: `gemini-discovery-${hash(`${candidate.companyName}|${url}|${index}`).slice(0, 24)}`, url,
      title: `Gemini control discovery evidence ${index + 1}`, excerpt, sourceType: "discovery",
      provider: "gemini-full", capturedAt: new Date().toISOString(), evidenceRunId: snapshot,
      freshnessStatus: "fresh" as const })), searchCategories: [cell.categoryId] };
}

export function buildControlUniqueGroups(bundles: FrozenCellBundle[], productAliases: Map<string, string>): {
  groups: Map<string, ControlUniqueInput[]>; originalAliasToKnownKey: Map<string, string>;
} {
  const groups = new Map<string, ControlUniqueInput[]>();
  const originalAliasToKnownKey = new Map(productAliases);
  const uniqueByKey = new Map<string, ControlUniqueInput>();
  for (const { cell, control } of bundles) {
    for (const candidate of control.finalCandidates) {
      const aliases = identityAliases(cell.countryCode, candidate.companyName, candidate.officialWebsite);
      const known = aliases.map((alias) => originalAliasToKnownKey.get(alias)).find(Boolean);
      if (known) {
        const unique = uniqueByKey.get(known);
        if (unique) {
          unique.sourceRanks.push({ cellId: cell.cellId, rank: candidate.rank });
          unique.originalAliases = [...new Set([...unique.originalAliases, ...aliases])];
        }
        for (const alias of aliases) originalAliasToKnownKey.set(alias, known);
        continue;
      }
      const provisionalKey = companyKey(cell.countryCode, candidate.companyName, candidate.officialWebsite);
      const input: ControlUniqueInput = { sourceCellId: cell.cellId,
        sourceRanks: [{ cellId: cell.cellId, rank: candidate.rank }], originalAliases: aliases,
        candidate: controlCandidateInput(cell, candidate) };
      uniqueByKey.set(provisionalKey, input);
      for (const alias of aliases) originalAliasToKnownKey.set(alias, provisionalKey);
      groups.set(cell.cellId, [...(groups.get(cell.cellId) ?? []), input]);
    }
  }
  return { groups, originalAliasToKnownKey };
}

function event(options: Omit<Parameters<typeof priceCostEvent>[0], "runId" | "ledger" | "arm">): ExperimentCostEvent {
  return priceCostEvent({ ...options, runId: EXPERIMENT_CONFIG.runId, ledger: "evaluation-overhead",
    arm: "shared-evaluation" }, rateCard);
}

function volume(inputItems: number, rawOutputItems: number, validOutputItems: number,
  downstreamUsedItems: number, discardedReasonCounts: Record<string, number> = {}): ExperimentVolume {
  return { inputItems, rawOutputItems, validOutputItems, downstreamUsedItems, discardedReasonCounts };
}

function modelEvents(cell: ExperimentCell, stage: string, usages: WorkflowModelUsage[], startedAt: string,
  completedAt: string, stageVolume: ExperimentVolume): ExperimentCostEvent[] {
  return usages.map((usage, index) => event({ eventId: `${cell.cellId}:${stage}:${index + 1}`,
    cellId: cell.cellId, stage, provider: usage.providerId ?? "deepseek", requestedModel: usage.requestedModel,
    actualModel: usage.actualModel, startedAt, completedAt, latencyMs: usage.latencyMs,
    attempts: usage.attempts ?? 1, retries: usage.retries ?? 0, fallbackUsed: usage.fallbackUsed,
    status: "completed", usage: { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens,
      reasoningTokens: usage.reasoningTokens }, volume: stageVolume }));
}

function findingSupported(candidate: CorrectedLeadWorkflowCandidate, kind: "identity" | "country-presence"): boolean {
  const findings = candidate.correction.findings.filter((finding) => finding.kind === kind);
  return findings.length > 0 && findings.some((finding) => finding.status === "supported");
}

export async function evaluateControlUniqueGroup(cell: ExperimentCell, inputs: ControlUniqueInput[],
  playbook: LeadMarketPlaybook, options: {
    onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
  } = {}): Promise<ControlUniqueEvaluationResult> {
  const costEvents: ExperimentCostEvent[] = [];
  const record = async (events: ExperimentCostEvent[]) => {
    costEvents.push(...events);
    await options.onCostEvents?.(events);
  };
  if (inputs.length === 0) return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, cellId: cell.cellId,
    inputCount: 0, records: [], aliasToCompanyKey: {}, costEvents: [], warnings: [],
    raw: { enriched: null, corrected: null, assessments: null } };
  const plan: LeadSearchPlan = leadPlanForCell(cell);
  const evidenceStarted = new Date().toISOString();
  const enriched = await collectLeadEvidence(inputs.map((input) => input.candidate), plan,
    { allowReusableEvidence: false, persistEvidence: false, concurrency: 12, maximumAttempts: 3 });
  const evidenceCompleted = new Date().toISOString();
  const evidenceCount = enriched.candidates.reduce((sum, candidate) => sum
    + candidate.evidence.filter((item) => item.sourceType !== "discovery").length, 0);
  await record([event({ eventId: `${cell.cellId}:evaluation:fresh-evidence`, cellId: cell.cellId,
    stage: "evaluation-control-fresh-evidence", provider: "tavily", startedAt: evidenceStarted,
    completedAt: evidenceCompleted, latencyMs: enriched.providerMetrics?.latencyMs ?? 0,
    attempts: enriched.providerMetrics?.attempts ?? 0, retries: enriched.providerMetrics?.retries ?? 0,
    fallbackUsed: false, status: "completed", usage: { paidSearchCredits: enriched.creditsUsed },
    volume: volume(inputs.length, evidenceCount, evidenceCount, evidenceCount,
      { noFreshEvidence: enriched.candidates.filter((candidate) => !candidate.evidence
        .some((item) => item.sourceType !== "discovery")).length }),
    notes: ["Gemini-unique final candidates only", "historical evidence reads and writes disabled"] })]);

  const correctionStarted = new Date().toISOString();
  const corrected = await new LeadEvidenceCorrectionAgent().correct(enriched.candidates, plan);
  const correctionCompleted = new Date().toISOString();
  if (corrected.creditsUsed > 0 || corrected.providerMetrics.attempts > 0) {
    await record([event({ eventId: `${cell.cellId}:evaluation:correction-search`, cellId: cell.cellId,
      stage: "evaluation-control-correction-search", provider: "tavily", startedAt: correctionStarted,
      completedAt: correctionCompleted, latencyMs: corrected.providerMetrics.latencyMs,
      attempts: corrected.providerMetrics.attempts, retries: corrected.providerMetrics.retries,
      fallbackUsed: false, status: "completed", usage: { paidSearchCredits: corrected.creditsUsed },
      volume: volume(enriched.candidates.length, corrected.candidates.length, corrected.candidates.length,
        corrected.candidates.length) })]);
  }
  await record(modelEvents(cell, "evaluation-control-correction", corrected.usage ?? [], correctionStarted,
    correctionCompleted, volume(enriched.candidates.length, corrected.candidates.length,
      corrected.candidates.filter((candidate) => candidate.correction.resolvedRoles.length > 0).length,
      corrected.candidates.length)));

  const scoringStarted = new Date().toISOString();
  const scored = await new LeadQualificationAgent(undefined, { includeCooperationPaths: false, concurrency: 4 })
    .evaluateWithUsage(corrected.candidates, playbook, cell.countryCode, cell.countryName, plan.objective);
  const scoringCompleted = new Date().toISOString();
  await record(modelEvents(cell, "evaluation-control-score-only", scored.usage, scoringStarted, scoringCompleted,
    volume(corrected.candidates.length, scored.assessments.length,
      scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
      scored.assessments.filter((assessment) => assessment.scoringStatus === "completed").length,
      { retryRequired: scored.assessments.filter((assessment) => assessment.scoringStatus !== "completed").length })));

  const correctedById = new Map(corrected.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const records = scored.assessments.flatMap((assessment) => {
    const candidate = correctedById.get(assessment.candidateId);
    if (!candidate || assessment.scoringStatus !== "completed") return [];
    const key = companyKey(cell.countryCode, candidate.companyName, candidate.officialWebsiteUrl);
    const relied = new Set(assessment.evidenceIds);
    return [{ companyKey: key, countryCode: cell.countryCode, companyName: candidate.companyName,
      domain: candidate.domain, officialWebsiteUrl: candidate.officialWebsiteUrl,
      primaryRole: candidate.correction.primaryRole, supportedRoles: candidate.correction.resolvedRoles,
      totalScore: assessment.totalScore, eligibilityStatus: assessment.eligibilityStatus,
      isRealOperatingCompany: assessment.gates.companyExists !== "not-supported" && findingSupported(candidate, "identity"),
      operatesInTargetMarket: assessment.gates.targetCountryPresence !== "not-supported"
        && findingSupported(candidate, "country-presence"),
      evidence: candidate.evidence.filter((item) => relied.has(item.id)).map((item) => ({ id: item.id,
        url: item.url, title: item.title.slice(0, 300), excerpt: item.excerpt.slice(0, 800),
        sourceType: item.sourceType })), source: "gemini-unique-evaluated" as const,
      assessmentModel: assessment.model }];
  });
  const recordByCandidateId = new Map(records.map((item) => {
    const candidate = corrected.candidates.find((value) => value.companyName === item.companyName
      && value.officialWebsiteUrl === item.officialWebsiteUrl);
    return [candidate?.candidateId ?? "", item];
  }));
  const aliasToCompanyKey: Record<string, string> = {};
  for (const input of inputs) {
    const correctedCandidate = correctedById.get(input.candidate.candidateId);
    const evaluated = recordByCandidateId.get(input.candidate.candidateId)
      ?? records.find((item) => item.companyKey === companyKey(cell.countryCode,
        correctedCandidate?.companyName ?? input.candidate.companyName,
        correctedCandidate?.officialWebsiteUrl ?? input.candidate.officialWebsiteUrl));
    if (evaluated) for (const alias of input.originalAliases) aliasToCompanyKey[alias] = evaluated.companyKey;
  }
  return { schemaVersion: 1, runId: EXPERIMENT_CONFIG.runId, cellId: cell.cellId, inputCount: inputs.length,
    records, aliasToCompanyKey, costEvents, warnings: [...enriched.warnings, ...corrected.warnings],
    raw: { enriched, corrected, assessments: scored.assessments } };
}

export function metricSlotsForBundles(bundles: FrozenCellBundle[], records: Map<string, UnifiedCompanyRecord>,
  aliasToCompanyKey: Map<string, string>) {
  return bundles.map(({ cell, control, product }) => {
    const toSlot = (candidate: { companyName: string; website: string }) => {
      const aliases = identityAliases(cell.countryCode, candidate.companyName, candidate.website);
      const key = aliases.map((alias) => aliasToCompanyKey.get(alias)).find(Boolean)
        ?? companyKey(cell.countryCode, candidate.companyName, candidate.website);
      const record = records.get(key);
      return { companyKey: key, totalScore: record?.totalScore ?? 0,
        isRealOperatingCompany: record?.isRealOperatingCompany ?? false,
        operatesInTargetMarket: record?.operatesInTargetMarket ?? false,
        requestedCategoryMatch: record ? primaryRoleMatchesCategory(record.primaryRole, cell.categoryId) : false };
    };
    return { cellId: cell.cellId, countryCode: cell.countryCode, arms: {
      "gemini-native": control.finalCandidates.map((candidate) => toSlot({ companyName: candidate.companyName,
        website: candidate.officialWebsite })),
      "product-e2e": product.finalCandidates.map((candidate) => toSlot({ companyName: candidate.companyName,
        website: candidate.officialWebsiteUrl })),
    } };
  });
}
