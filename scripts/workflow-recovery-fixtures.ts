import type { LeadSearchPlan } from "../src/lib/assistant/types";
import type { LeadRagCitation, LeadMarketPlaybook, LeadWorkflowCandidate, CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "../src/lib/leads/workflow/types";
export const plan: LeadSearchPlan = {
  countryCode: "DE",
  countryName: "德国",
  objective: "new-market",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: 20,
  queryLanguage: "zh-CN",
  userRequest: "搜索德国有开发价值的渠道公司",
};

export const ragContext: LeadRagCitation[] = (["product", "company", "industry"] as const).map((collection, index) => ({
  chunkId: `00000000-0000-4000-8000-00000000000${index + 1}`,
  collection,
  title: `${collection} evidence`,
  content: `${collection} context`,
  score: 0.8,
  retrievalSignals: collection === "product" ? ["vector", "structured"] : ["vector"],
  corroborated: collection === "product",
  structuredFacts: collection === "product"
    ? [{ model: "WR3000", factKey: "category", factValue: "Wi-Fi Router", status: "verified" }] : [],
}));

export const playbook: LeadMarketPlaybook = {
  marketHypothesis: "Test market hypothesis for multi-node development.",
  productAngles: ["SMB networking"],
  preferredCompanyTraits: ["networking customer access"],
  exclusions: ["directories"],
  rolePriorities: [{ family: "distribution", roles: ["Distributor", "VAD"], weight: 1, reason: "Supply path" }],
  searchQueries: [{ family: "distribution", roles: ["Distributor", "VAD"], query: "networking distributor Germany", priority: 1 }],
  ragCitationIds: ragContext.map((item) => item.chunkId),
  generatedBy: "langchain-model",
  model: "test-planner",
  warnings: [],
};

export const candidate: LeadWorkflowCandidate = {
  candidateId: "lead-example",
  evidenceSnapshotRunId: "run-1",
  companyName: "Example GmbH",
  domain: "example.de",
  officialWebsiteUrl: "https://example.de/",
  queryRoles: ["Distributor"],
  queryFamily: "distribution",
  providerScore: 0.8,
  evidence: [{ id: "evidence-example", url: "https://example.de/", title: "Example",
    excerpt: "Networking distributor in Germany", sourceType: "official-website", provider: "test", capturedAt: "2026-08-22T00:00:00Z" }],
  evidenceWarnings: [],
};

export const correctedCandidate: CorrectedLeadWorkflowCandidate = {
  ...candidate,
  correction: { originalCompanyName: candidate.companyName, originalDomain: candidate.domain,
    originalOfficialWebsiteUrl: candidate.officialWebsiteUrl, resolvedRoles: ["Distributor"],
    resolvedFamilies: ["distribution"], primaryRole: "Distributor", primaryFamily: "distribution",
    primaryChannelReason: "Fixture primary route.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false,
    supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-example"], findings: [{
      findingId: "finding-distribution", kind: "role", statement: "Example is a networking distributor.",
      status: "supported", roles: ["Distributor"], evidenceIds: ["evidence-example"],
      sourceTypes: ["official-website"], confidence: 85, notes: [],
    }], reasons: ["Official evidence supports distribution."],
    confidence: 85, model: "test-corrector", promptVersion: "test", escalated: false, warnings: [] },
};

export const assessment: LeadCandidateAssessment = {
  candidateId: candidate.candidateId,
  eligible: true,
  gates: { correctedIdentityUsable: "supported", companyExists: "supported", targetCountryPresence: "supported",
    networkingRelevant: "supported", independentProspect: "supported" },
  roles: ["Distributor"], primaryRole: "Distributor", companyScaleClass: "Regional",
  researchDepth: "standard", recommendationPriority: "High", accountTier: "Priority Distributor",
  supplyModel: "Distributor Supply", brandInvolvement: "Standard",
  dimensions: { productFamilyMatch: 21, customerAndScenarioOverlap: 12, positioningCompatibility: 8,
    cooperationPathAndBuyingInfluence: 12, scaleAndChannelCoverage: 11,
    executionAndEnablement: 7, opportunityAndRisk: 8 },
  dimensionRationales: [],
  totalScore: 79, scoreRange: { lower: 76, upper: 82 }, confidence: 85,
  eligibilityStatus: "eligible", cooperationPaths: [{ pathId: "path-distribution",
    pathType: "Direct Tier-1 Supply", candidateRole: "Distributor",
    fitComponents: { roleStructureFit: 28, userStageAndSupplyFit: 20, productCustomerScenarioFit: 17,
      procurementAndInfluence: 10, executionFeasibility: 7 }, fitScore: 82, rank: 1,
    findingIds: ["finding-distribution"], evidenceIds: ["evidence-example"],
    reason: "Direct tier-1 supply fits the distributor role.", prerequisites: [], risks: [], unknowns: [],
    allowedInExternalEmail: true }], selectedPathId: "path-distribution",
  summary: "Qualified test candidate", reasons: ["Evidence supports fit"],
  risks: [], unknowns: [], evidenceIds: ["evidence-example"], model: "test-scorer",
  promptVersion: "test", escalated: false, scoringStatus: "completed", warnings: [],
};
