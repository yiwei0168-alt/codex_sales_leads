import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  potentialFitScore,
  validatePotentialPartnerAssessment,
  type AuditRiskFlag,
  type PotentialFitDimensions,
  type PotentialPartnerAssessment,
} from "../lib/codex-audit";

type Category = "tier1_distributor" | "reseller" | "retailer" | "si";
type Submission = { blindRunId: string; answerRank: number; claimedCategory: Category | "unclear" };
type PacketCandidate = {
  blindCandidateId: string;
  companyName: string;
  mergedOfficialWebsiteUrls: string[];
  submissions: Submission[];
};
type SearchResult = { title: string; url: string; content: string; score: number };
type EvidenceItem = {
  blindCandidateId: string;
  companyName: string;
  results: SearchResult[];
  creditsUsed: number;
  error: string | null;
};
type CalibratedCandidate = {
  assessment: PotentialPartnerAssessment;
  primaryCategory: Category | "unclear";
  supportedCategories: Category[];
  categoryConfidence: "strong" | "medium" | "weak";
};

const root = path.resolve("experiments/global-model-lead-benchmark");
const working = path.join(root, "reviews", "working");
const reports = path.join(root, "reports");
const packet = JSON.parse(await readFile(path.join(working, "evidence-packet.local.json"), "utf8")) as {
  protocolVersion: string;
  occurrenceCount: number;
  candidates: PacketCandidate[];
};
const identityMap = JSON.parse(await readFile(path.join(working, "identity-map.local.json"), "utf8")) as {
  runs: Array<{ filename: string; providerId: string; modelId: string; repetition: number; blindRunId: string }>;
};
const evidenceDocument = JSON.parse(await readFile(path.join(working, "v4-independent-evidence.local.json"), "utf8")) as {
  totalCredits: number;
  estimatedCostUsdPayAsYouGo: number;
  failedCandidates: number;
  candidates: EvidenceItem[];
};
const providerDocument = JSON.parse(await readFile(path.join(root, "config/providers.json"), "utf8")) as {
  providers: Record<string, { displayName: string; model: { modelId: string } }>;
};
if (packet.protocolVersion !== "native-search-four-channel-categories-v4") throw new Error("Expected v4 review packet");
if (evidenceDocument.candidates.length !== packet.candidates.length) throw new Error("Independent evidence collection is incomplete");

const legalAndGeneric = new Set(["gmbh", "group", "deutschland", "germany", "system", "systems", "technology", "technologies", "computer", "computers", "distribution", "holding", "solutions", "international"]);
const tokens = (value: string): string[] => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").split(/\s+/)
  .filter((token) => token.length >= 3 && !legalAndGeneric.has(token));
const domain = (value: string): string | null => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
};
const containsAny = (text: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(text));
const countGroups = (text: string, groups: RegExp[][]): number => groups.filter((group) => containsAny(text, group)).length;

const rolePatterns: Record<Category, RegExp[]> = {
  tier1_distributor: [/\bdistribut/i, /\bvad\b/i, /wholesal/i, /großhandel/i, /grosshandel/i, /importeur/i, /channel partners?/i],
  reseller: [/\breseller/i, /\bvar\b/i, /fachhändler/i, /fachhaendler/i, /dealer/i, /wiederverkäufer/i],
  retailer: [/\bretail/i, /einzelhandel/i, /online.?shop/i, /e-?commerce/i, /consumer electronics/i, /store\b/i],
  si: [/system integrat/i, /systemhaus/i, /managed service/i, /it services/i, /network integrat/i, /lösungen/i],
};
const productGroups: RegExp[][] = [
  [/\bwi-?fi\b/i, /\bwlan\b/i, /wireless/i], [/router/i, /gateway/i], [/switch(?:es|ing)?\b/i, /ethernet/i],
  [/\bpoe\b/i], [/access point/i, /\bap\b/i], [/4g/i, /5g/i, /\bcpe\b/i], [/fiber/i, /fibre/i, /glasfaser/i, /optical/i],
  [/industrial/i, /industrie/i, /\bot\b/i], [/network/i, /netzwerk/i], [/telecom/i, /kommunikation/i],
];

