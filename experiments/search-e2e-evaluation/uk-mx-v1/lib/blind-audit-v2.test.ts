import { describe, expect, it } from "vitest";

import { experimentCells } from "./experiment";
import { buildBlindAuditV2Sample, calculateBlindAuditV2Metrics, executeBlindAuditV2, resolveBlindConsensusV2,
  type BlindAuditV2Mapping, type BlindAuditV2Packet, type BlindConsensusV2Decision,
  type BlindJudgeV2Decision } from "./blind-audit-v2";
import type { BlindJudgeV2Output } from "./runtime-schemas";
import { identityAliases, type FrozenCellBundle, type UnifiedCompanyRecord } from "./unified-evaluation";

const dimensionNames = ["productAndUseCaseFit", "channelAndBuyingInfluence", "sameRoleScaleAndCoverage",
  "executionAndEnablement", "opportunityAndRisk"] as const;

function dimensionsFor(total: number): BlindJudgeV2Output["dimensions"] {
  return { productAndUseCaseFit: total - 25, channelAndBuyingInfluence: 8,
    sameRoleScaleAndCoverage: 7, executionAndEnablement: 5, opportunityAndRisk: 5 };
}

function output(packetId: string, score: number, primaryRole = "Distributor",
  citation: { evidenceId: string; support: "direct" | "partial" | "context-only" | "unsupported" }
    = { evidenceId: "evidence-1", support: "direct" }): BlindJudgeV2Output {
  const scoredDimensions = dimensionsFor(score);
  return { packetId, externalSearchUsed: false, externalKnowledgeUsed: false,
    isRealOperatingCompany: true, operatesInTargetMarket: true,
    supportedRoles: [primaryRole], primaryRole, dimensions: scoredDimensions, totalScore: score,
    eligibility: "eligible", dimensionReasons: dimensionNames.map((dimension) => ({ dimension,
      reason: `${dimension} reason`, citations: [{ evidenceId: citation.evidenceId,
        claim: `${dimension} claim`, support: citation.support }] })), unsupportedOrContradictoryClaims: [] };
}

function decision(packetId: string, judgeId: string, actualModel: string, score: number,
  primaryRole = "Distributor", citation?: Parameters<typeof output>[3]): BlindJudgeV2Decision {
  const judgeOutput = output(packetId, score, primaryRole, citation);
  return { packetId, judgeId, requestedModel: actualModel, actualModel,
    modelReportedTotal: score, deterministicTotal: score,
    roleFamily: primaryRole === "Brand Owner" ? "brand" : "distribution",
    requestedCategoryFamilyMatch: primaryRole !== "Brand Owner",
    citationValidation: { checkedClaims: 5, validEvidenceIds: citation?.evidenceId === "missing" ? 0 : 5,
      entailedClaims: citation?.support === "context-only" || citation?.support === "unsupported" ? 0 : 5,
      idAlignmentRate: citation?.evidenceId === "missing" ? 0 : 1,
      entailmentRate: citation?.support === "context-only" || citation?.support === "unsupported" ? 0 : 1 },
    output: judgeOutput, costEvent: { budgetCostUsd: 0 } as BlindJudgeV2Decision["costEvent"] };
}

function packet(packetId = "blind-v2-test-packet"): BlindAuditV2Packet {
  return { packetId, protocolVersion: "2.0.0",
    targetMarket: { countryCode: "GB", countryName: "United Kingdom" }, requestedCategory: "distribution",
    requestedRoleFamily: "distribution", cudyBrief: "test", company: { name: "Example", domain: "example.test",
      officialWebsiteUrl: "https://example.test" }, evidencePolicy: { version: "test",
      selectionIndependentOfScoringCitations: true, availableEvidenceCount: 1, includedEvidenceCount: 1,
      omittedEvidenceCount: 0 }, sameMarketSameRoleScaleAnchor: { market: "United Kingdom",
      selectionRule: "select after role", observableSignalsByRoleFamily: {
        distribution: "downstream reach", resale: "B2B reach", retail: "consumer reach",
        services: "project reach", isp: "subscriber reach", agent: "principal reach", brand: "market reach",
      }, bands: [] },
    evidence: [{ evidenceId: "evidence-1", sourceType: "official-website", url: "https://example.test",
      title: "Example", excerpt: "Example supplies resellers." }] };
}

