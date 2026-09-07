import { createHash } from "node:crypto";

import { CHANNEL_ROLE_FAMILIES, type ChannelRoleFamily } from "@/lib/leads/workflow/types";

import blindConfigJson from "../config/blind-audit-v2.0.0.json";
import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentRateCard } from "./cost-ledger";
import { spearmanCorrelation } from "./evaluation-metrics";
import { EXPERIMENT_CONFIG, type ExperimentCategoryId } from "./experiment";
import { callBlindArbitratorV2, callBlindJudgeV2, type ProviderCall } from "./provider-clients";
import type { BlindJudgeV2Output } from "./runtime-schemas";
import { identityAliases, type FrozenCellBundle, type UnifiedCompanyRecord } from "./unified-evaluation";

const rateCard = rateCardJson as ExperimentRateCard;
const blindConfig = blindConfigJson;
export const BLIND_AUDIT_V2_CONFIG = blindConfigJson;
const cudyBrief = "Cudy provides accessible, reliable and easy-to-deploy networking for consumers, homes, SMBs, hospitality, education, retail, light industry and ISP/FWA. Relevant families include Wi-Fi routers and mesh, 4G/5G FWA, AP/controller, Ethernet/PoE/fibre switching, gateways/VPN, outdoor wireless and xPON/ONT. Positioning is value and SMB rather than premium-enterprise-only.";

export type BlindAuditV2Cohort = "representative" | "stress";
export type BlindAuditRoleFamily = ChannelRoleFamily | "hybrid" | "unresolved";
type BlindDimension = keyof BlindJudgeV2Output["dimensions"];

const dimensions: BlindDimension[] = ["productAndUseCaseFit", "channelAndBuyingInfluence",
  "sameRoleScaleAndCoverage", "executionAndEnablement", "opportunityAndRisk"];

const categoryFamilies: Record<ExperimentCategoryId, ChannelRoleFamily> = {
  distribution: "distribution", resale: "resale", retail: "retail", "si-msp": "services",
};

const scaleObservables: Record<ChannelRoleFamily, string> = {
  distribution: "downstream partner breadth; relevant vendor portfolio; inventory, logistics, credit and enablement",
  resale: "B2B/SMB customer footprint; repeatable networking resale; pre-sales, configuration and support reach",
  retail: "consumer store or owned-shop reach; home/SOHO category depth; fulfilment, returns and consumer support",
  services: "B2B project and customer footprint; network engineering capacity; managed-service continuity",
  isp: "subscriber footprint; access-network coverage; device procurement scale; field-service continuity",
  agent: "principal coverage; deal influence; market access; repeatable representation activity",
  brand: "market presence; relevant product business; channel coverage; operational continuity",
};

export interface BlindAuditV2Evidence {
  evidenceId: string;
  sourceType: string;
  url: string;
  title: string;
  excerpt: string;
}

export interface BlindAuditV2Packet {
  packetId: string;
  protocolVersion: "2.0.0";
  targetMarket: { countryCode: string; countryName: string };
  requestedCategory: ExperimentCategoryId;
  requestedRoleFamily: ChannelRoleFamily;
  cudyBrief: string;
  company: { name: string; domain: string; officialWebsiteUrl: string };
  evidencePolicy: {
    version: string;
    selectionIndependentOfScoringCitations: true;
    availableEvidenceCount: number;
    includedEvidenceCount: number;
    omittedEvidenceCount: number;
  };
  sameMarketSameRoleScaleAnchor: {
    market: string;
    selectionRule: string;
    observableSignalsByRoleFamily: Record<ChannelRoleFamily, string>;
    bands: Array<{ scoreRange: string; label: string; interpretation: string }>;
  };
  evidence: BlindAuditV2Evidence[];
}

export interface BlindAuditV2QualificationComponents {
  identity: boolean;
  targetMarket: boolean;
  requestedFamily: boolean;
  scoreThreshold: boolean;
  outputEligibility: boolean;
  qualified: boolean;
}

export interface BlindAuditV2Mapping {
  packetId: string;
  companyKey: string;
  cellId: string;
  cohort: BlindAuditV2Cohort;
  stratum: string;
  inclusionProbability: number | null;
  presentInArms: string[];
  sourceRanks: Partial<Record<"gemini-native" | "product-e2e", number>>;
  unifiedPrimaryRole: string;
  unifiedRoleFamily: BlindAuditRoleFamily;
  unifiedScore: number;
  unifiedEligibility: string;
  unifiedQualification: BlindAuditV2QualificationComponents;
}

export interface CitationValidation {
  checkedClaims: number;
  validEvidenceIds: number;
  entailedClaims: number;
  idAlignmentRate: number;
  entailmentRate: number;
}

export interface BlindJudgeV2Decision {
  packetId: string;
  judgeId: string;
  requestedModel: string;
  actualModel: string;
  modelReportedTotal: number;
  deterministicTotal: number;
  roleFamily: BlindAuditRoleFamily;
  requestedCategoryFamilyMatch: boolean;
  citationValidation: CitationValidation;
  output: BlindJudgeV2Output;
  costEvent: ExperimentCostEvent;
  raw?: unknown;
}

export interface BlindConsensusV2Decision {
  packetId: string;
  resolution: "judge-average" | "arbitrator";
  arbitrationTriggered: boolean;
  arbitrationReasons: string[];
  deterministicTotal: number;
  roleFamily: BlindAuditRoleFamily;
  requestedCategoryFamilyMatch: boolean;
  exactSubtypeConsensus: boolean;
  citationValidation: CitationValidation;
  output: BlindJudgeV2Output;
  judges: [BlindJudgeV2Decision, BlindJudgeV2Decision];
  arbitrator?: BlindJudgeV2Decision;
}

