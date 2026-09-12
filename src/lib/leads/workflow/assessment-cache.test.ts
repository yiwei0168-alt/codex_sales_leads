import { describe, expect, it } from "vitest";

import type { CorrectedLeadWorkflowCandidate, LeadMarketPlaybook } from "./types";
import { assessmentDependencyFingerprint,loadCachedLeadAssessments,saveCachedLeadAssessments } from "./assessment-cache";
import {leadEvidenceContentHash} from "@/lib/leads/evidence-snapshot";

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
  it("includes country, full request contract and evidence source even with a valid content hash",()=>{
    const original=structuredClone(candidate);
    original.evidence[0].contentHash=leadEvidenceContentHash(original.evidence[0].excerpt);
    const context={countryCode:"DE",countryName:"Germany",executionContract:"a".repeat(64)};
    const fingerprint=assessmentDependencyFingerprint(original,playbook,"new-market",context);
    expect(assessmentDependencyFingerprint(original,playbook,"new-market",{...context,countryCode:"MX"})).not.toBe(fingerprint);
    expect(assessmentDependencyFingerprint(original,playbook,"new-market",{...context,executionContract:"b".repeat(64)})).not.toBe(fingerprint);
    for(const field of ["url","title","excerpt"] as const){
      const changed=structuredClone(original);changed.evidence[0][field]+=" changed";
      expect(assessmentDependencyFingerprint(changed,playbook,"new-market",context)).not.toBe(fingerprint);
    }
    original.evidence[0].freshnessStatus="fresh";
    original.evidence[0].evidenceRunId=original.evidenceSnapshotRunId;
    expect(assessmentDependencyFingerprint(original,playbook,"new-market",context)).not.toBe(fingerprint);
  });
  it("does not access historical entries without country and request contracts",async()=>{
    const options={userId:"fixture",workspaceId:"fixture",candidates:[candidate],playbook,objective:"new-market"};
    expect((await loadCachedLeadAssessments(options)).size).toBe(0);
    await expect(saveCachedLeadAssessments({...options,assessments:[]})).resolves.toBeUndefined();
  });
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
