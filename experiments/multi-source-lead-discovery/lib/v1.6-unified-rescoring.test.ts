import { describe, expect, it } from "vitest";

import type { SharedEvidenceDossier } from "./evidence-dossier";
import {
  assessV16CooperationPath,
  assessV16ProductFit,
  evaluateV16Candidate,
  extractV16Facts,
  targetRoutesForV16,
} from "./v1.6-unified-rescoring";

function dossier(excerpt: string): SharedEvidenceDossier {
  return {
    dossierId: "DOS-TEST",
    canonicalName: "Test Netzwerk GmbH",
    canonicalOfficialUrl: "https://example.de/",
    canonicalDomain: "example.de",
    sourcePoolNames: ["Test Netzwerk GmbH"],
    aliases: ["test netzwerk"],
    legalIdentityAliases: ["test netzwerk gmbh"],
    identityStatus: "resolved",
    identityConflicts: [],
    requestedLanes: ["project-services"],
    submittedOccurrences: [{ systemId: "test", channelId: "project-services", rank: 1, submittedRoles: [] }],
    evidence: [{
      evidenceId: "EVID-TEST",
      url: "https://example.de/netzwerk",
      excerpt,
      sourceType: "official-company",
      acquisition: "direct-fetch",
      capturedAt: null,
      sourceSystems: [],
    }],
    evidenceProfileAssessment: {
      profile: "standard",
      confidence: "none",
      exceptionEligible: false,
      directSizeSignals: [],
      structuralSignals: [],
      longTailSignals: [],
      largeCompanyOverrides: [],
      reason: "test",
    },
    claimCoverage: {
      identity: true,
      germanyPresence: true,
      activeNetworking: true,
      laneMembership: {
        "tier1-distribution": { requested: false, demonstrated: false, supportedRoles: [] },
        "b2b-resale": { requested: false, demonstrated: false, supportedRoles: [] },
        "project-services": { requested: true, demonstrated: false, supportedRoles: [] },
      },
      cooperationPathCaps: { "tier1-distribution": 2, "b2b-resale": 2, "project-services": 2 },
    },
    enrichmentStatus: "partially-supported",
    retrievalPlan: {
      officialPageBudget: 5,
      fallbackSourceBudget: 2,
      directFetchFirst: true,
      longTailEarlyStopAllowed: false,
      initialOfficialTargets: ["https://example.de/"],
      pageIntents: [],
      fallbackOrder: ["tavily-extract", "exa-or-search"],
    },
    collectionLog: [],
  };
}

describe("v1.6 unified rescoring", () => {
  it("recognizes inflected German project actions without treating design alone as product selection", () => {
    const facts = extractV16Facts(dossier(
      "Wir konzipieren und implementieren Netzwerkstrukturen mit WLAN, Switches und Routern für Gewerbekunden.",
    ));
    expect(facts.supportedRoles).toEqual(expect.arrayContaining(["SI", "Installer"]));
    expect(facts.businessActions).toEqual(expect.arrayContaining(["planning", "implementation"]));
    expect(facts.businessActions).not.toContain("selection-or-advice");
    expect(assessV16CooperationPath("project-services", facts).level).toBe(4);
    expect(assessV16ProductFit(facts).level).toBe(4);
  });

  it("does not let one generic data-centre mention erase broad product-family evidence", () => {
    const facts = extractV16Facts(dossier(
      "LAN und WAN Lösungen mit WLAN Access Points, Switches und Routern. Zusätzlich gestalten wir Data Center.",
    ));
    expect(facts.productFamilies.length).toBeGreaterThanOrEqual(3);
    expect(facts.enterpriseOnlyContext).toBe(false);
    expect(assessV16ProductFit(facts).level).toBe(4);
  });

  it("keeps explicit high-end-only context discounted", () => {
    const facts = extractV16Facts(dossier(
      "Arista Data Center und Cisco Nexus Switching für Hyperscale-Rechenzentren.",
    ));
    expect(facts.enterpriseOnlyContext).toBe(true);
    expect(assessV16ProductFit(facts).level).toBe(2);
  });

  it("recomputes all value levels and applies the 44/32/20/3/1 weights", () => {
    const row = evaluateV16Candidate({
      dossier: dossier("Value Added Distributor für Omada Netzwerktechnik und Systemhäuser."),
      systemId: "test",
      channelId: "tier1-distribution",
      sourceChannelIds: ["tier1-distribution"],
      submittedRank: 1,
      priorV15: [{
        channelId: "tier1-distribution",
        score: 0,
        levels: { productUseCaseFit: 0, cooperationPath: 0, independentInformationConfidence: 0 },
      }],
    });
    expect(row.levels.productUseCaseFit).toBe(5);
    expect(row.levels.cooperationPath).toBe(5);
    expect(row.scoreComponents).toEqual({
      productUseCaseFit: 44,
      cooperationPath: 32,
      independentInformationConfidence: 16,
      roleIdentificationQuality: 3,
      channelClassificationQuality: 1,
    });
    expect(row.score).toBe(96);
  });

  it("reroutes a project-only company out of an incorrect tier1 source lane", () => {
    const facts = extractV16Facts(dossier(
      "Wir installieren und implementieren WLAN Access Points und Switches bei Kunden.",
    ));
    expect(facts.correctedRoutes).toEqual(["project-services"]);
    expect(targetRoutesForV16(facts, ["tier1-distribution"])).toEqual(["project-services"]);
  });

  it("scores cooperation only for the current corrected route", () => {
    const testDossier = dossier(
      "Wir beraten, planen, installieren und implementieren WLAN Access Points und Switches bei Kunden.",
    );
    const project = evaluateV16Candidate({
      dossier: testDossier,
      systemId: "test",
      channelId: "project-services",
      sourceChannelIds: ["tier1-distribution"],
      submittedRank: 1,
    });
    const forcedTier1 = evaluateV16Candidate({
      dossier: testDossier,
      systemId: "test",
      channelId: "tier1-distribution",
      sourceChannelIds: ["tier1-distribution"],
      submittedRank: 1,
    });
    expect(project.levels.cooperationPath).toBe(5);
    expect(forcedTier1.levels.cooperationPath).toBe(1);
    expect(project.cooperationPathRoute).toBe("project-services");
    expect(forcedTier1.cooperationPathRoute).toBe("tier1-distribution");
  });
});