export type BlindConsensusV2Resolution = {
  status: "arbitration-required";
  arbitrationReasons: string[];
} | {
  status: "resolved";
  decision: BlindConsensusV2Decision;
};

export interface BlindAuditV2CohortMetrics {
  sampleSize: number;
  roleFamilyAgreement: number;
  exactPrimaryRoleAgreement: number;
  qualificationAgreement: {
    identity: number;
    targetMarket: number;
    requestedFamily: number;
    scoreThreshold: number;
    outputEligibility: number;
    qualified: number;
  };
  withinCellMacroSpearman: number;
  pooledSpearman: number;
  meanBias: number;
  meanAbsoluteError: number;
  citationIdAlignment: number;
  citationEntailment: number;
  interJudge: {
    roleFamilyAgreement: number;
    exactPrimaryRoleAgreement: number;
    qualifiedStatusAgreement: number;
    meanAbsoluteScoreDifference: number;
  };
  cells: Array<{ cellId: string; sampleSize: number; spearman: number; roleFamilyAgreement: number;
    qualifiedAgreement: number; meanAbsoluteError: number }>;
}

export interface BlindAuditV2Metrics {
  protocolVersion: "2.0.0";
  sampleSize: number;
  representative: BlindAuditV2CohortMetrics;
  stress: BlindAuditV2CohortMetrics;
  arbitrationRate: number;
  arbitrationCount: number;
  arbitrationCostUsd: number;
  gates: Record<string, { passed: boolean; actual: number; threshold: number }>;
  warnings: string[];
  passed: boolean;
}

