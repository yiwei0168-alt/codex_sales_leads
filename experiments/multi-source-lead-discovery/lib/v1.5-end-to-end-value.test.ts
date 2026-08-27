import { describe, expect, it } from "vitest";

import type { SharedEvidenceDossier } from "./evidence-dossier";
import type { V14OccurrenceScore } from "./v1.4-independent-value";
import { evaluateV15EndToEnd, routesForRoles } from "./v1.5-end-to-end-value";

const baseline = {
  dossierId: "DOS-TEST", companyName: "Example", officialUrl: "https://example.de", systemId: "product-exa",
  channelId: "tier1-distribution", submittedRank: 1, supportedRoles: [],
  valueEligibility: { companyExists: true, germanyPresence: true, activeNetworking: true,
    submittedLaneMembership: false, uniqueCanonicalCompany: true },
  failedValueGates: ["submittedLaneMembership"],
  levels: { productUseCaseFit: 4, cooperationPath: 3, independentInformationConfidence: 4 },
  score: 0, evaluationBasis: "v1.3.1-shared-evidence", independentDecisionStatus: null,
  independentDecisionReason: null, independentEvidence: [], providerEvidenceComplete: false, providerEvidenceItemCount: 0,
} satisfies V14OccurrenceScore;

const dossier = {
  claimCoverage: { laneMembership: {
    "tier1-distribution": { requested: true, demonstrated: false, supportedRoles: ["VAR", "Installer"] },
    "b2b-resale": { requested: false, demonstrated: true, supportedRoles: ["VAR", "Installer"] },
    "project-services": { requested: false, demonstrated: true, supportedRoles: ["VAR", "Installer"] },
  } },
} as SharedEvidenceDossier;

describe("v1.5 end-to-end value scoring", () => {
  it("reroutes product results and does not zero a valuable lead for an original lane mismatch", () => {
    const score = evaluateV15EndToEnd({ baseline, dossier, correctedChannelId: "b2b-resale", productCorrectionApplied: true });
    expect(score.failedHardValueGates).toEqual([]);
    expect(score.correctionApplied).toBe(true);
    expect(score.correctedRoles).toEqual(["VAR", "Installer"]);
    expect(score.correctedRoutes).toEqual(["b2b-resale", "project-services"]);
    expect(score.outputQuality).toEqual({ roleIdentificationQuality: 3, channelClassificationQuality: 1, maximum: 4 });
    expect(score.score).toBe(74.4);
  });

  it("keeps role and channel classification to four percent of the score", () => {
    expect(routesForRoles(["Distributor", "ISP"])).toEqual(["tier1-distribution", "project-services"]);
    const score = evaluateV15EndToEnd({ baseline: { ...baseline, systemId: "gemini-full" }, dossier,
      correctedChannelId: "tier1-distribution", productCorrectionApplied: false });
    expect(score.scoreComponents.roleIdentificationQuality + score.scoreComponents.channelClassificationQuality).toBe(0);
    expect(score.score).toBe(70.4);
  });

  it("still rejects candidates that fail a true value gate", () => {
    const score = evaluateV15EndToEnd({ baseline: { ...baseline,
      valueEligibility: { ...baseline.valueEligibility, activeNetworking: false } }, dossier,
      correctedChannelId: "b2b-resale", productCorrectionApplied: true });
    expect(score.score).toBe(0);
    expect(score.failedHardValueGates).toEqual(["activeNetworking"]);
  });
});
