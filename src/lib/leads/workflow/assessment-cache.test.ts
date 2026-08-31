import { describe, expect, it } from "vitest";

import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "./types";
import { assessmentDependencyFingerprint } from "./assessment-cache";

const candidate: CorrectedLeadWorkflowCandidate = {
  candidateId: "candidate-1", evidenceSnapshotRunId: "snapshot-a", companyName: "Example GmbH",
  domain: "example.de", officialWebsiteUrl: "https://example.de", queryRoles: ["Distributor"],
  queryFamily: "distribution", providerScore: 0.8, evidenceWarnings: [],
  evidence: [{ id: "evidence-1", url: "https://example.de/about", title: "About",
    excerpt: "Networking distributor", sourceType: "official-website", provider: "test",
    capturedAt: "2026-08-01T00:00:00Z", evidenceRunId: "run-a" }],
  correction: { originalCompanyName: "Example GmbH", originalDomain: "example.de",
    originalOfficialWebsiteUrl: "https://example.de", resolvedRoles: ["Distributor"],
    resolvedFamilies: ["distribution"], primaryRole: "Distributor", primaryFamily: "distribution",
    primaryChannelReason: "Supported by official evidence.", usedSmallLongTailChannelException: false,
    identityChanged: false, routingChanged: false, supplementalEvidenceIds: [],
    reliedEvidenceIds: ["evidence-1"], findings: [{ findingId: "finding-1", kind: "role",
      statement: "The company distributes networking equipment.", status: "supported",
      roles: ["Distributor"], evidenceIds: ["evidence-1"], sourceTypes: ["official-website"],
      confidence: 90, notes: [] }], reasons: [], confidence: 90, model: "model-a",
    promptVersion: "correction-v1", escalated: false, warnings: [] },
};

const playbook: LeadMarketPlaybook = {
  marketHypothesis: "Develop through role-aware routes.", productAngles: ["SMB networking"],
  preferredCompanyTraits: ["networking access"], exclusions: [], rolePriorities: [], searchQueries: [],
  ragCitationIds: [], generatedBy: "deterministic-fallback", cooperationPathMemory: [], warnings: [],
};

describe("assessment dependency cache", () => {
  it("ignores run bookkeeping while invalidating semantic evidence changes", () => {
    const original = assessmentDependencyFingerprint(candidate, playbook, "new-market");
    const replay = structuredClone(candidate);
    replay.evidenceSnapshotRunId = "snapshot-b";
    replay.evidence[0].capturedAt = "2026-08-31T00:00:00Z";
    replay.evidence[0].evidenceRunId = "run-b";
    expect(assessmentDependencyFingerprint(replay, playbook, "new-market")).toBe(original);

    replay.evidence[0].excerpt = "Consumer electronics retailer";
    expect(assessmentDependencyFingerprint(replay, playbook, "new-market")).not.toBe(original);
  });

  it("invalidates a candidate when private path memory changes", () => {
    const original = assessmentDependencyFingerprint(candidate, playbook, "new-market");
    const changed: LeadMarketPlaybook = { ...playbook, cooperationPathMemory: [{
      selectedPathType: "Direct Tier-1 Supply", primaryBusinessRole: "Distributor",
      marketCode: "DE", learnedAt: "2026-08-31T00:00:00Z",
    }] };
    expect(assessmentDependencyFingerprint(candidate, changed, "new-market")).not.toBe(original);
  });
});
