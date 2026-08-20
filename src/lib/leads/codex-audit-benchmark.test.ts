import { describe, expect, it } from "vitest";

import {
  compareHumanAudit,
  deterministicClaimId,
  potentialFitBand,
  potentialFitScore,
  primaryPoolStatus,
  selectHighRiskAuditIds,
  selectStratifiedBlindAuditIds,
  validatePotentialPartnerAssessment,
  type HumanAuditDecision,
  type PotentialFitDimensions,
  type PotentialPartnerAssessment,
} from "../../../experiments/global-model-lead-benchmark/lib/codex-audit";

function dimensions(total: number): PotentialFitDimensions {
  let remaining = total;
  const take = (maximum: number) => {
    const value = Math.min(maximum, remaining);
    remaining -= value;
    return value;
  };
  return {
    channelRoleAndCustomerAccess: take(30),
    productAndUseCaseFit: take(25),
    targetMarketCoverage: take(20),
    partnershipExecutionCapability: take(15),
    strategicComplementarity: take(10),
  };
}

function assessment(index: number, score: number | null, relationshipStatus: PotentialPartnerAssessment["relationshipStatus"] = "no_public_evidence"):
PotentialPartnerAssessment {
  const blindCandidateId = `C-${index.toString(16).toUpperCase().padStart(12, "0")}`;
  const gatesPass = score !== null;
  return {
    blindCandidateId,
    assessedAt: "2026-08-20T00:00:00.000Z",
    evidenceGates: {
      submittedIdentityUsable: gatesPass,
      companyExists: gatesPass,
      targetCountryPresence: gatesPass,
      relevantChannel: gatesPass,
      sufficientEvidence: gatesPass,
      independentProspect: gatesPass,
    },
    relationshipStatus,
    evidenceStrength: gatesPass ? "strong" : "weak",
    fitDimensions: score === null ? null : dimensions(score),
    independentEvidenceUrls: [`https://example${index}.de/evidence`],
    namedContacts: [{
      claimId: deterministicClaimId("N", blindCandidateId, "Erika Muster:Sales Director"),
      name: "Erika Muster",
      role: "Sales Director",
      sourceUrl: `https://example${index}.de/team`,
      relevanceScore: 3,
      notes: null,
    }],
    contactMethods: [{
      claimId: deterministicClaimId("M", blindCandidateId, "sales@example.de"),
      value: "sales@example.de",
      sourceUrl: `https://example${index}.de/contact`,
      usefulnessScore: 2,
      notes: null,
    }],
    riskFlags: index % 11 === 0 ? ["source_conflict"] : [],
    notes: [],
  };
}

function matchingHumanDecision(value: PotentialPartnerAssessment): HumanAuditDecision {
  return {
    blindCandidateId: value.blindCandidateId,
    reviewedAt: "2026-08-20T01:00:00.000Z",
    evidenceGates: { ...value.evidenceGates },
    relationshipStatus: value.relationshipStatus,
    fitDimensions: value.fitDimensions ? { ...value.fitDimensions } : null,
    namedContactScores: value.namedContacts.map((claim) => ({ claimId: claim.claimId, relevanceScore: claim.relevanceScore })),
    contactMethodScores: value.contactMethods.map((claim) => ({ claimId: claim.claimId, usefulnessScore: claim.usefulnessScore })),
    reviewerNotes: null,
  };
}

describe("potential-partner Codex audit", () => {
  it("keeps existing-relationship metadata out of the potential-fit score", () => {
    const current = assessment(1, 85, "confirmed_existing");
    expect(potentialFitScore(current)).toBe(85);
    expect(potentialFitBand(current)).toBe("high_fit");
    expect(primaryPoolStatus(current)).toBe("existing_relationship_reference");
  });

  it("prevents gate-invalid candidates from receiving fit points", () => {
    const invalid = assessment(2, null);
    expect(potentialFitScore(invalid)).toBeNull();
    expect(primaryPoolStatus(invalid)).toBe("invalid");
    expect(() => validatePotentialPartnerAssessment({ ...invalid, fitDimensions: dimensions(60) })).toThrow();
  });

  it("selects a deterministic 25 percent blind sample with a 12-candidate minimum", () => {
    const scores = [null, 20, 45, 55, 70, 85];
    const values = Array.from({ length: 48 }, (_, index) => assessment(
      index + 10,
      scores[index % scores.length],
      index === 1 ? "confirmed_existing" : "no_public_evidence",
    ));
    const first = selectStratifiedBlindAuditIds(values, 25, 12, "seed");
    const second = selectStratifiedBlindAuditIds(values, 25, 12, "seed");
    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    expect(new Set(first).size).toBe(12);
    expect(selectHighRiskAuditIds(values, first, "seed").every((id) => !first.includes(id))).toBe(true);
  });

  it("accepts a matching human blind audit and detects material disagreement", () => {
    const values = [assessment(101, 55), assessment(102, 70), assessment(103, 85), assessment(104, null)];
    const matching = values.map(matchingHumanDecision);
    const thresholds = {
      qualifiedStatusAgreement: 0.9,
      fitBandExactAgreement: 0.8,
      weightedKappa: 0.75,
      potentialFitMeanAbsoluteErrorMaximum: 10,
      namedContactPositivePrecision: 0.9,
      contactMethodPositivePrecision: 0.9,
    };
    const accepted = compareHumanAudit(values, matching, values.map((value) => value.blindCandidateId), thresholds);
    expect(accepted.passed).toBe(true);
    expect(accepted.potentialFitMeanAbsoluteError).toBe(0);

    const disagreed = structuredClone(matching);
    disagreed[0].fitDimensions = dimensions(10);
    disagreed[1].namedContactScores[0].relevanceScore = 0;
    const rejected = compareHumanAudit(values, disagreed, values.map((value) => value.blindCandidateId), thresholds);
    expect(rejected.passed).toBe(false);
    expect(rejected.failedThresholds).toContain("namedContactPositivePrecision");
  });
});
