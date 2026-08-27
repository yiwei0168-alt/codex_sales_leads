import { describe, expect, it } from "vitest";

import { collectEvidenceDossier } from "./evidence-collector";
import { prepareSharedEvidenceDossiers } from "./evidence-dossier";

function seedDossier() {
  return prepareSharedEvidenceDossiers({
    schemaVersion: 1, runId: "test", uniqueCompanyCount: 1, submittedOccurrenceCount: 1,
    companies: [{ companyName: "Local WLAN GmbH", officialUrl: "https://local-wlan.de/", occurrences: [{
      systemId: "product-exa", channelId: "project-services", rank: 1, roles: ["Installer"], evidenceItems: [],
    }] }],
  }).companies[0];
}

describe("shared evidence collection budget", () => {
  it("uses direct official pages first and stops a supported small long-tail dossier early", async () => {
    const fetched: string[] = [];
    const result = await collectEvidenceDossier(seedDossier(), {
      capturedAt: "2026-08-27T00:00:00.000Z",
      pageFetcher: { fetch: async (url) => {
        fetched.push(url);
        return {
          url, links: ["https://local-wlan.de/services", "https://local-wlan.de/impressum"],
          text: "Local WLAN is an owner-operated local installer in Germany with 7 employees. We design and install business WLAN networks, access points, routers and PoE switches, select equipment and manage deployment.",
        };
      } },
    });
    expect(fetched).toHaveLength(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.dossier.evidenceProfileAssessment.profile).toBe("confirmed-small-long-tail");
    expect(result.dossier.enrichmentStatus).toBe("ready-for-rescoring");
  });

  it("caps direct attempts at five and preserves failures as unknown", async () => {
    const dossier = seedDossier();
    dossier.retrievalPlan.initialOfficialTargets = Array.from({ length: 8 }, (_, index) => `https://local-wlan.de/page-${index}`);
    const result = await collectEvidenceDossier(dossier, {
      capturedAt: "2026-08-27T00:00:00.000Z",
      pageFetcher: { fetch: async () => { throw new Error("timeout"); } },
    });
    expect(result.officialPagesAttempted).toBe(5);
    expect(result.dossier.enrichmentStatus).toBe("seeded-needs-enrichment");
    expect(result.dossier.collectionLog.filter((item) => item.status === "failed")).toHaveLength(5);
    expect(result.stopReason).toBe("fallback-not-configured");
  });

  it("limits fallback material to two sources", async () => {
    const result = await collectEvidenceDossier(seedDossier(), {
      capturedAt: "2026-08-27T00:00:00.000Z",
      pageFetcher: { fetch: async () => { throw new Error("blocked"); } },
      fallbackAdapter: { collect: async () => ({
        sources: Array.from({ length: 3 }, (_, index) => ({
          url: `https://directory-${index}.example/company`, text: `Concrete public source ${index} about the company.`,
          acquisition: "fallback-search" as const, sourceType: "independent-public" as const,
        })),
        attempts: [],
      }) },
    });
    expect(result.fallbackSourcesCollected).toBe(2);
  });

  it("enforces the fallback budget cumulatively across resumable collection attempts", async () => {
    const first = await collectEvidenceDossier(seedDossier(), {
      capturedAt: "2026-08-27T00:00:00.000Z",
      pageFetcher: { fetch: async () => { throw new Error("blocked"); } },
      fallbackAdapter: { collect: async () => ({
        sources: [0, 1].map((index) => ({
          url: `https://directory-${index}.example/company`, text: `Concrete public source ${index} about the company.`,
          acquisition: "fallback-search" as const, sourceType: "independent-public" as const,
        })),
        attempts: [],
      }) },
    });
    let fallbackCalls = 0;
    const resumed = await collectEvidenceDossier(first.dossier, {
      capturedAt: "2026-08-27T01:00:00.000Z",
      skipOfficial: true,
      pageFetcher: { fetch: async () => { throw new Error("Direct fetch must not run in fallback-only mode"); } },
      fallbackAdapter: { collect: async () => {
        fallbackCalls += 1;
        return { sources: [], attempts: [] };
      } },
    });
    expect(fallbackCalls).toBe(0);
    expect(resumed.fallbackSourcesCollected).toBe(0);
    expect(resumed.stopReason).toBe("fallback-budget-already-exhausted");
  });

  it("redacts contacts and strips cookie-manager boilerplate from stored evidence", async () => {
    const result = await collectEvidenceDossier(seedDossier(), {
      capturedAt: "2026-08-27T00:00:00.000Z",
      pageFetcher: { fetch: async (url) => ({ url, links: [],
        text: "Local WLAN in Germany sells routers. Email hello@example.de or +49 30 1234 5678. Wie wir Cookies verwenden: analytics details." }) },
    });
    const evidence = result.dossier.evidence.find((item) => item.acquisition === "direct-fetch")!;
    expect(evidence.excerpt).not.toContain("hello@example.de");
    expect(evidence.excerpt).not.toContain("1234");
    expect(evidence.excerpt).not.toContain("analytics details");
  });
});
