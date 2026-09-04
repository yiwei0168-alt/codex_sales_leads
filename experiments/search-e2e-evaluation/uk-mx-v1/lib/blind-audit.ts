import { createHash } from "node:crypto";

import rateCardJson from "../config/official-rate-card.v1.json";
import { priceCostEvent, type ExperimentCostEvent, type ExperimentRateCard } from "./cost-ledger";
import { spearmanCorrelation } from "./evaluation-metrics";
import { EXPERIMENT_CONFIG, primaryRoleMatchesCategory, type ExperimentCategoryId } from "./experiment";
import { callClaudeBlindJudge } from "./provider-clients";
import type { BlindJudgeOutput } from "./runtime-schemas";
import { identityAliases, type FrozenCellBundle, type UnifiedCompanyRecord } from "./unified-evaluation";

const rateCard = rateCardJson as ExperimentRateCard;

const cudyBrief = "Cudy provides accessible, reliable, easy-to-deploy networking for consumers, homes, SMBs, hospitality, education, retail, light industry and ISP/FWA. Relevant families include Wi-Fi routers/mesh, 4G/5G FWA, AP/controller, Ethernet/PoE/fibre switching, gateways/VPN, outdoor wireless and xPON/ONT. Positioning is value and SMB rather than premium-enterprise-only.";

export interface BlindPacket {
  packetId: string;
  targetMarket: { countryCode: string; countryName: string };
  requestedCategory: ExperimentCategoryId;
  cudyBrief: string;
  company: { name: string; domain: string; officialWebsiteUrl: string };
  evidence: Array<{ evidenceId: string; sourceType: string; url: string; title: string; excerpt: string }>;
}

export interface BlindPacketMapping {
  packetId: string;
  companyKey: string;
  cellId: string;
  stratum: string;
  presentInArms: string[];
  unifiedPrimaryRole: string;
  unifiedScore: number;
  unifiedQualified: boolean;
}

export interface BlindDecision {
  packetId: string;
  requestedModel: string;
  actualModel: string;
  modelReportedTotal: number;
  deterministicTotal: number;
  output: BlindJudgeOutput;
  costEvent: ExperimentCostEvent;
  raw?: unknown;
}

export interface BlindAuditMetrics {
  sampleSize: number;
  primaryRoleAgreement: number;
  qualifiedStatusAgreement: number;
  spearman: number;
  meanBias: number;
  meanAbsoluteError: number;
  citationAlignment: number;
  gates: Record<string, { passed: boolean; actual: number; threshold: number }>;
  passed: boolean;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function recordForSlot(bundle: FrozenCellBundle, arm: "gemini-native" | "product-e2e", rank: number,
  records: Map<string, UnifiedCompanyRecord>, aliasToCompanyKey: Map<string, string>) {
  const candidate = arm === "gemini-native" ? bundle.control.finalCandidates[rank - 1]
    : bundle.product.finalCandidates[rank - 1];
  if (!candidate) return null;
  const name = candidate.companyName;
  const website = "officialWebsite" in candidate ? candidate.officialWebsite : candidate.officialWebsiteUrl;
  const key = identityAliases(bundle.cell.countryCode, name, website)
    .map((alias) => aliasToCompanyKey.get(alias)).find(Boolean);
  const record = key ? records.get(key) : undefined;
  return record ? { key: key!, record, rank, arm } : null;
}

function packetFor(record: UnifiedCompanyRecord, bundle: FrozenCellBundle, packetId: string): BlindPacket {
  return { packetId, targetMarket: { countryCode: bundle.cell.countryCode, countryName: bundle.cell.countryName },
    requestedCategory: bundle.cell.categoryId, cudyBrief,
    company: { name: record.companyName, domain: record.domain, officialWebsiteUrl: record.officialWebsiteUrl },
    evidence: record.evidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType,
      url: item.url, title: item.title.slice(0, 300), excerpt: item.excerpt.slice(0, 800) })) };
}