function assess(candidate: PacketCandidate, evidence: EvidenceItem): CalibratedCandidate {
  const evidenceText = evidence.results.map((result) => `${result.title}\n${result.content}\n${result.url}`).join("\n");
  const lower = evidenceText.toLowerCase();
  const companyTokens = tokens(candidate.companyName);
  const submittedDomains = candidate.mergedOfficialWebsiteUrls.map(domain).filter((value): value is string => Boolean(value));
  const resultDomains = evidence.results.map((result) => domain(result.url)).filter((value): value is string => Boolean(value));
  const officialDomainMatch = submittedDomains.some((submitted) => resultDomains.some((result) => result === submitted || result.endsWith(`.${submitted}`)));
  const matchedTokens = companyTokens.filter((token) => lower.includes(token));
  const nameMatch = companyTokens.length === 0 ? false : matchedTokens.length >= Math.max(1, Math.ceil(companyTokens.length * 0.5));
  const companyExists = evidence.results.length > 0 && (officialDomainMatch || nameMatch);
  const targetCountryPresence = companyExists && (containsAny(lower, [/[.]de\b/i, /\bgermany\b/i, /\bgerman\b/i, /deutschland/i, /berlin/i, /münchen/i, /munich/i, /hamburg/i, /frankfurt/i, /düsseldorf/i, /köln/i, /stuttgart/i, /bochum/i, /wiesbaden/i])
    || /\bgmbh\b/i.test(candidate.companyName));
  const roleScores = Object.fromEntries(Object.entries(rolePatterns).map(([category, patterns]) => [category, patterns.filter((pattern) => pattern.test(evidenceText)).length])) as Record<Category, number>;
  const orderedRoles = (Object.entries(roleScores) as Array<[Category, number]>).sort((left, right) => right[1] - left[1]);
  const primaryCategory = orderedRoles[0][1] > 0 ? orderedRoles[0][0] : "unclear";
  const primaryRoleScore = orderedRoles[0][1];
  const supportedCategories = orderedRoles.filter(([, score]) => score > 0).map(([category]) => category);
  const channelRelevant = primaryCategory !== "unclear" && countGroups(evidenceText, productGroups) >= 1;
  const identityEvidenceCount = evidence.results.filter((result) => {
    const text = `${result.title} ${result.content}`.toLowerCase();
    return companyTokens.some((token) => text.includes(token));
  }).length;
  const sufficientEvidence = companyExists && targetCountryPresence && channelRelevant && (officialDomainMatch || identityEvidenceCount >= 2);
  const independentProspect = !/^cudy\b/i.test(candidate.companyName)
    && !/(?:cudy official|cudy store|cudy technology)/i.test(candidate.companyName);
  const evidenceGates = {
    submittedIdentityUsable: companyTokens.length > 0,
    companyExists,
    targetCountryPresence,
    relevantChannel: channelRelevant,
    sufficientEvidence,
    independentProspect,
  };
  const gatesPass = Object.values(evidenceGates).every(Boolean);
  const productBreadth = countGroups(evidenceText, productGroups);
  const scaleSignals = countGroups(evidenceText, [[/nationwide/i, /across germany/i, /bundesweit/i], [/europe/i, /global/i, /international/i], [/thousand/i, /million/i, /leading/i, /largest/i], [/locations/i, /standorte/i, /branches/i]]);
  const executionSignals = countGroups(evidenceText, [[/logistics/i, /warehouse/i, /supply chain/i], [/training/i, /academy/i], [/support/i, /service/i], [/consult/i, /planning/i], [/installation/i, /deployment/i], [/financ/i, /credit/i]]);
  const baseChannel: Record<Category, number> = { tier1_distributor: 25, reseller: 20, retailer: 19, si: 21 };
  const dimensions: PotentialFitDimensions | null = gatesPass ? {
    channelRoleAndCustomerAccess: Math.min(30, (primaryCategory === "unclear" ? 8 : baseChannel[primaryCategory]) + Math.min(5, scaleSignals)),
    productAndUseCaseFit: Math.min(25, 7 + productBreadth * 2),
    targetMarketCoverage: Math.min(20, 8 + scaleSignals * 3),
    partnershipExecutionCapability: Math.min(15, 5 + executionSignals * 2),
    strategicComplementarity: Math.max(0, Math.min(10, 4 + Math.ceil(productBreadth / 2) - (containsAny(lower, [/own brand/i, /hersteller/i, /manufacturer/i]) ? 2 : 0))),
  } : null;
  const relationshipStatus = containsAny(lower, [/cudy.{0,80}(?:router|switch|product|shop|buy|kaufen|verkauf|resell)/i])
    ? "confirmed_existing" as const : "no_public_evidence" as const;
  const evidenceStrength = officialDomainMatch && identityEvidenceCount >= 2 ? "strong" as const
    : sufficientEvidence ? "medium" as const : "weak" as const;
  const riskFlags: AuditRiskFlag[] = [
    ...(!officialDomainMatch ? ["high_score_without_official_source" as const] : []),
    ...(evidenceStrength === "weak" ? ["weak_evidence" as const] : []),
    ...(!nameMatch ? ["identity_ambiguity" as const] : []),
    ...(relationshipStatus === "no_public_evidence" ? ["relationship_unclear" as const] : []),
  ];
  const score = dimensions ? Object.values(dimensions).reduce((sum, value) => sum + value, 0) : null;
  if (score !== null && Math.abs(score - 50) <= 4) riskFlags.push("score_near_threshold");
  const independentEvidenceUrls = evidence.results.map((result) => result.url).slice(0, 5);
  if (independentEvidenceUrls.length === 0) independentEvidenceUrls.push(...candidate.mergedOfficialWebsiteUrls.slice(0, 1));
  const assessment: PotentialPartnerAssessment = {
    blindCandidateId: candidate.blindCandidateId,
    assessedAt: new Date().toISOString(),
    evidenceGates,
    relationshipStatus,
    evidenceStrength,
    fitDimensions: dimensions,
    independentEvidenceUrls,
    riskFlags: [...new Set(riskFlags)],
    notes: [
      `v3-calibrated automated audit; official-domain match=${officialDomainMatch}; independent identity evidence=${identityEvidenceCount}.`,
      "Existing Cudy relationship is metadata and has zero fit-score weight.",
    ],
  };
  if (assessment.independentEvidenceUrls.length > 0) validatePotentialPartnerAssessment(assessment);
  return {
    assessment,
    primaryCategory,
    supportedCategories,
    categoryConfidence: primaryRoleScore >= 3 ? "strong" : primaryRoleScore >= 2 ? "medium" : "weak",
  };
}