export interface BlindAuditV2DecisionCache {
  get(cacheKey: string): Promise<BlindJudgeV2Decision | null>;
  set(cacheKey: string, decision: BlindJudgeV2Decision): Promise<void>;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function blindAuditV2DecisionCacheKey(packet: BlindAuditV2Packet, judgeId: string,
  requestedModel: string, judgeOutputs: BlindJudgeV2Decision[] = []): string {
  const dependencies = { protocolVersion: packet.protocolVersion, packet, judgeId, requestedModel,
    judgeOutputs: judgeOutputs.map((decision) => ({ actualModel: decision.actualModel,
      deterministicTotal: decision.deterministicTotal, roleFamily: decision.roleFamily,
      requestedCategoryFamilyMatch: decision.requestedCategoryFamilyMatch, output: decision.output })) };
  return `blind-audit-v2:${hash(JSON.stringify(dependencies))}`;
}

function normalizedRole(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

export function blindAuditRoleFamily(primaryRole: string): BlindAuditRoleFamily {
  if (normalizedRole(primaryRole) === "hybrid") return "hybrid";
  for (const [family, roles] of Object.entries(CHANNEL_ROLE_FAMILIES)) {
    if ((roles as readonly string[]).some((role) => normalizedRole(role) === normalizedRole(primaryRole))) {
      return family as ChannelRoleFamily;
    }
  }
  return "unresolved";
}

function qualification(identity: boolean, targetMarket: boolean, requestedFamily: boolean, score: number,
  eligibility: string): BlindAuditV2QualificationComponents {
  const scoreThreshold = score >= blindConfig.qualification.scoreThreshold;
  const outputEligibility = eligibility === blindConfig.qualification.requiresEligibilityLabel;
  return { identity, targetMarket, requestedFamily, scoreThreshold, outputEligibility,
    qualified: identity && targetMarket && requestedFamily && scoreThreshold && outputEligibility };
}

function sourcePriority(sourceType: string): number {
  const index = blindConfig.evidencePacket.sourcePriority.indexOf(sourceType);
  return index < 0 ? blindConfig.evidencePacket.sourcePriority.length : index;
}

function standardizedEvidence(record: UnifiedCompanyRecord): { available: number; evidence: BlindAuditV2Evidence[] } {
  if (!record.blindAuditEvidence) {
    throw new Error(`${record.companyKey} has no score-independent blind-audit evidence pool`);
  }
  const source = record.blindAuditEvidence;
  const unique = [...new Map(source.map((item) => [item.id, item])).values()];
  const sorted = unique.sort((left, right) => sourcePriority(left.sourceType) - sourcePriority(right.sourceType)
    || hash(`${left.url}|${left.id}`).localeCompare(hash(`${right.url}|${right.id}`)));
  return { available: unique.length, evidence: sorted.slice(0, blindConfig.evidencePacket.maximumItems).map((item) => ({
    evidenceId: item.id, sourceType: item.sourceType, url: item.url,
    title: item.title.slice(0, blindConfig.evidencePacket.maximumTitleCharacters),
    excerpt: item.excerpt.slice(0, blindConfig.evidencePacket.maximumExcerptCharacters),
  })) };
}

function packetFor(record: UnifiedCompanyRecord, bundle: FrozenCellBundle, packetId: string): BlindAuditV2Packet {
  const requestedRoleFamily = categoryFamilies[bundle.cell.categoryId];
  const packetEvidence = standardizedEvidence(record);
  return { packetId, protocolVersion: "2.0.0",
    targetMarket: { countryCode: bundle.cell.countryCode, countryName: bundle.cell.countryName },
    requestedCategory: bundle.cell.categoryId, requestedRoleFamily, cudyBrief,
    company: { name: record.companyName, domain: record.domain, officialWebsiteUrl: record.officialWebsiteUrl },
    evidencePolicy: { version: blindConfig.evidencePacket.policyVersion,
      selectionIndependentOfScoringCitations: true, availableEvidenceCount: packetEvidence.available,
      includedEvidenceCount: packetEvidence.evidence.length,
      omittedEvidenceCount: Math.max(0, packetEvidence.available - packetEvidence.evidence.length) },
    sameMarketSameRoleScaleAnchor: { market: bundle.cell.countryName,
      selectionRule: "Identify the primary role family first, then use only that family's observables; do not default to the requested category.",
      observableSignalsByRoleFamily: scaleObservables, bands: [
        { scoreRange: "0-3", label: "Unverified", interpretation: "No reliable evidence of relevant scale or material contradictory evidence." },
        { scoreRange: "4-6", label: "Local/Small", interpretation: "Local or niche footprint within this market and role family." },
        { scoreRange: "7-9", label: "Regional", interpretation: "Multi-city or regional footprint within this market and role family." },
        { scoreRange: "10-12", label: "National", interpretation: "Material national reach within this market and role family." },
        { scoreRange: "13-15", label: "Global/Enterprise", interpretation: "Exceptional national or multinational scale relevant to this market and role family." },
      ] }, evidence: packetEvidence.evidence };
}

interface CellCandidate {
  key: string;
  record: UnifiedCompanyRecord;
  ranks: Partial<Record<"gemini-native" | "product-e2e", number>>;
}

function cellCandidates(bundle: FrozenCellBundle, records: Map<string, UnifiedCompanyRecord>,
  aliasToCompanyKey: Map<string, string>): CellCandidate[] {
  const found = new Map<string, CellCandidate>();
  for (const arm of ["gemini-native", "product-e2e"] as const) {
    const candidates = arm === "gemini-native" ? bundle.control.finalCandidates : bundle.product.finalCandidates;
    for (const [index, candidate] of candidates.entries()) {
      const name = candidate.companyName;
      const website = "officialWebsite" in candidate ? candidate.officialWebsite : candidate.officialWebsiteUrl;
      const key = identityAliases(bundle.cell.countryCode, name, website)
        .map((alias) => aliasToCompanyKey.get(alias)).find(Boolean);
      const record = key ? records.get(key) : undefined;
      if (!key || !record) continue;
      const existing = found.get(key) ?? { key, record, ranks: {} };
      existing.ranks[arm] = index + 1;
      found.set(key, existing);
    }
  }
  return [...found.values()];
}

function mappingFor(item: CellCandidate, bundle: FrozenCellBundle, packetId: string,
  cohort: BlindAuditV2Cohort, stratum: string, inclusionProbability: number | null): BlindAuditV2Mapping {
  const roleFamily = blindAuditRoleFamily(item.record.primaryRole);
  const requestedFamily = roleFamily === categoryFamilies[bundle.cell.categoryId];
  return { packetId, companyKey: item.key, cellId: bundle.cell.cellId, cohort, stratum, inclusionProbability,
    presentInArms: (Object.keys(item.ranks) as Array<keyof typeof item.ranks>), sourceRanks: item.ranks,
    unifiedPrimaryRole: item.record.primaryRole, unifiedRoleFamily: roleFamily,
    unifiedScore: item.record.totalScore, unifiedEligibility: item.record.eligibilityStatus,
    unifiedQualification: qualification(item.record.isRealOperatingCompany, item.record.operatesInTargetMarket,
      requestedFamily, item.record.totalScore, item.record.eligibilityStatus) };
}

export function buildBlindAuditV2Sample(bundles: FrozenCellBundle[], records: Map<string, UnifiedCompanyRecord>,
  aliasToCompanyKey: Map<string, string>): { packets: BlindAuditV2Packet[]; mappings: BlindAuditV2Mapping[] } {
  if (bundles.length !== blindConfig.sampling.cells) {
    throw new Error(`Blind audit v2 requires ${blindConfig.sampling.cells} cells; received ${bundles.length}`);
  }
  const packets: BlindAuditV2Packet[] = [];
  const mappings: BlindAuditV2Mapping[] = [];
  for (const bundle of bundles) {
    const union = cellCandidates(bundle, records, aliasToCompanyKey);
    const required = blindConfig.sampling.representativePerCell + blindConfig.sampling.stressPerCell;
    if (union.length < required) throw new Error(`${bundle.cell.cellId} has ${union.length} candidates; ${required} required`);
    const representative = [...union].sort((left, right) =>
      hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|blind-v2|representative|${bundle.cell.cellId}|${left.key}`)
        .localeCompare(hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|blind-v2|representative|${bundle.cell.cellId}|${right.key}`)))
      .slice(0, blindConfig.sampling.representativePerCell);
    const used = new Set(representative.map((item) => item.key));
    const remaining = union.filter((item) => !used.has(item.key));
    const boundary = [...remaining].sort((left, right) => {
      const distance = (value: number) => Math.min(Math.abs(value - 65), Math.abs(value - 75));
      return distance(left.record.totalScore) - distance(right.record.totalScore)
        || hash(`${bundle.cell.cellId}|boundary|${left.key}`).localeCompare(hash(`${bundle.cell.cellId}|boundary|${right.key}`));
    })[0];
    used.add(boundary.key);
    const disagreement = remaining.filter((item) => !used.has(item.key)).sort((left, right) => {
      const diagnosticValue = (item: CellCandidate) => {
        const ranks = Object.values(item.ranks);
        return ranks.length === 1 ? 1_000 - ranks[0]! : Math.abs(ranks[0]! - ranks[1]!);
      };
      return diagnosticValue(right) - diagnosticValue(left)
        || hash(`${bundle.cell.cellId}|disagreement|${left.key}`)
          .localeCompare(hash(`${bundle.cell.cellId}|disagreement|${right.key}`));
    })[0];
    const selections = [
      ...representative.map((item) => ({ item, cohort: "representative" as const,
        stratum: "representative-deterministic-probability-sample",
        inclusionProbability: blindConfig.sampling.representativePerCell / union.length })),
      { item: boundary, cohort: "stress" as const, stratum: "stress-score-threshold-boundary",
        inclusionProbability: null },
      { item: disagreement, cohort: "stress" as const, stratum: "stress-arm-exclusivity-or-rank-gap",
        inclusionProbability: null },
    ];
    for (const selection of selections) {
      const packetId = `blind-v2-${hash(`${EXPERIMENT_CONFIG.runId}|${bundle.cell.cellId}|${selection.item.key}`)
        .slice(0, 24)}`;
      packets.push(packetFor(selection.item.record, bundle, packetId));
      mappings.push(mappingFor(selection.item, bundle, packetId, selection.cohort, selection.stratum,
        selection.inclusionProbability));
    }
  }
  if (packets.length !== blindConfig.sampling.total) {
    throw new Error(`Blind audit v2 sample has ${packets.length}; expected ${blindConfig.sampling.total}`);
  }
  return { packets, mappings };
}

