import { describe, expect, it } from "vitest";

import { leadEvidenceContentHash } from "../evidence-snapshot";
import { buildModelEvidencePacket } from "./evidence-packet";
import type { CorrectedLeadWorkflowCandidate } from "./types";

function fixture(): CorrectedLeadWorkflowCandidate {
  const evidence = Array.from({ length: 8 }, (_, index) => {
    const excerpt = index === 0
      ? `${"generic company introduction ".repeat(120)} Supplies managed PoE switches to downstream resellers. ${"footer ".repeat(120)}`
      : `Evidence ${index} about ${index % 2 === 0 ? "network routers and Wi-Fi" : "generic services"}.`;
    return { id: `evidence-${index}`, url: `https://example.com/${index}`, title: `Page ${index}`, excerpt,
      sourceType: index < 2 ? "official-website" as const : "independent-public" as const,
      provider: "fixture", capturedAt: "2026-08-30T00:00:00Z", evidenceRunId: "run-packet",
      contentHash: leadEvidenceContentHash(excerpt), freshnessStatus: "fresh" as const };
  });
  return { candidateId: "lead-packet", evidenceSnapshotRunId: "run-packet", companyName: "Packet GmbH",
    domain: "example.com", officialWebsiteUrl: "https://example.com", queryRoles: ["Distributor"],
    queryFamily: "distribution", providerScore: 0.8, evidence, evidenceWarnings: [], correction: {
      originalCompanyName: "Packet GmbH", originalDomain: "example.com",
      originalOfficialWebsiteUrl: "https://example.com", resolvedRoles: ["Distributor"],
      resolvedFamilies: ["distribution"], primaryRole: "Distributor", primaryFamily: "distribution",
      primaryChannelReason: "Supported distribution.", usedSmallLongTailChannelException: false,
      identityChanged: false, routingChanged: false, supplementalEvidenceIds: [], reliedEvidenceIds: ["evidence-0"],
      findings: [], reasons: ["Supported"], confidence: 90, model: "fixture", promptVersion: "fixture",
      escalated: false, warnings: [],
    } };
}

describe("buildModelEvidencePacket", () => {
  it("retains every finding-linked evidence item while bounding unlinked context and excerpt size", () => {
    const packet = buildModelEvidencePacket(fixture(), { requiredEvidenceIds: ["evidence-0", "evidence-6"],
      maxUnlinkedItems: 2, maxExcerptCharacters: 700, relevanceText: "managed PoE switches reseller" });
    expect(packet.map((item) => item.evidenceId)).toEqual(expect.arrayContaining(["evidence-0", "evidence-6"]));
    expect(packet).toHaveLength(4);
    expect(packet.every((item) => item.excerpt.length <= 700)).toBe(true);
    expect(packet.find((item) => item.evidenceId === "evidence-0")?.excerpt).toContain("PoE switches");
  });

  it("never includes stale or discovery-only evidence", () => {
    const candidate = fixture();
    candidate.evidence.push({ ...candidate.evidence[0], id: "old", sourceType: "discovery",
      evidenceRunId: "old-run", freshnessStatus: "stale" });
    const packet = buildModelEvidencePacket(candidate, { requiredEvidenceIds: ["old", "evidence-0"],
      maxUnlinkedItems: 0, maxExcerptCharacters: 700 });
    expect(packet.map((item) => item.evidenceId)).toEqual(["evidence-0"]);
  });
});