export function buildBlindSample(bundles: FrozenCellBundle[], records: Map<string, UnifiedCompanyRecord>,
  aliasToCompanyKey: Map<string, string>, targetSize: 32 | 64): {
    packets: BlindPacket[]; mappings: BlindPacketMapping[];
  } {
  const packets: BlindPacket[] = [];
  const mappings: BlindPacketMapping[] = [];
  const selected = new Set<string>();
  const cellData: Array<{ bundle: FrozenCellBundle;
    byArm: Record<"gemini-native" | "product-e2e", Array<NonNullable<ReturnType<typeof recordForSlot>>>>;
    union: Array<NonNullable<ReturnType<typeof recordForSlot>>>;
    selectedForCell: Array<{ item: NonNullable<ReturnType<typeof recordForSlot>>; stratum: string }> }> = [];
  for (const bundle of bundles) {
    const byArm = Object.fromEntries((["gemini-native", "product-e2e"] as const).map((arm) => [arm,
      Array.from({ length: 30 }, (_, index) => recordForSlot(bundle, arm, index + 1, records, aliasToCompanyKey))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))])) as Record<"gemini-native" | "product-e2e",
          Array<NonNullable<ReturnType<typeof recordForSlot>>>>;
    const controlMap = new Map(byArm["gemini-native"].map((item) => [item.key, item]));
    const productMap = new Map(byArm["product-e2e"].map((item) => [item.key, item]));
    const union = [...new Map([...byArm["gemini-native"], ...byArm["product-e2e"]]
      .map((item) => [item.key, item])).values()];
    const strata = [
      { name: "gemini-only-high-rank", values: byArm["gemini-native"].filter((item) => !productMap.has(item.key)) },
      { name: "product-only-high-rank", values: byArm["product-e2e"].filter((item) => !controlMap.has(item.key)) },
      { name: "score-boundary", values: [...union].sort((a, b) => {
        const distance = (value: number) => Math.min(Math.abs(value - 65), Math.abs(value - 75));
        return distance(a.record.totalScore) - distance(b.record.totalScore)
          || hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|${bundle.cell.cellId}|${a.key}`)
            .localeCompare(hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|${bundle.cell.cellId}|${b.key}`));
      }) },
      { name: "overlap-rank-gap", values: byArm["gemini-native"].filter((item) => productMap.has(item.key))
        .sort((a, b) => Math.abs((productMap.get(b.key)?.rank ?? b.rank) - b.rank)
          - Math.abs((productMap.get(a.key)?.rank ?? a.rank) - a.rank)) },
    ];
    const selectedForCell: Array<{ item: (typeof union)[number]; stratum: string }> = [];
    for (const stratum of strata) {
      const item = stratum.values.find((candidate) => !selected.has(candidate.key));
      if (item) {
        selected.add(item.key);
        selectedForCell.push({ item, stratum: stratum.name });
      }
    }
    const fallback = union.filter((item) => !selected.has(item.key)).sort((a, b) =>
      hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|fallback|${bundle.cell.cellId}|${a.key}`)
        .localeCompare(hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|fallback|${bundle.cell.cellId}|${b.key}`)));
    while (selectedForCell.length < 4 && fallback.length > 0) {
      const item = fallback.shift()!;
      selected.add(item.key);
      selectedForCell.push({ item, stratum: selectedForCell.length < 4 ? "deterministic-cell-replacement"
        : "expanded-deterministic-cell-sample" });
    }
    if (selectedForCell.length !== 4) {
      throw new Error(`${bundle.cell.cellId} has only ${selectedForCell.length} unique blind-audit candidates; 4 required`);
    }
    cellData.push({ bundle, byArm, union, selectedForCell });
  }
  if (targetSize === 64) {
    for (const data of cellData) {
      const fallback = data.union.filter((item) => !selected.has(item.key)).sort((a, b) =>
        hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|expanded|${data.bundle.cell.cellId}|${a.key}`)
          .localeCompare(hash(`${EXPERIMENT_CONFIG.bootstrap.seed}|expanded|${data.bundle.cell.cellId}|${b.key}`)));
      while (data.selectedForCell.length < 8 && fallback.length > 0) {
        const item = fallback.shift()!;
        selected.add(item.key);
        data.selectedForCell.push({ item, stratum: "expanded-deterministic-cell-sample" });
      }
      if (data.selectedForCell.length !== 8) {
        throw new Error(`${data.bundle.cell.cellId} has only ${data.selectedForCell.length} unique blind-audit candidates; 8 required`);
      }
    }
  }
  for (const { bundle, byArm, selectedForCell } of cellData) {
    for (const { item, stratum } of selectedForCell) {
      const packetId = `blind-${hash(`${EXPERIMENT_CONFIG.runId}|${bundle.cell.cellId}|${item.key}`).slice(0, 24)}`;
      packets.push(packetFor(item.record, bundle, packetId));
      const requestedCategoryMatch = primaryRoleMatchesCategory(item.record.primaryRole, bundle.cell.categoryId);
      mappings.push({ packetId, companyKey: item.key, cellId: bundle.cell.cellId, stratum,
        presentInArms: (["gemini-native", "product-e2e"] as const).filter((arm) => byArm[arm]
          .some((candidate) => candidate.key === item.key)), unifiedPrimaryRole: item.record.primaryRole,
        unifiedScore: item.record.totalScore, unifiedQualified: item.record.isRealOperatingCompany
          && item.record.operatesInTargetMarket && requestedCategoryMatch && item.record.totalScore >= 65 });
    }
  }
  if (packets.length !== targetSize) throw new Error(`Blind sample has ${packets.length}; expected ${targetSize}`);
  return { packets, mappings };
}

export async function judgeBlindPacket(packet: BlindPacket, model: string, options: {
  onCostEvents?: (events: ExperimentCostEvent[]) => Promise<void> | void;
} = {}): Promise<BlindDecision> {
  const call = await callClaudeBlindJudge(packet as unknown as Record<string, unknown>, model);
  const discardedReason = call.requestError
    ? call.requestFailureKind === "timeout" ? "timeout"
      : call.requestFailureKind === "http" ? "providerHttpFailure"
        : call.requestFailureKind === "invalid-response" ? "providerResponseInvalid" : "transportFailure"
    : "schemaInvalid";
  const costEvent = priceCostEvent({ eventId: `${packet.packetId}:blind-judge`, runId: EXPERIMENT_CONFIG.runId,
    ledger: "evaluation-overhead", arm: "shared-evaluation", stage: "blind-judge", provider: "openrouter",
    requestedModel: call.requestedModel, actualModel: call.actualModel, startedAt: call.startedAt,
    completedAt: call.completedAt, latencyMs: call.latencyMs, attempts: call.attempts, retries: call.retries,
    fallbackUsed: call.actualModel !== call.requestedModel, status: call.output ? "completed" : "failed",
    usage: call.usage, accountCashCostUsd: call.accountCashCostUsd,
    volume: { inputItems: 1, rawOutputItems: call.requestError ? 0 : 1,
      validOutputItems: call.output ? 1 : 0,
      downstreamUsedItems: call.output ? 1 : 0, discardedReasonCounts: call.output ? {} : { [discardedReason]: 1 } },
    notes: ["blind packet; no web search; arm/model/rank/unified score hidden"] }, rateCard);
  await options.onCostEvents?.([costEvent]);
  if (call.requestError) {
    throw new Error(`${packet.packetId} blind judge ${call.requestFailureKind ?? "request"} failure after ${call.attempts} attempt(s): ${call.requestError}`);
  }
  if (!call.output) throw new Error(`${packet.packetId} blind judge schema failure: ${call.parseError ?? "unknown"}`);
  const deterministicTotal = Object.values(call.output.dimensions).reduce((sum, value) => sum + value, 0);
  const allowedEvidenceIds = new Set(packet.evidence.map((item) => item.evidenceId));
  const referencesAlign = call.output.dimensionReasons.every((reason) => reason.evidenceIds
    .every((evidenceId) => allowedEvidenceIds.has(evidenceId)));
  return { packetId: packet.packetId, requestedModel: call.requestedModel, actualModel: call.actualModel,
    modelReportedTotal: call.output.totalScore, deterministicTotal,
    output: { ...call.output, totalScore: deterministicTotal,
      citationAlignment: call.output.citationAlignment && referencesAlign }, costEvent, raw: call.raw };
}

function normalizedRole(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

export function calculateBlindAuditMetrics(mappings: BlindPacketMapping[], decisions: BlindDecision[]): BlindAuditMetrics {
  const mappingById = new Map(mappings.map((item) => [item.packetId, item]));
  const pairs = decisions.map((decision) => ({ decision, mapping: mappingById.get(decision.packetId) }))
    .filter((item): item is { decision: BlindDecision; mapping: BlindPacketMapping } => Boolean(item.mapping));
  if (pairs.length !== mappings.length) throw new Error(`Blind audit has ${pairs.length}/${mappings.length} decisions`);
  const roleAgreement = pairs.filter(({ decision, mapping }) => normalizedRole(decision.output.primaryRole)
    === normalizedRole(mapping.unifiedPrimaryRole)).length / pairs.length;
  const qualifiedAgreement = pairs.filter(({ decision, mapping }) => {
    const blindQualified = decision.output.isRealOperatingCompany && decision.output.operatesInTargetMarket
      && decision.output.requestedCategoryMatch && decision.deterministicTotal >= 65;
    return blindQualified === mapping.unifiedQualified;
  }).length / pairs.length;
  const unifiedScores = pairs.map(({ mapping }) => mapping.unifiedScore);
  const blindScores = pairs.map(({ decision }) => decision.deterministicTotal);
  const biases = blindScores.map((score, index) => score - unifiedScores[index]);
  const meanBias = biases.reduce((sum, value) => sum + value, 0) / biases.length;
  const meanAbsoluteError = biases.reduce((sum, value) => sum + Math.abs(value), 0) / biases.length;
  const citationAlignment = pairs.filter(({ decision }) => decision.output.citationAlignment).length / pairs.length;
  const spearman = spearmanCorrelation(unifiedScores, blindScores);
  const config = EXPERIMENT_CONFIG.blindAudit;
  const gates = {
    primaryRoleAgreement: { passed: roleAgreement >= config.primaryRoleAgreementMinimum,
      actual: roleAgreement, threshold: config.primaryRoleAgreementMinimum },
    qualifiedStatusAgreement: { passed: qualifiedAgreement >= config.qualifiedStatusAgreementMinimum,
      actual: qualifiedAgreement, threshold: config.qualifiedStatusAgreementMinimum },
    spearman: { passed: spearman >= config.spearmanMinimum, actual: spearman, threshold: config.spearmanMinimum },
    absoluteMeanBias: { passed: Math.abs(meanBias) <= config.maximumAbsoluteMeanBias,
      actual: Math.abs(meanBias), threshold: config.maximumAbsoluteMeanBias },
    meanAbsoluteError: { passed: meanAbsoluteError <= config.maximumMeanAbsoluteError,
      actual: meanAbsoluteError, threshold: config.maximumMeanAbsoluteError },
    citationAlignment: { passed: citationAlignment >= config.citationAlignmentMinimum,
      actual: citationAlignment, threshold: config.citationAlignmentMinimum },
  };
  return { sampleSize: pairs.length, primaryRoleAgreement: roleAgreement,
    qualifiedStatusAgreement: qualifiedAgreement, spearman, meanBias, meanAbsoluteError, citationAlignment,
    gates, passed: Object.values(gates).every((gate) => gate.passed) };
}