function providerFamily(model: string): string {
  const normalized = model.toLocaleLowerCase("en-US");
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "anthropic";
  if (normalized.includes("openai") || normalized.includes("gpt") || normalized.includes("codex")) return "openai";
  if (normalized.includes("deepseek")) return "deepseek";
  if (normalized.includes("gemini") || normalized.includes("google")) return "google";
  return normalized.split("/")[0] ?? normalized;
}

function citationValidation(packet: BlindAuditV2Packet, output: BlindJudgeV2Output): CitationValidation {
  const allowed = new Set(packet.evidence.map((item) => item.evidenceId));
  let checkedClaims = 0;
  let validEvidenceIds = 0;
  let entailedClaims = 0;
  for (const dimension of dimensions) {
    const reasons = output.dimensionReasons.filter((reason) => reason.dimension === dimension);
    if (reasons.length !== 1) throw new Error(`${packet.packetId} must contain exactly one ${dimension} reason`);
    const citations = reasons[0].citations;
    if (output.dimensions[dimension] > 0 && citations.length === 0) checkedClaims += 1;
    for (const citation of citations) {
      checkedClaims += 1;
      const idValid = allowed.has(citation.evidenceId);
      if (idValid) validEvidenceIds += 1;
      if (idValid && (citation.support === "direct" || citation.support === "partial")) entailedClaims += 1;
    }
  }
  return { checkedClaims, validEvidenceIds, entailedClaims,
    idAlignmentRate: checkedClaims ? validEvidenceIds / checkedClaims : 1,
    entailmentRate: checkedClaims ? entailedClaims / checkedClaims : 1 };
}

function deterministicTotal(output: BlindJudgeV2Output): number {
  return dimensions.reduce((sum, dimension) => sum + output.dimensions[dimension], 0);
}

function combinedCitationValidation(decisions: BlindJudgeV2Decision[]): CitationValidation {
  const totals = decisions.reduce((sum, decision) => ({
    checkedClaims: sum.checkedClaims + decision.citationValidation.checkedClaims,
    validEvidenceIds: sum.validEvidenceIds + decision.citationValidation.validEvidenceIds,
    entailedClaims: sum.entailedClaims + decision.citationValidation.entailedClaims,
  }), { checkedClaims: 0, validEvidenceIds: 0, entailedClaims: 0 });
  return { ...totals,
    idAlignmentRate: totals.checkedClaims ? totals.validEvidenceIds / totals.checkedClaims : 1,
    entailmentRate: totals.checkedClaims ? totals.entailedClaims / totals.checkedClaims : 1 };
}

function callValidationError(packet: BlindAuditV2Packet, call: ProviderCall<BlindJudgeV2Output>): string | null {
  if (!call.output) return null;
  if (call.output.packetId !== packet.packetId) return "packetIdMismatch";
  if (call.output.externalSearchUsed) return "externalSearchUsed";
  if (call.output.externalKnowledgeUsed) return "externalKnowledgeUsed";
  if (dimensions.some((dimension) => call.output!.dimensionReasons
    .filter((reason) => reason.dimension === dimension).length !== 1)) return "dimensionReasonCardinalityInvalid";
  return null;
}

function costEventFor(packet: BlindAuditV2Packet, call: ProviderCall<BlindJudgeV2Output>,
  stage: "blind-judge-v2" | "blind-arbitrator-v2", judgeId: string,
  semanticValidationError = callValidationError(packet, call)): ExperimentCostEvent {
  const validOutput = Boolean(call.output) && !semanticValidationError;
  const discardedReason = call.requestError
    ? call.requestFailureKind === "timeout" ? "timeout"
      : call.requestFailureKind === "http" ? "providerHttpFailure"
        : call.requestFailureKind === "invalid-response" ? "providerResponseInvalid" : "transportFailure"
    : semanticValidationError ?? "schemaInvalid";
  return priceCostEvent({ eventId: `${packet.packetId}:${stage}:${judgeId}`, runId: EXPERIMENT_CONFIG.runId,
    ledger: "evaluation-overhead", arm: "shared-evaluation", stage,
    provider: providerFamily(call.actualModel) === "deepseek" ? "deepseek" : "openrouter",
    requestedModel: call.requestedModel, actualModel: call.actualModel, startedAt: call.startedAt,
    completedAt: call.completedAt, latencyMs: call.latencyMs, attempts: call.attempts, retries: call.retries,
    fallbackUsed: call.actualModel !== call.requestedModel, status: validOutput ? "completed" : "failed",
    usage: call.usage, accountCashCostUsd: call.accountCashCostUsd,
    volume: { inputItems: 1, rawOutputItems: call.requestError ? 0 : 1, validOutputItems: validOutput ? 1 : 0,
      downstreamUsedItems: validOutput ? 1 : 0,
      discardedReasonCounts: validOutput ? {} : { [discardedReason]: 1 } },
    notes: ["blind-audit-v2", "no web search", "arm/model/rank/unified score hidden",
      "output is consumed by consensus or conditional arbitration"] }, rateCard);
}