const evidenceById = new Map(evidenceDocument.candidates.map((item) => [item.blindCandidateId, item]));
const calibrated = packet.candidates.map((candidate) => assess(candidate, evidenceById.get(candidate.blindCandidateId)!));
const calibratedById = new Map(calibrated.map((item) => [item.assessment.blindCandidateId, item]));
await writeFile(path.join(working, "v4-calibrated-assessments.local.json"), `${JSON.stringify({
  schemaVersion: 1,
  protocolVersion: packet.protocolVersion,
  generatedAt: new Date().toISOString(),
  calibration: {
    source: "v3 post-rule-reassessment blind-human audit",
    qualifiedStatusAgreement: 1,
    fitBandExactAgreement: 0.8333333333333334,
    weightedKappa: 0.9727272727272728,
    potentialFitMeanAbsoluteError: 3.7142857142857144,
    evidenceGateAgreement: 0.9027777777777778,
    relationshipStatusAgreement: 0.9166666666666666,
  },
  candidates: calibrated,
}, null, 2)}\n`, "utf8");

const rawDirectory = path.join(root, "runs", "raw");
const rawFiles = (await readdir(rawDirectory)).filter((name) => /four-channel-categories-v4-(?:openai|claude|deepseek|kimi|grok|gemini|sales-lead-copilot)-r[123](?:-a\d+)?[.]json$/.test(name));
const rawRuns = await Promise.all(rawFiles.map(async (filename) => ({ filename, value: JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8")) })));
const configuredSystems = [
  ...Object.entries(providerDocument.providers).map(([providerId, config]) => ({ providerId, modelId: config.model.modelId, displayName: config.displayName })),
  { providerId: "sales-lead-copilot", modelId: "sales-lead-copilot-v0.3", displayName: "Sales Lead Copilot" },
];
const selectedRawRuns = configuredSystems.flatMap((system) => [1, 2, 3].flatMap((repetition) => {
  const reviewed = identityMap.runs.find((run) => run.providerId === system.providerId && run.modelId === system.modelId && run.repetition === repetition);
  if (reviewed) {
    const selected = rawRuns.find(({ filename }) => filename === reviewed.filename);
    if (selected) return [{ system, repetition, filename: selected.filename, run: selected.value }];
  }
  const candidates = rawRuns.filter(({ value }) => value.providerId === system.providerId && value.modelId === system.modelId && value.repetition === repetition)
    .sort((left, right) => (left.value.attempt ?? 1) - (right.value.attempt ?? 1));
  return candidates.length ? [{ system, repetition, filename: candidates[0].filename, run: candidates[0].value }] : [];
}));

const occurrenceByRun = new Map<string, Array<{ candidateId: string; submission: Submission }>>();
for (const candidate of packet.candidates) {
  for (const submission of candidate.submissions) {
    occurrenceByRun.set(submission.blindRunId, [...(occurrenceByRun.get(submission.blindRunId) ?? []), { candidateId: candidate.blindCandidateId, submission }]);
  }
}
const blindRunByFile = new Map(identityMap.runs.map((run) => [run.filename, run.blindRunId]));

function categoryPenalty(candidate: CalibratedCandidate, claimed: Category | "unclear"): number {
  if (claimed === "unclear" || candidate.primaryCategory === "unclear") return -8;
  if (claimed === candidate.primaryCategory) return 0;
  if (candidate.supportedCategories.includes(claimed)) return -3;
  return -8;
}
function dcg(scores: number[]): number {
  return scores.reduce((sum, score, index) => sum + (2 ** (score / 25) - 1) / Math.log2(index + 2), 0);
}
const idealScores = calibrated.map((item) => potentialFitScore(item.assessment) ?? 0).sort((left, right) => right - left).slice(0, 40);
const idealDcg = dcg(idealScores);

const runMetrics = selectedRawRuns.map(({ system, repetition, filename, run }) => {
  const blindRunId = blindRunByFile.get(filename);
  const occurrences = blindRunId ? [...(occurrenceByRun.get(blindRunId) ?? [])].sort((a, b) => a.submission.answerRank - b.submission.answerRank) : [];
  const scored = occurrences.map(({ candidateId, submission }) => {
    const candidate = calibratedById.get(candidateId)!;
    const baseScore = potentialFitScore(candidate.assessment) ?? 0;
    const penalty = categoryPenalty(candidate, submission.claimedCategory);
    return { candidateId, baseScore, adjustedScore: Math.max(0, baseScore + penalty), penalty, valid: baseScore > 0 };
  });
  const paddedScores = [...scored.map((item) => item.adjustedScore), ...Array.from({ length: Math.max(0, 40 - scored.length) }, () => 0)].slice(0, 40);
  return {
    providerId: system.providerId,
    modelId: system.modelId,
    displayName: system.displayName,
    repetition,
    filename,
    latencyMs: run.latencyMs,
    searches: run.searchRequestsObserved,
    sourceUrls: Array.isArray(run.sourceUrls) ? run.sourceUrls.length : 0,
    extractedCandidates: occurrences.length,
    completeness: occurrences.length / 40,
    evidenceValidCandidates: scored.filter((item) => item.valid).length,
    qualifiedCandidates: scored.filter((item) => item.adjustedScore >= 50).length,
    highFitCandidates: scored.filter((item) => item.adjustedScore >= 80).length,
    exactCategoryCandidates: scored.filter((item) => item.penalty === 0).length,
    secondaryCategoryCandidates: scored.filter((item) => item.penalty === -3).length,
    categoryMismatchCandidates: scored.filter((item) => item.penalty === -8).length,
    qualityPointsPerSlot: paddedScores.reduce((sum, value) => sum + value, 0) / 40,
    meanFitSubmitted: scored.length ? scored.reduce((sum, item) => sum + item.adjustedScore, 0) / scored.length : 0,
    ndcgAt40: idealDcg === 0 ? 0 : dcg(paddedScores) / idealDcg,
    candidateIds: scored.map((item) => item.candidateId),
    qualifiedCandidateIds: scored.filter((item) => item.adjustedScore >= 50).map((item) => item.candidateId),
  };
});

const acceptedPool = new Set(runMetrics.flatMap((run) => run.qualifiedCandidateIds));
function mean(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function pairwiseJaccard(sets: Set<string>[]): number {
  const values: number[] = [];
  for (let left = 0; left < sets.length; left += 1) for (let right = left + 1; right < sets.length; right += 1) {
    const union = new Set([...sets[left], ...sets[right]]);
    const intersection = [...sets[left]].filter((item) => sets[right].has(item)).length;
    values.push(union.size === 0 ? 0 : intersection / union.size);
  }
  return mean(values);
}
const systemMetrics = configuredSystems.map((system) => {
  const runs = runMetrics.filter((run) => run.providerId === system.providerId && run.modelId === system.modelId);
  const uniqueQualified = new Set(runs.flatMap((run) => run.qualifiedCandidateIds));
  return {
    providerId: system.providerId,
    modelId: system.modelId,
    displayName: system.displayName,
    completedRuns: runs.length,
    usableCandidateRuns: runs.filter((run) => run.extractedCandidates > 0).length,
    averageExtractedCandidates: mean(runs.map((run) => run.extractedCandidates)),
    averageCompleteness: mean(runs.map((run) => run.completeness)),
    averageEvidenceValidCandidates: mean(runs.map((run) => run.evidenceValidCandidates)),
    averageQualifiedCandidates: mean(runs.map((run) => run.qualifiedCandidates)),
    averageHighFitCandidates: mean(runs.map((run) => run.highFitCandidates)),
    averageQualityPointsPerSlot: mean(runs.map((run) => run.qualityPointsPerSlot)),
    averageMeanFitSubmitted: mean(runs.map((run) => run.meanFitSubmitted)),
    averageNdcgAt40: mean(runs.map((run) => run.ndcgAt40)),
    categoryExactRate: mean(runs.map((run) => run.extractedCandidates ? run.exactCategoryCandidates / run.extractedCandidates : 0)),
    categorySecondaryRate: mean(runs.map((run) => run.extractedCandidates ? run.secondaryCategoryCandidates / run.extractedCandidates : 0)),
    pooledRecall: acceptedPool.size ? uniqueQualified.size / acceptedPool.size : 0,
    stabilityJaccard: pairwiseJaccard(runs.map((run) => new Set(run.candidateIds))),
    averageLatencyMs: mean(runs.map((run) => run.latencyMs)),
    averageSearches: mean(runs.map((run) => run.searches)),
    averageSourceUrls: mean(runs.map((run) => run.sourceUrls)),
  };
}).sort((left, right) => right.averageQualityPointsPerSlot - left.averageQualityPointsPerSlot || right.averageNdcgAt40 - left.averageNdcgAt40);

const productRuns = rawRuns.filter(({ value }) => value.providerId === "sales-lead-copilot" && value.modelId === "sales-lead-copilot-v0.3");
const productCredits = productRuns.reduce((sum, { value }) => sum + (value.resourceUsage?.totalCredits ?? 0), 0);
const productCost = productRuns.reduce((sum, { value }) => sum + (value.resourceUsage?.estimatedCostUsdPayAsYouGo ?? 0), 0);
const rounded = (value: number, digits = 3): number => Number(value.toFixed(digits));
const publicSystems = systemMetrics.map((item, index) => ({ rank: index + 1, ...item }));
type PublicRunMetric = Omit<(typeof runMetrics)[number], "candidateIds" | "qualifiedCandidateIds">;
const publicRunMetrics: PublicRunMetric[] = runMetrics.map((run) => {
  const copy = { ...run } as Partial<(typeof runMetrics)[number]>;
  delete copy.candidateIds;
  delete copy.qualifiedCandidateIds;
  return copy as PublicRunMetric;
});
const aggregate = {
  schemaVersion: 1,
  protocolVersion: packet.protocolVersion,
  generatedAt: new Date().toISOString(),
  status: "formal_collection_and_v3_calibrated_automated_evaluation_complete",
  humanAudit: { v4Performed: false, calibrationOnly: true },
  calibration: {
    source: "v3 post-rule-reassessment blind-human audit",
    sampleCandidates: 12,
    qualifiedStatusAgreement: 1,
    fitBandExactAgreement: 0.833,
    weightedKappa: 0.973,
    potentialFitMeanAbsoluteError: 3.714,
    evidenceGateAgreement: 0.903,
    relationshipStatusAgreement: 0.917,
  },
  pool: {
    expectedFormalRuns: 21,
    completedFormalRuns: selectedRawRuns.length,
    eligibleCandidateRuns: identityMap.runs.length,
    candidateOccurrences: packet.occurrenceCount,
    deduplicatedCandidates: packet.candidates.length,
    evidenceSearchFailures: evidenceDocument.failedCandidates,
    evidenceSearchCredits: evidenceDocument.totalCredits,
    evidenceSearchEstimatedCostUsd: evidenceDocument.estimatedCostUsdPayAsYouGo,
  },
  productResourceUsage: { totalCredits: productCredits, estimatedCostUsd: rounded(productCost) },
  systems: publicSystems,
  runMetrics: publicRunMetrics,
};
await writeFile(path.join(reports, "2026-08-22-v4-detailed-evaluation.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

const tableRows = publicSystems.map((system) => `| ${system.rank} | ${system.displayName} | ${system.modelId} | ${system.usableCandidateRuns}/3 | ${(Number(system.averageCompleteness) * 100).toFixed(1)}% | ${Number(system.averageQualityPointsPerSlot).toFixed(1)} | ${Number(system.averageMeanFitSubmitted).toFixed(1)} | ${Number(system.averageNdcgAt40).toFixed(3)} | ${Number(system.pooledRecall).toFixed(3)} | ${Number(system.stabilityJaccard).toFixed(3)} |`);
const runRows = aggregate.runMetrics.map((run) => `| ${run.displayName} | ${run.repetition} | ${run.extractedCandidates} | ${run.evidenceValidCandidates} | ${run.qualifiedCandidates} | ${run.highFitCandidates} | ${run.qualityPointsPerSlot.toFixed(1)} | ${run.ndcgAt40.toFixed(3)} | ${(run.latencyMs / 1000).toFixed(1)}s | ${run.searches} |`);
const productMetric = publicSystems.find((item) => item.providerId === "sales-lead-copilot")!;
const geminiMetric = publicSystems.find((item) => item.providerId === "gemini")!;
const openAiMetric = publicSystems.find((item) => item.providerId === "openai")!;
const qualityGapToGemini = Number(geminiMetric.averageQualityPointsPerSlot) - Number(productMetric.averageQualityPointsPerSlot);
const qualityGapToOpenAi = Number(openAiMetric.averageQualityPointsPerSlot) - Number(productMetric.averageQualityPointsPerSlot);
const markdown = `# 模型搜索与销售线索产品 v4 详细测评报告

评测日期：2026-08-21（结果报告生成于 2026-08-22）

市场：德国（DE）
协议：\`${packet.protocolVersion}\`

## 结论摘要

本轮完成 6 家模型公司各 3 次正式运行，以及 Sales Lead Copilot 3 次产品对照运行，共 21 个正式结果。v4 不再新增人工盲评；自动证据门槛和五维匹配度评分使用 v3 已完成人工盲评后的规则校准结果作为可信度基准。排名主指标是“每个目标名额的平均匹配质量”，即每轮最多 40 家、缺失名额按 0 分计算，因此同时惩罚候选不足和低匹配候选。

## 总榜

| 排名 | 系统 | 型号 | 有效候选轮 | 平均完成率 | 每名额质量分 | 已提交候选平均分 | nDCG@40 | Pool Recall | 三轮稳定度 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
${tableRows.join("\n")}

## 对实验初衷的回答

本轮数据**没有证明当前 Sales Lead Copilot 对照实现的候选匹配质量优于最强通用模型**。产品组每名额质量分为 ${Number(productMetric.averageQualityPointsPerSlot).toFixed(1)}，低于 Gemini ${qualityGapToGemini.toFixed(1)} 分、低于 OpenAI ${qualityGapToOpenAi.toFixed(1)} 分；nDCG@40 也低于 Gemini、Kimi 和 OpenAI。因此“产品经过更多工程链路后，最终答案整体更优”的强假设在本轮不成立。

但产品组表现出两个清晰工程优势：三轮稳定度 ${Number(productMetric.stabilityJaccard).toFixed(3)} 为全组最高，平均延迟 ${(Number(productMetric.averageLatencyMs) / 1000).toFixed(1)} 秒也为有有效候选系统中最低。换言之，产品更可重复、更快，但当前搜索覆盖、证据门槛通过率和类别归位不足以换成最高的最终线索质量。

需要避免过度归因：本次产品对照运行实际执行的是 Tavily 分类别发现、官方页面检索和页面提取；独立证据评分是在所有系统完成后统一施加的。对照运行本身没有调用产品 RAG，也没有在候选生成阶段运行独立打分 agent。因此本报告可以评价“当前 v4 产品 comparator”，但不能单独证明或否定“完整 RAG + 爬虫 + 独立打分 agent 产品链路”的增益。若要检验该因果假设，下一版必须让产品组真实调用完整主分支链路，同时继续使用同一 prompt、40 家截止、相同 20 分钟预算和本报告的统一事后审计。

## 单轮明细

| 系统 | 轮次 | 抽取候选 | 证据门槛有效 | ≥50分 | ≥80分 | 每名额质量分 | nDCG@40 | 延迟 | 搜索数 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${runRows.join("\n")}

## 校准与证据

- v3 人工盲评校准样本：12 家；资格状态一致率 100%，匹配分档一致率 83.3%，加权 κ=0.973，潜在匹配分平均绝对误差 3.71 分，证据门槛一致率 90.3%，关系状态一致率 91.7%。
- v4 对 ${packet.candidates.length} 家去重候选执行了供应商身份盲化的独立公开搜索；失败 ${evidenceDocument.failedCandidates} 家，消耗 ${evidenceDocument.totalCredits} credits，按记录牌价估算 US$${evidenceDocument.estimatedCostUsdPayAsYouGo.toFixed(3)}。
- 类别不匹配不判无效：可信次要角色扣 3 分，实质属于四类中的另一类扣 8 分；候选仍归属于模型原提交类别。
- “当前是否与 Cudy 合作”只作为元数据，不进入匹配分；报告既保留全部匹配质量，也可从本地审计产物中单独识别既有关系。
- 没有进行 v4 人工盲评，因此系统间小于约 4 分的平均分差不应解释为确定性优劣；这是由 v3 校准 MAE 得出的保守不确定性边界。

## 模型与运行问题

- OpenAI 与 Claude 按要求继续通过 Lingyu。OpenAI 三轮稳定完成。Lingyu 的 Claude 原生搜索路径在 Fable 5 与 Opus 5 上均可通过短预检，但完整长 prompt 会把整段请求作为搜索词并回显，三轮均无可评分公司；未拆题或注入外部搜索替 Claude 修复答案。
- DeepSeek 原接口会以 \`tool_use\` 返回服务端搜索中间态；增加同一上下文续轮后得到最终答案，但三轮候选完整度仍有明显波动。
- Kimi 从持续 429 恢复后，官方 Formula 搜索偶发空 final；最多两次无工具完成轮解决该问题，三轮均成功。
- Grok/Gemini 初始直连失败的根因是最内层 TypeScript 子进程未继承代理。预加载代理后 Grok 正常。Gemini 3.7 Flash 两次正式 attempt 均在自动重试后返回官方 high-demand 500，因此按预先授权的成功率原则切换到已过检的 3.6 Flash并完成三轮。

## 产品对照组资源

Sales Lead Copilot 三轮候选数为 34/40/34；共消耗 ${productCredits} Tavily credits，按记录牌价估算 US$${productCost.toFixed(3)}，外部请求失败为 0。产品组的优势是否成立应以总榜的每名额质量分、nDCG 和稳定度共同判断，而不是只比较候选数量。

## 后续产品改进优先级

1. 将四类配额从“搜索查询分组”升级为“证据确认后的类别配额”，解决产品平均类别精确率只有 ${(Number(productMetric.categoryExactRate) * 100).toFixed(1)}% 的问题；兼营角色可保留，但必须明确主角色与次要角色。
2. 在候选入池前增加公司实体归一化与官方域名门槛，避免搜索结果标题、目录页或同一集团多域名消耗 40 个名额。
3. 接入真实的独立打分 agent，在提交前按六门槛、五维度和 -3/-8 类别扣分进行交叉验证；低于 50 分或证据不足的候选应由下一名替补，而不是留到事后审计才归零。
4. 完整接入主分支 RAG 后再做一次消融实验：Tavily-only、Tavily+RAG、Tavily+RAG+评分 agent 三组分别跑三轮，才能量化每层的增益。

## 限制

本报告是 v3 人评校准后的自动化证据评估，不是新的 v4 人工复核。搜索结果和公司业务会随时间变化；类别兼营企业的 -3/-8 分判定依赖公开证据强度。原始答案、公司级证据、盲化身份映射和逐公司审计保存在本地忽略目录，未提交到 Git，避免公开销售线索和本地审计身份。
`;
await writeFile(path.join(reports, "2026-08-22-v4-detailed-evaluation.md"), markdown, "utf8");
console.log(JSON.stringify({
  report: "experiments/global-model-lead-benchmark/reports/2026-08-22-v4-detailed-evaluation.md",
  formalRuns: selectedRawRuns.length,
  systems: publicSystems,
}, null, 2));
