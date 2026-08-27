import { describe, expect, it } from "vitest";

import { evaluateV14Occurrence, scoreIndependentLevels } from "./v1.4-independent-value";

describe("v1.4 independent candidate-value scoring", () => {
  it("keeps provider evidence completeness at zero main-score weight", () => {
    expect(scoreIndependentLevels({
      productUseCaseFit: 4,
      cooperationPath: 5,
      independentInformationConfidence: 4,
    })).toBe(87);
  });

  it("does not use the v1.3 sufficient-evidence gate as a v1.4 value gate", () => {
    const score = evaluateV14Occurrence({
      baseline: {
        dossierId: "DOS-TEST",
        companyName: "Test GmbH",
        officialUrl: "https://example.test/",
        systemId: "test-system",
        channelId: "b2b-resale",
        submittedRank: 1,
        supportedRoles: ["Reseller"],
        eligibility: {
          companyExists: true,
          germanyPresence: true,
          activeNetworking: true,
          submittedLaneMembership: true,
          sufficientEvidence: false,
          uniqueCanonicalCompany: true,
        },
        failedGates: ["sufficientEvidence"],
        levels: { productUseCaseFit: 3, cooperationPath: 3, evidenceReliability: 1 },
        score: 0,
        evidenceProfile: "standard",
        assessments: {
          laneMembership: "",
          networking: "",
          productUseCaseFit: "",
          cooperationPath: "",
          evidenceReliability: "",
          evidenceSufficiency: "",
        },
      },
      dossier: {
        evidence: [],
      } as never,
    });
    expect(score.failedValueGates).toEqual([]);
    expect(score.score).toBe(52);
    expect(score.providerEvidenceComplete).toBe(false);
  });
});