function decisionFromCall(packet: BlindAuditV2Packet, judgeId: string, call: ProviderCall<BlindJudgeV2Output>,
  stage: "blind-judge-v2" | "blind-arbitrator-v2"): BlindJudgeV2Decision {
  if (call.requestError) throw new Error(`${packet.packetId} ${judgeId} ${call.requestFailureKind ?? "request"} failure after ${call.attempts} attempt(s): ${call.requestError}`);
  if (!call.output) throw new Error(`${packet.packetId} ${judgeId} schema failure: ${call.parseError ?? "unknown"}`);
  const validationError = callValidationError(packet, call);
  if (validationError) throw new Error(`${packet.packetId} ${judgeId} semantic validation failure: ${validationError}`);
  const total = deterministicTotal(call.output);
  const output = { ...call.output, totalScore: total };
  const roleFamily = blindAuditRoleFamily(output.primaryRole);
  return { packetId: packet.packetId, judgeId, requestedModel: call.requestedModel, actualModel: call.actualModel,
    modelReportedTotal: call.output.totalScore, deterministicTotal: total, roleFamily,
    requestedCategoryFamilyMatch: roleFamily === packet.requestedRoleFamily,
    citationValidation: citationValidation(packet, output), output,
    costEvent: costEventFor(packet, call, stage, judgeId), raw: call.raw };
}

export async function judgeBlindPacketV2(packet: BlindAuditV2Packet, judgeId: string, model: string, options: {
  onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
} = {}): Promise<BlindJudgeV2Decision> {
  const call = await callBlindJudgeV2(packet as unknown as Record<string, unknown>, model);
  const costEvent = costEventFor(packet, call, "blind-judge-v2", judgeId);
  await options.onCostEvents?.([costEvent]);
  const decision = decisionFromCall(packet, judgeId, call, "blind-judge-v2");
  return { ...decision, costEvent };
}

export async function arbitrateBlindPacketV2(packet: BlindAuditV2Packet,
  judges: [BlindJudgeV2Decision, BlindJudgeV2Decision], arbitrationReasons: string[], model: string, options: {
    onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
  } = {}): Promise<BlindJudgeV2Decision> {
  const input = { packet, arbitrationReasons,
    judgeOutputs: judges.map((judge) => ({ judgeId: judge.judgeId, output: judge.output })) };
  const call = await callBlindArbitratorV2(input as unknown as Record<string, unknown>, model);
  const costEvent = costEventFor(packet, call, "blind-arbitrator-v2", "arbitrator");
  await options.onCostEvents?.([costEvent]);
  const decision = decisionFromCall(packet, "arbitrator", call, "blind-arbitrator-v2");
  return { ...decision, costEvent };
}

function mergeJudgeOutputs(left: BlindJudgeV2Decision, right: BlindJudgeV2Decision): BlindJudgeV2Output {
  const mergedDimensions = Object.fromEntries(dimensions.map((dimension) => [dimension,
    Math.round((left.output.dimensions[dimension] + right.output.dimensions[dimension]) / 2)])) as
    BlindJudgeV2Output["dimensions"];
  const dimensionReasons = dimensions.map((dimension) => {
    const leftReason = left.output.dimensionReasons.find((item) => item.dimension === dimension)!;
    const rightReason = right.output.dimensionReasons.find((item) => item.dimension === dimension)!;
    const citations = [...new Map([...leftReason.citations, ...rightReason.citations]
      .map((citation) => [`${citation.evidenceId}|${citation.claim}|${citation.support}`, citation])).values()]
      .slice(0, 12);
    return { dimension, reason: `${leftReason.reason} / ${rightReason.reason}`.slice(0, 500), citations };
  });
  const exactSubtypeConsensus = normalizedRole(left.output.primaryRole) === normalizedRole(right.output.primaryRole);
  return { packetId: left.packetId, externalSearchUsed: false, externalKnowledgeUsed: false,
    isRealOperatingCompany: left.output.isRealOperatingCompany,
    operatesInTargetMarket: left.output.operatesInTargetMarket,
    supportedRoles: [...new Set([...left.output.supportedRoles, ...right.output.supportedRoles])].slice(0, 8),
    primaryRole: exactSubtypeConsensus ? left.output.primaryRole : "Unresolved", dimensions: mergedDimensions,
    totalScore: dimensions.reduce((sum, dimension) => sum + mergedDimensions[dimension], 0),
    eligibility: left.output.eligibility, dimensionReasons,
    unsupportedOrContradictoryClaims: [...new Set([...left.output.unsupportedOrContradictoryClaims,
      ...right.output.unsupportedOrContradictoryClaims])].slice(0, 12) };
}

