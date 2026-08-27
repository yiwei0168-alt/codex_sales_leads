import { describe, expect, it } from "vitest";

import { prepareSharedEvidenceDossiers, providerNeutralScoringEvidence, refreshEvidenceDossier } from "./evidence-dossier";

const pool = {
  schemaVersion: 1,
  runId: "test-run",
  uniqueCompanyCount: 2,
  submittedOccurrenceCount: 2,
  companies: [
    {
      companyName: "WLAN-Shop24 (Varistano GmbH)", officialUrl: "https://www.wlan-shop24.de/",
      occurrences: [{ systemId: "product-gemini", channelId: "b2b-resale" as const, rank: 1, roles: ["Reseller"],
        evidenceItems: [{ url: "https://www.wlan-shop24.de/", excerpt: "Here are 10 networking companies including WLAN-Shop24." }] }],
    },
    {
      companyName: "WLAN-Shop24.de", officialUrl: null,
      occurrences: [{ systemId: "product-exa", channelId: "project-services" as const, rank: 2, roles: ["Installer"],
        evidenceItems: [{ url: "https://linkedin.com/company/wlan-shop24.de", excerpt: "Provider-generated company summary." }] }],
    },
  ],
};

describe("shared evidence dossiers", () => {
  it("merges strong brand/platform aliases when official domains do not conflict", () => {
    const artifact = prepareSharedEvidenceDossiers(pool);
    expect(artifact.canonicalCompanyCount).toBe(1);
    expect(artifact.companies[0].sourcePoolNames).toHaveLength(2);
    expect(artifact.companies[0].requestedLanes).toEqual(["b2b-resale", "project-services"]);
    expect(artifact.companies[0].submittedOccurrences).toHaveLength(2);
  });

  it("keeps all reused discovery material out of the provider-neutral scoring view", () => {
    const dossier = prepareSharedEvidenceDossiers(pool).companies[0];
    expect(dossier.evidence.every((item) => item.sourceType === "discovery-summary")).toBe(true);
    expect(providerNeutralScoringEvidence(dossier)).toEqual([]);
    expect(dossier.enrichmentStatus).toBe("seeded-needs-enrichment");
  });

  it("refreshes every submitted lane from one shared set of directly collected evidence", () => {
    const dossier = prepareSharedEvidenceDossiers(pool).companies[0];
    dossier.evidence.push({
      evidenceId: "OFFICIAL-1", url: "https://www.wlan-shop24.de/about", sourceType: "official-company",
      acquisition: "direct-fetch", capturedAt: "2026-08-27T00:00:00.000Z", sourceSystems: [],
      excerpt: "WLAN-Shop24 is operated by Varistano GmbH and headquartered in Germany. We sell routers, PoE switches and wireless access points to business customers, provide quotations, design WLAN solutions and install the selected equipment.",
    });
    const refreshed = refreshEvidenceDossier(dossier);
    expect(refreshed.claimCoverage.activeNetworking).toBe(true);
    expect(refreshed.claimCoverage.laneMembership["b2b-resale"].demonstrated).toBe(true);
    expect(refreshed.claimCoverage.laneMembership["project-services"].demonstrated).toBe(true);
    expect(refreshed.enrichmentStatus).toBe("ready-for-rescoring");
  });

  it("does not merge identical names when two different official domains conflict", () => {
    const artifact = prepareSharedEvidenceDossiers({
      ...pool, companies: [
        { ...pool.companies[0], companyName: "Example GmbH", officialUrl: "https://example.de/" },
        { ...pool.companies[1], companyName: "Example GmbH", officialUrl: "https://example.com/" },
      ],
    });
    expect(artifact.canonicalCompanyCount).toBe(2);
  });

  it("does not accept a same-domain page that names a different business", () => {
    const dossier = prepareSharedEvidenceDossiers(pool).companies[0];
    dossier.evidence.push({
      evidenceId: "WRONG", url: "https://www.wlan-shop24.de/", sourceType: "official-company",
      acquisition: "direct-fetch", capturedAt: "2026-08-27T00:00:00.000Z", sourceSystems: [],
      excerpt: "Different Trading GmbH in Germany sells routers and switches to business customers.",
    });
    const refreshed = refreshEvidenceDossier(dossier);
    expect(refreshed.claimCoverage.identity).toBe(false);
    expect(refreshed.enrichmentStatus).not.toBe("ready-for-rescoring");
  });

  it("recognizes a concrete German five-digit postal address as market-presence evidence", () => {
    const dossier = prepareSharedEvidenceDossiers(pool).companies[0];
    dossier.evidence.push({
      evidenceId: "GERMAN-ADDRESS", url: "https://www.wlan-shop24.de/impressum", sourceType: "official-company",
      acquisition: "direct-fetch", capturedAt: "2026-08-27T00:00:00.000Z", sourceSystems: [],
      excerpt: "WLAN-Shop24 Varistano GmbH, Musterstraße 1, 20095 Hamburg. We sell routers and switches.",
    });
    expect(refreshEvidenceDossier(dossier).claimCoverage.germanyPresence).toBe(true);
  });
});
