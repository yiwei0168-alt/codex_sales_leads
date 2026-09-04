import { describe, expect, it } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import { rebindCachedCorrection, roleCorrectionDependency } from "./role-correction-cache";
import type { LeadCandidateCorrection, LeadWorkflowCandidate } from "./types";

const plan: LeadSearchPlan = { countryCode: "MX", countryName: "Mexico", objective: "new-market",
  roles: ["Retailer"], targetCount: 30, queryLanguage: "es", userRequest: "Busca minoristas" };

function candidate(excerpt: string, evidenceRunId = "run-1", evidenceId = "evidence-home"): LeadWorkflowCandidate {
  return { candidateId: "lead-example", evidenceSnapshotRunId: evidenceRunId,
    companyName: "Example Retail", domain: "example.mx", officialWebsiteUrl: "https://example.mx/",
    queryRoles: ["Retailer"], queryFamily: "retail", providerScore: 0, evidenceWarnings: [],
    evidence: [{ id: evidenceId, url: "https://example.mx/", title: "Example",
      excerpt, sourceType: "official-website",
      provider: "tavily", capturedAt: "2026-09-05T00:00:00.000Z", evidenceRunId,
      freshnessStatus: "fresh", contentHash: leadEvidenceContentHash(excerpt) }],
    discoveryGate: { status: "pass", reasonCodes: ["consumer-checkout"],
      missingEvidence: ["store footprint"], roleHints: ["Retailer"], model: "test" } };
}

describe("public role-correction cache fingerprint", () => {
  it("reuses identical public evidence across runs but invalidates changed evidence", () => {
    const first = roleCorrectionDependency(candidate("Tienda de routers con precio y entrega."), plan, "prompt-v1");
    const sameEvidenceNewRun = roleCorrectionDependency(
      candidate("Tienda de routers con precio y entrega.", "run-2", "public-chunk-new-id"), plan, "prompt-v1");
    const changedEvidence = roleCorrectionDependency(candidate("Mayorista para revendedores.", "run-2"), plan, "prompt-v1");
    expect(sameEvidenceNewRun.fingerprint).toBe(first.fingerprint);
    expect(changedEvidence.fingerprint).not.toBe(first.fingerprint);
  });

  it("rebinds cached citations to current-run evidence IDs only when content is exact", () => {
    const current = candidate("Tienda de routers con precio y entrega.", "run-2", "public-chunk-new-id");
    const correction: LeadCandidateCorrection = {
      originalCompanyName: current.companyName, originalDomain: current.domain,
      originalOfficialWebsiteUrl: current.officialWebsiteUrl, resolvedRoles: ["Retailer"],
      resolvedFamilies: ["retail"], primaryRole: "Retailer", primaryFamily: "retail",
      primaryChannelReason: "Retail checkout is supported.", usedSmallLongTailChannelException: false,
      identityChanged: false, routingChanged: false, supplementalEvidenceIds: ["evidence-home"],
      reliedEvidenceIds: ["evidence-home"], findings: [{ findingId: "finding-role", kind: "role",
        statement: "The company is a retailer.", status: "supported", roles: ["Retailer"],
        evidenceIds: ["evidence-home"], sourceTypes: ["official-website"], confidence: 90, notes: [] }],
      reasons: [], confidence: 90, model: "test", promptVersion: "prompt-v1", escalated: false, warnings: [],
    };
    const contentHash = current.evidence[0].contentHash!;
    const rebound = rebindCachedCorrection(current, correction, { "evidence-home": {
      url: "https://example.mx/", contentHash, sourceType: "official-website" } });
    expect(rebound?.reliedEvidenceIds).toEqual(["public-chunk-new-id"]);
    expect(rebound?.findings[0].evidenceIds).toEqual(["public-chunk-new-id"]);
    expect(rebindCachedCorrection(current, correction, { "evidence-home": {
      url: "https://example.mx/", contentHash: "changed", sourceType: "official-website" } })).toBeNull();
  });
});