export function resolveBlindConsensusV2(packet: BlindAuditV2Packet,
  judges: [BlindJudgeV2Decision, BlindJudgeV2Decision], arbitrator?: BlindJudgeV2Decision): BlindConsensusV2Resolution {
  const [left, right] = judges;
  if (left.packetId !== packet.packetId || right.packetId !== packet.packetId) {
    throw new Error(`${packet.packetId} judge packet mismatch`);
  }
  if (left.actualModel === right.actualModel || providerFamily(left.actualModel) === providerFamily(right.actualModel)) {
    throw new Error(`${packet.packetId} requires two different model families and providers`);
  }
  const reasons: string[] = [];
  if (Math.abs(left.deterministicTotal - right.deterministicTotal)
    >= blindConfig.judging.arbitrationTriggers.minimumAbsoluteTotalScoreDifference) reasons.push("total-score-difference");
  if (left.roleFamily !== right.roleFamily) reasons.push("role-family-disagreement");
  if (left.output.isRealOperatingCompany !== right.output.isRealOperatingCompany) reasons.push("identity-disagreement");
  if (left.output.operatesInTargetMarket !== right.output.operatesInTargetMarket) reasons.push("target-market-disagreement");
  if (left.requestedCategoryFamilyMatch !== right.requestedCategoryFamilyMatch) reasons.push("requested-family-disagreement");
  if ((left.deterministicTotal >= blindConfig.qualification.scoreThreshold)
    !== (right.deterministicTotal >= blindConfig.qualification.scoreThreshold)) reasons.push("score-threshold-disagreement");
  if (left.output.eligibility !== right.output.eligibility) reasons.push("eligibility-disagreement");
  if (reasons.length && !arbitrator) return { status: "arbitration-required", arbitrationReasons: reasons };
  if (!reasons.length && arbitrator) throw new Error(`${packet.packetId} received unnecessary arbitration`);
  if (arbitrator && arbitrator.packetId !== packet.packetId) throw new Error(`${packet.packetId} arbitrator packet mismatch`);
  const exactSubtypeConsensus = normalizedRole(left.output.primaryRole) === normalizedRole(right.output.primaryRole);
  const output = arbitrator?.output ?? mergeJudgeOutputs(left, right);
  const roleFamily = arbitrator?.roleFamily ?? left.roleFamily;
  return { status: "resolved", decision: { packetId: packet.packetId,
    resolution: arbitrator ? "arbitrator" : "judge-average", arbitrationTriggered: reasons.length > 0,
    arbitrationReasons: reasons, deterministicTotal: deterministicTotal(output), roleFamily,
    requestedCategoryFamilyMatch: arbitrator?.requestedCategoryFamilyMatch ?? left.requestedCategoryFamilyMatch,
    exactSubtypeConsensus, citationValidation: arbitrator?.citationValidation ?? combinedCitationValidation(judges),
    output, judges, ...(arbitrator ? { arbitrator } : {}) } };
}

function safeRate(matches: number, total: number): number {
  return total ? matches / total : 0;
}