function sampleFixtures(): { bundles: FrozenCellBundle[]; records: Map<string, UnifiedCompanyRecord>;
  aliases: Map<string, string> } {
  const records = new Map<string, UnifiedCompanyRecord>();
  const aliases = new Map<string, string>();
  const bundles = experimentCells().map((cell) => {
    const controlCandidates: Array<Record<string, unknown>> = [];
    const productCandidates: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 10; index += 1) {
      const companyName = `${cell.cellId} Company ${index}`;
      const domain = `${cell.cellId.toLocaleLowerCase()}-${index}.example.test`;
      const website = `https://${domain}`;
      const key = identityAliases(cell.countryCode, companyName, website)[0]!;
      const record: UnifiedCompanyRecord = { companyKey: key, countryCode: cell.countryCode, companyName, domain,
        officialWebsiteUrl: website, primaryRole: cell.categoryId === "retail" ? "Retailer"
          : cell.categoryId === "resale" ? "Reseller" : cell.categoryId === "si-msp" ? "SI" : "Distributor",
        supportedRoles: [], totalScore: 60 + index, eligibilityStatus: "eligible",
        isRealOperatingCompany: true, operatesInTargetMarket: true,
        evidence: [{ id: `scored-${cell.cellId}-${index}`, url: website, title: "Scoring-selected",
          excerpt: "Scoring-selected excerpt", sourceType: "official-website" }],
        blindAuditEvidence: [{ id: `audit-${cell.cellId}-${index}`, url: website, title: "Audit pool",
          excerpt: "Audit-independent excerpt", sourceType: "official-website" }],
        source: "product-reused", assessmentModel: "test" };
      records.set(key, record);
      for (const alias of identityAliases(cell.countryCode, companyName, website)) aliases.set(alias, key);
      controlCandidates.push({ rank: index + 1, companyName, officialWebsite: website });
      productCandidates.push({ rank: index + 1, companyName, officialWebsiteUrl: website });
    }
    return { cell, control: { finalCandidates: controlCandidates },
      product: { finalCandidates: productCandidates } } as unknown as FrozenCellBundle;
  });
  return { bundles, records, aliases };
}

describe("blind audit v2 sampling", () => {
  it("separates representative and stress cohorts and uses score-independent evidence packets", () => {
    const fixtures = sampleFixtures();
    const first = buildBlindAuditV2Sample(fixtures.bundles, fixtures.records, fixtures.aliases);
    expect(first.packets).toHaveLength(64);
    expect(first.mappings.filter((item) => item.cohort === "representative")).toHaveLength(48);
    expect(first.mappings.filter((item) => item.cohort === "stress")).toHaveLength(16);
    expect(first.packets.every((item) => item.evidencePolicy.selectionIndependentOfScoringCitations)).toBe(true);
    expect(first.packets.every((item) => item.evidence[0]?.evidenceId.startsWith("audit-"))).toBe(true);

    const representativeBefore = first.mappings.filter((item) => item.cohort === "representative")
      .map((item) => item.packetId).sort();
    for (const record of fixtures.records.values()) record.totalScore = 100 - record.totalScore;
    const second = buildBlindAuditV2Sample(fixtures.bundles, fixtures.records, fixtures.aliases);
    expect(second.mappings.filter((item) => item.cohort === "representative")
      .map((item) => item.packetId).sort()).toEqual(representativeBefore);
  });

  it("fails closed when a future artifact lacks the score-independent audit evidence pool", () => {
    const fixtures = sampleFixtures();
    for (const record of [...fixtures.records.values()].slice(0, 10)) delete record.blindAuditEvidence;
    expect(() => buildBlindAuditV2Sample(fixtures.bundles, fixtures.records, fixtures.aliases))
      .toThrow("has no score-independent blind-audit evidence pool");
  });

  it("checkpoints every model decision and reuses it on rerun", async () => {
    const fixtures = sampleFixtures();
    const sample = buildBlindAuditV2Sample(fixtures.bundles, fixtures.records, fixtures.aliases);
    const cacheValues = new Map<string, BlindJudgeV2Decision>();
    const cache = { get: async (key: string) => cacheValues.get(key) ?? null,
      set: async (key: string, value: BlindJudgeV2Decision) => { cacheValues.set(key, value); } };
    let calls = 0;
    const fakeJudge = async (blindPacket: BlindAuditV2Packet, judgeId: string, model: string) => {
      calls += 1;
      return decision(blindPacket.packetId, judgeId, model, 70, "Distributor",
        { evidenceId: blindPacket.evidence[0].evidenceId, support: "direct" });
    };
    const first = await executeBlindAuditV2(sample, { cache, judge: fakeJudge, authorizePaidCall: () => undefined });
    expect(calls).toBe(128);
    expect(first.cacheStats).toEqual({ reads: 128, hits: 0, misses: 128, writes: 128 });
    const second = await executeBlindAuditV2(sample, { cache, judge: fakeJudge, authorizePaidCall: () => undefined });
    expect(calls).toBe(128);
    expect(second.cacheStats).toEqual({ reads: 128, hits: 128, misses: 0, writes: 0 });
    expect(cacheValues.size).toBe(128);
  });
});

