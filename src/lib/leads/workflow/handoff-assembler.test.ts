import { describe, expect, it } from "vitest";

import { LeadHandoffAssembler } from "./handoff-assembler";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";
import type { CorrectedLeadWorkflowCandidate, LeadAssessmentReview, LeadCandidateAssessment } from "./types";

const candidate: CorrectedLeadWorkflowCandidate = {
  candidateId: "lead-handoff-example", evidenceSnapshotRunId: "run-handoff",
  companyName: "Handoff GmbH", domain: "handoff.example",
  officialWebsiteUrl: "https://handoff.example/", queryRoles: ["Installer"], queryFamily: "services", providerScore: 0.8,
  evidence: [{ id: "evidence-handoff", url: "https://handoff.example/wlan", title: "WLAN projects",
    excerpt: "We install WLAN access points for business customers.", sourceType: "official-website",
    provider: "fixture", capturedAt: "2026-08-30T00:00:00Z", evidenceRunId: "run-handoff",
    contentHash: leadEvidenceContentHash("We install WLAN access points for business customers."),
    freshnessStatus: "fresh" }], evidenceWarnings: [],
  correction: { originalCompanyName: "Handoff GmbH", originalDomain: "handoff.example",
    originalOfficialWebsiteUrl: "https://handoff.example/", resolvedRoles: ["Installer"], resolvedFamilies: ["services"],
    primaryRole: "Installer", primaryFamily: "services", primaryChannelReason: "Fixture primary route.",
    usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false, supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-handoff"],
    findings: [
      { findingId: "fact-install", kind: "commercial-action", statement: "The company installs WLAN access points for business customers.",
        status: "supported", roles: ["Installer"], evidenceIds: ["evidence-handoff"],
        sourceTypes: ["official-website"], confidence: 92, notes: [] },
      { findingId: "fact-procurement", kind: "cooperation-path", statement: "The company controls hardware procurement.",
        status: "unknown", roles: ["Installer"], evidenceIds: [], sourceTypes: [], confidence: 20, notes: [] },
    ], reasons: ["Official evidence supports installation."], confidence: 90,
    model: "corrector", promptVersion: "v2", escalated: false, warnings: [] },
};

const assessment: LeadCandidateAssessment = {
  candidateId: candidate.candidateId, eligible: true,
  gates: { correctedIdentityUsable: "supported", companyExists: "supported", targetCountryPresence: "supported",
    networkingRelevant: "supported", independentProspect: "supported" },
  roles: ["Installer"], primaryRole: "Installer", companyScaleClass: "Local/Small",
  researchDepth: "limited", recommendationPriority: "Medium", accountTier: "Standard",
  supplyModel: "Distributor Supply", brandInvolvement: "Light",
  dimensions: { productFamilyMatch: 20, customerAndScenarioOverlap: 13, positioningCompatibility: 8,
    cooperationPathAndBuyingInfluence: 9, scaleAndChannelCoverage: 8,
    executionAndEnablement: 9, opportunityAndRisk: 8 },
  dimensionRationales: [{ dimension: "productFamilyMatch", score: 20,
    reason: "The evidenced WLAN installation activity fits the product category.", findingIds: ["fact-install"],
    evidenceIds: ["evidence-handoff"], confidence: 88 }],
  totalScore: 75, scoreRange: { lower: 71, upper: 79 }, confidence: 86,
  eligibilityStatus: "eligible", cooperationPaths: [{ pathId: "path-installer-project",
    pathType: "Direct Downstream Channel Supply", candidateRole: "Installer",
    fitComponents: { roleStructureFit: 24, userStageAndSupplyFit: 19, productCustomerScenarioFit: 17,
      procurementAndInfluence: 9, executionFeasibility: 9 }, fitScore: 78, rank: 1,
    findingIds: ["fact-install"], evidenceIds: ["evidence-handoff"],
    reason: "Direct supply supports the installer project route.", prerequisites: ["Validate procurement route"],
    risks: [], unknowns: ["Procurement control"],
    allowedInExternalEmail: true }], selectedPathId: "path-installer-project",
  summary: "Local WLAN installer.", reasons: ["Relevant project activity."],
  risks: ["Procurement influence is not demonstrated."], unknowns: ["Hardware procurement control"],
  evidenceIds: ["evidence-handoff"], model: "scorer", promptVersion: "v3", escalated: false,
  scoringStatus: "completed", warnings: [],
};
const review: LeadAssessmentReview = { candidateId: candidate.candidateId, required: false, triggers: [],
  status: "not-required", primaryModel: "scorer", primaryScore: 75, finalScore: 75,
  materialDisagreements: [], rationale: "No review trigger.", warnings: [] };

describe("LeadHandoffAssembler", () => {
  it("separates externally usable facts from unknown claims and stays within budget", () => {
    const handoff = new LeadHandoffAssembler().assembleOne(candidate, assessment, review, "run-handoff");
    expect(handoff.externallyUsableFacts.map((fact) => fact.factId)).toEqual(["fact-install"]);
    expect(handoff.doNotClaim).toContain("The company controls hardware procurement.");
    expect(handoff.personalizationHooks[0].allowedInEmail).toBe(true);
    expect(handoff.quality.readyForEmail).toBe(true);
    expect(handoff.version).toBe("lead-handoff-v2");
    expect(handoff.decision.cooperationPaths).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(handoff), "utf8")).toBeLessThanOrEqual(16_384);
  });

  it("blocks email readiness when review remains unresolved", () => {
    const unresolved = { ...review, status: "review-failed" as const, warnings: ["Review unavailable"] };
    const handoff = new LeadHandoffAssembler().assembleOne(candidate, assessment, unresolved, "run-handoff");
    expect(handoff.quality.readyForStrategy).toBe(true);
    expect(handoff.quality.readyForEmail).toBe(false);
  });
});