function cohortMetrics(cohort: BlindAuditV2Cohort, mappings: BlindAuditV2Mapping[],
  decisions: BlindConsensusV2Decision[]): BlindAuditV2CohortMetrics {
  const decisionById = new Map(decisions.map((item) => [item.packetId, item]));
  const pairs = mappings.filter((mapping) => mapping.cohort === cohort).map((mapping) => ({
    mapping, decision: decisionById.get(mapping.packetId),
  }));
  if (pairs.some((pair) => !pair.decision)) throw new Error(`${cohort} cohort is missing decisions`);
  const complete = pairs as Array<{ mapping: BlindAuditV2Mapping; decision: BlindConsensusV2Decision }>;
  const componentAgreement = (key: keyof BlindAuditV2QualificationComponents) => complete.filter(({ mapping, decision }) => {
    const blind = qualification(decision.output.isRealOperatingCompany, decision.output.operatesInTargetMarket,
      decision.requestedCategoryFamilyMatch, decision.deterministicTotal, decision.output.eligibility);
    return blind[key] === mapping.unifiedQualification[key];
  }).length;
  const roleFamilyMatches = complete.filter(({ mapping, decision }) =>
    mapping.unifiedRoleFamily === decision.roleFamily).length;
  const exactMatches = complete.filter(({ mapping, decision }) => normalizedRole(mapping.unifiedPrimaryRole)
    === normalizedRole(decision.output.primaryRole)).length;
  const unifiedScores = complete.map(({ mapping }) => mapping.unifiedScore);
  const blindScores = complete.map(({ decision }) => decision.deterministicTotal);
  const biases = blindScores.map((score, index) => score - unifiedScores[index]);
  const cellIds = [...new Set(complete.map(({ mapping }) => mapping.cellId))];
  const cells = cellIds.map((cellId) => {
    const cellPairs = complete.filter(({ mapping }) => mapping.cellId === cellId);
    const cellBiases = cellPairs.map(({ mapping, decision }) => decision.deterministicTotal - mapping.unifiedScore);
    return { cellId, sampleSize: cellPairs.length,
      spearman: spearmanCorrelation(cellPairs.map(({ mapping }) => mapping.unifiedScore),
        cellPairs.map(({ decision }) => decision.deterministicTotal)),
      roleFamilyAgreement: safeRate(cellPairs.filter(({ mapping, decision }) =>
        mapping.unifiedRoleFamily === decision.roleFamily).length, cellPairs.length),
      qualifiedAgreement: safeRate(cellPairs.filter(({ mapping, decision }) => {
        const blind = qualification(decision.output.isRealOperatingCompany, decision.output.operatesInTargetMarket,
          decision.requestedCategoryFamilyMatch, decision.deterministicTotal, decision.output.eligibility);
        return blind.qualified === mapping.unifiedQualification.qualified;
      }).length, cellPairs.length),
      meanAbsoluteError: safeRate(cellBiases.reduce((sum, value) => sum + Math.abs(value), 0), cellBiases.length) };
  });
  const citationTotals = complete.reduce((totals, { decision }) => ({
    checked: totals.checked + decision.citationValidation.checkedClaims,
    ids: totals.ids + decision.citationValidation.validEvidenceIds,
    entailed: totals.entailed + decision.citationValidation.entailedClaims,
  }), { checked: 0, ids: 0, entailed: 0 });
  const interJudgeRoleFamily = complete.filter(({ decision }) =>
    decision.judges[0].roleFamily === decision.judges[1].roleFamily).length;
  const interJudgeExactRole = complete.filter(({ decision }) => normalizedRole(decision.judges[0].output.primaryRole)
    === normalizedRole(decision.judges[1].output.primaryRole)).length;
  const interJudgeQualified = complete.filter(({ decision }) => {
    const left = qualification(decision.judges[0].output.isRealOperatingCompany,
      decision.judges[0].output.operatesInTargetMarket, decision.judges[0].requestedCategoryFamilyMatch,
      decision.judges[0].deterministicTotal, decision.judges[0].output.eligibility);
    const right = qualification(decision.judges[1].output.isRealOperatingCompany,
      decision.judges[1].output.operatesInTargetMarket, decision.judges[1].requestedCategoryFamilyMatch,
      decision.judges[1].deterministicTotal, decision.judges[1].output.eligibility);
    return left.qualified === right.qualified;
  }).length;
  const interJudgeScoreDifference = complete.reduce((sum, { decision }) => sum
    + Math.abs(decision.judges[0].deterministicTotal - decision.judges[1].deterministicTotal), 0);
  return { sampleSize: complete.length, roleFamilyAgreement: safeRate(roleFamilyMatches, complete.length),
    exactPrimaryRoleAgreement: safeRate(exactMatches, complete.length), qualificationAgreement: {
      identity: safeRate(componentAgreement("identity"), complete.length),
      targetMarket: safeRate(componentAgreement("targetMarket"), complete.length),
      requestedFamily: safeRate(componentAgreement("requestedFamily"), complete.length),
      scoreThreshold: safeRate(componentAgreement("scoreThreshold"), complete.length),
      outputEligibility: safeRate(componentAgreement("outputEligibility"), complete.length),
      qualified: safeRate(componentAgreement("qualified"), complete.length),
    }, withinCellMacroSpearman: safeRate(cells.reduce((sum, cell) => sum + cell.spearman, 0), cells.length),
    pooledSpearman: spearmanCorrelation(unifiedScores, blindScores),
    meanBias: safeRate(biases.reduce((sum, value) => sum + value, 0), biases.length),
    meanAbsoluteError: safeRate(biases.reduce((sum, value) => sum + Math.abs(value), 0), biases.length),
    citationIdAlignment: citationTotals.checked ? citationTotals.ids / citationTotals.checked : 1,
    citationEntailment: citationTotals.checked ? citationTotals.entailed / citationTotals.checked : 1,
    interJudge: { roleFamilyAgreement: safeRate(interJudgeRoleFamily, complete.length),
      exactPrimaryRoleAgreement: safeRate(interJudgeExactRole, complete.length),
      qualifiedStatusAgreement: safeRate(interJudgeQualified, complete.length),
      meanAbsoluteScoreDifference: safeRate(interJudgeScoreDifference, complete.length) }, cells };
}

export function calculateBlindAuditV2Metrics(mappings: BlindAuditV2Mapping[],
  decisions: BlindConsensusV2Decision[]): BlindAuditV2Metrics {
  if (decisions.length !== mappings.length) throw new Error(`Blind audit v2 has ${decisions.length}/${mappings.length} decisions`);
  if (new Set(decisions.map((item) => item.packetId)).size !== decisions.length) {
    throw new Error("Blind audit v2 contains duplicate decisions");
  }
  const representative = cohortMetrics("representative", mappings, decisions);
  const stress = cohortMetrics("stress", mappings, decisions);
  const thresholds = blindConfig.mainGates;
  const gates = {
    roleFamilyAgreement: { passed: representative.roleFamilyAgreement >= thresholds.roleFamilyAgreementMinimum,
      actual: representative.roleFamilyAgreement, threshold: thresholds.roleFamilyAgreementMinimum },
    qualifiedStatusAgreement: { passed: representative.qualificationAgreement.qualified
      >= thresholds.qualifiedStatusAgreementMinimum, actual: representative.qualificationAgreement.qualified,
      threshold: thresholds.qualifiedStatusAgreementMinimum },
    withinCellMacroSpearman: { passed: representative.withinCellMacroSpearman
      >= thresholds.withinCellMacroSpearmanMinimum, actual: representative.withinCellMacroSpearman,
      threshold: thresholds.withinCellMacroSpearmanMinimum },
    absoluteMeanBias: { passed: Math.abs(representative.meanBias) <= thresholds.maximumAbsoluteMeanBias,
      actual: Math.abs(representative.meanBias), threshold: thresholds.maximumAbsoluteMeanBias },
    meanAbsoluteError: { passed: representative.meanAbsoluteError <= thresholds.maximumMeanAbsoluteError,
      actual: representative.meanAbsoluteError, threshold: thresholds.maximumMeanAbsoluteError },
    citationIdAlignment: { passed: representative.citationIdAlignment >= thresholds.citationIdAlignmentMinimum,
      actual: representative.citationIdAlignment, threshold: thresholds.citationIdAlignmentMinimum },
    citationEntailment: { passed: representative.citationEntailment >= thresholds.citationEntailmentMinimum,
      actual: representative.citationEntailment, threshold: thresholds.citationEntailmentMinimum },
  };
  const arbitrationCount = decisions.filter((item) => item.arbitrationTriggered).length;
  const arbitrationRate = safeRate(arbitrationCount, decisions.length);
  const arbitrationCostUsd = decisions.reduce((sum, item) =>
    sum + (item.arbitrator?.costEvent.budgetCostUsd ?? 0), 0);
  const warnings = arbitrationRate > blindConfig.judging.maximumArbitrationRateWarning
    ? [`Arbitration rate ${arbitrationRate.toFixed(3)} exceeds warning threshold ${blindConfig.judging.maximumArbitrationRateWarning}.`]
    : [];
  return { protocolVersion: "2.0.0", sampleSize: decisions.length, representative, stress,
    arbitrationRate, arbitrationCount, arbitrationCostUsd, gates, warnings,
    passed: Object.values(gates).every((gate) => gate.passed) };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number,
  worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  let failure: unknown;
  const run = async () => {
    while (!failure && cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        output[index] = await worker(items[index], index);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run));
  if (failure) throw failure;
  return output;
}