describe("blind audit v2 consensus", () => {
  it("does not arbitrate same-family subtype differences below the material score threshold", () => {
    const blindPacket = packet();
    const result = resolveBlindConsensusV2(blindPacket, [
      decision(blindPacket.packetId, "judge-a", "anthropic/claude-opus-5", 70, "Distributor"),
      decision(blindPacket.packetId, "judge-b", "openai/gpt-5.6-sol", 74, "VAD"),
    ]);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.decision.arbitrationTriggered).toBe(false);
    expect(result.decision.roleFamily).toBe("distribution");
    expect(result.decision.exactSubtypeConsensus).toBe(false);
    expect(result.decision.output.primaryRole).toBe("Unresolved");
    expect(result.decision.deterministicTotal).toBe(72);
  });

  it("requires arbitration for material score or critical-state disagreements", () => {
    const blindPacket = packet();
    const judges: [BlindJudgeV2Decision, BlindJudgeV2Decision] = [
      decision(blindPacket.packetId, "judge-a", "anthropic/claude-opus-5", 70),
      decision(blindPacket.packetId, "judge-b", "openai/gpt-5.6-sol", 78),
    ];
    const pending = resolveBlindConsensusV2(blindPacket, judges);
    expect(pending).toEqual({ status: "arbitration-required", arbitrationReasons: ["total-score-difference"] });
    const arbitrator = decision(blindPacket.packetId, "arbitrator", "deepseek/deepseek-v4-pro", 73);
    const resolved = resolveBlindConsensusV2(blindPacket, judges, arbitrator);
    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved") expect(resolved.decision.resolution).toBe("arbitrator");
  });

  it("keeps citation ID validity separate from semantic support", () => {
    const blindPacket = packet();
    const contextual = resolveBlindConsensusV2(blindPacket, [
      decision(blindPacket.packetId, "judge-a", "anthropic/claude-opus-5", 70, "Distributor",
        { evidenceId: "evidence-1", support: "direct" }),
      decision(blindPacket.packetId, "judge-b", "openai/gpt-5.6-sol", 70, "Distributor",
        { evidenceId: "evidence-1", support: "context-only" }),
    ]);
    expect(contextual.status).toBe("resolved");
    if (contextual.status !== "resolved") return;
    expect(contextual.decision.citationValidation.idAlignmentRate).toBe(1);
    expect(contextual.decision.citationValidation.entailmentRate).toBe(0.5);
  });
});

describe("blind audit v2 metrics", () => {
  it("uses only representative samples for gates and reports exact subtypes and stress cases diagnostically", () => {
    const mappings: BlindAuditV2Mapping[] = [];
    const decisions: BlindConsensusV2Decision[] = [];
    for (let cell = 0; cell < 8; cell += 1) {
      for (let index = 0; index < 8; index += 1) {
        const cohort = index < 6 ? "representative" : "stress";
        const packetId = `blind-v2-cell-${cell}-${index}`;
        const score = index < 6 ? 60 + index : index === 6 ? 60 : 70;
        mappings.push({ packetId, companyKey: `company-${cell}-${index}`, cellId: `cell-${cell}`, cohort,
          stratum: cohort, inclusionProbability: cohort === "representative" ? 0.5 : null,
          presentInArms: ["product-e2e"], sourceRanks: { "product-e2e": index + 1 },
          unifiedPrimaryRole: "Distributor", unifiedRoleFamily: "distribution", unifiedScore: score,
          unifiedEligibility: "eligible", unifiedQualification: { identity: true, targetMarket: true,
            requestedFamily: true, scoreThreshold: score >= 65, outputEligibility: true,
            qualified: score >= 65 } });
        const decisionScore = cohort === "representative" ? score : index === 6 ? 90 : 10;
        const judgeA = decision(packetId, "judge-a", "anthropic/claude-opus-5", decisionScore,
          cohort === "representative" ? "VAD" : "Brand Owner");
        const judgeB = decision(packetId, "judge-b", "openai/gpt-5.6-sol", decisionScore,
          cohort === "representative" ? "VAD" : "Brand Owner");
        decisions.push({ packetId, resolution: "judge-average", arbitrationTriggered: false,
          arbitrationReasons: [], deterministicTotal: decisionScore,
          roleFamily: cohort === "representative" ? "distribution" : "brand",
          requestedCategoryFamilyMatch: cohort === "representative", exactSubtypeConsensus: true,
          citationValidation: judgeA.citationValidation, output: judgeA.output, judges: [judgeA, judgeB] });
      }
    }
    const metrics = calculateBlindAuditV2Metrics(mappings, decisions);
    expect(metrics.passed).toBe(true);
    expect(metrics.representative.roleFamilyAgreement).toBe(1);
    expect(metrics.representative.exactPrimaryRoleAgreement).toBe(0);
    expect(metrics.representative.withinCellMacroSpearman).toBeCloseTo(1, 8);
    expect(metrics.stress.roleFamilyAgreement).toBe(0);
    expect(metrics.stress.withinCellMacroSpearman).toBeCloseTo(-1, 8);
  });
});