export async function executeBlindAuditV2(sample: { packets: BlindAuditV2Packet[];
  mappings: BlindAuditV2Mapping[] }, options: {
    judgeModels?: [string, string];
    arbitratorModel?: string;
    concurrency?: number;
    cache?: BlindAuditV2DecisionCache;
    onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
    authorizePaidCall: (call: { packetId: string; stage: "judge" | "arbitrator";
      judgeId: string; requestedModel: string }) => Promise<void> | void;
    judge?: typeof judgeBlindPacketV2;
    arbitrate?: typeof arbitrateBlindPacketV2;
  }): Promise<{ decisions: BlindConsensusV2Decision[]; metrics: BlindAuditV2Metrics;
    cacheStats: { reads: number; hits: number; misses: number; writes: number } }> {
  if (sample.packets.length !== sample.mappings.length) throw new Error("Blind audit v2 packet/mapping count mismatch");
  const mappingIds = new Set(sample.mappings.map((mapping) => mapping.packetId));
  if (mappingIds.size !== sample.mappings.length
    || sample.packets.some((packet) => !mappingIds.has(packet.packetId))) {
    throw new Error("Blind audit v2 packet/mapping identity mismatch");
  }
  const judgeModels = options.judgeModels ?? [blindConfig.judging.judgeA, blindConfig.judging.judgeB];
  if (providerFamily(judgeModels[0]) === providerFamily(judgeModels[1])) {
    throw new Error("Blind audit v2 judge models must use different provider/model families");
  }
  const arbitratorModel = options.arbitratorModel ?? blindConfig.judging.arbitrator;
  const judge = options.judge ?? judgeBlindPacketV2;
  const arbitrate = options.arbitrate ?? arbitrateBlindPacketV2;
  const cacheStats = { reads: 0, hits: 0, misses: 0, writes: 0 };
  const cachedDecision = async (cacheKey: string, packetId: string, judgeId: string, model: string) => {
    if (!options.cache) return null;
    cacheStats.reads += 1;
    const cached = await options.cache.get(cacheKey);
    if (!cached) {
      cacheStats.misses += 1;
      return null;
    }
    if (cached.packetId !== packetId || cached.judgeId !== judgeId || cached.requestedModel !== model) {
      throw new Error(`${packetId} invalid ${judgeId} cache entry`);
    }
    cacheStats.hits += 1;
    return cached;
  };
  const getOrJudge = async (packet: BlindAuditV2Packet, judgeId: string, model: string) => {
    const cacheKey = blindAuditV2DecisionCacheKey(packet, judgeId, model);
    const cached = await cachedDecision(cacheKey, packet.packetId, judgeId, model);
    if (cached) return cached;
    await options.authorizePaidCall({ packetId: packet.packetId, stage: "judge", judgeId,
      requestedModel: model });
    const generated = await judge(packet, judgeId, model, { onCostEvents: options.onCostEvents });
    if (options.cache) {
      await options.cache.set(cacheKey, generated);
      cacheStats.writes += 1;
    }
    return generated;
  };
  const decisions = await mapConcurrent(sample.packets, options.concurrency ?? 4, async (packet) => {
    const judges = await Promise.all([
      getOrJudge(packet, "judge-a", judgeModels[0]),
      getOrJudge(packet, "judge-b", judgeModels[1]),
    ]) as [BlindJudgeV2Decision, BlindJudgeV2Decision];
    const initial = resolveBlindConsensusV2(packet, judges);
    if (initial.status === "resolved") return initial.decision;
    const cacheKey = blindAuditV2DecisionCacheKey(packet, "arbitrator", arbitratorModel, judges);
    let arbitrator = await cachedDecision(cacheKey, packet.packetId, "arbitrator", arbitratorModel);
    if (!arbitrator) {
      await options.authorizePaidCall({ packetId: packet.packetId, stage: "arbitrator", judgeId: "arbitrator",
        requestedModel: arbitratorModel });
      arbitrator = await arbitrate(packet, judges, initial.arbitrationReasons, arbitratorModel,
        { onCostEvents: options.onCostEvents });
      if (options.cache) {
        await options.cache.set(cacheKey, arbitrator);
        cacheStats.writes += 1;
      }
    }
    const resolved = resolveBlindConsensusV2(packet, judges, arbitrator);
    if (resolved.status !== "resolved") throw new Error(`${packet.packetId} arbitration did not resolve`);
    return resolved.decision;
  });
  return { decisions, metrics: calculateBlindAuditV2Metrics(sample.mappings, decisions), cacheStats };
}
