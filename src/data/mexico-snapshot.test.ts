import { describe, expect, it } from "vitest";
import { mexicoCompanies, snapshotMeta } from "@/data/mexico-snapshot";
import { validateTaxonomy } from "@/lib/domain";

describe("Mexico public-data snapshot", () => {
  it("meets the minimum market coverage", () => {
    const roles = new Set(mexicoCompanies.flatMap((company) => company.roles));
    expect(mexicoCompanies.length).toBeGreaterThanOrEqual(30);
    expect(roles.size).toBeGreaterThanOrEqual(4);
    expect(mexicoCompanies.some((company) => company.layer === "Tier-1 Distributor")).toBe(true);
    expect(mexicoCompanies.some((company) => company.layer === "Downstream Channel")).toBe(true);
  });

  it("keeps identity facts traceable", () => {
    for (const company of mexicoCompanies) {
      expect(validateTaxonomy(company), company.displayName).toEqual([]);
      expect(company.evidence.length, company.displayName).toBeGreaterThan(0);
      for (const evidence of company.evidence) {
        expect(evidence.sourceUrl, evidence.id).toMatch(/^https:\/\//);
        expect(evidence.capturedAt, evidence.id).toBe(snapshotMeta.capturedAt);
        expect(evidence.claim.length, evidence.id).toBeGreaterThan(12);
      }
    }
  });

  it("requires at least two evidence records for Priority-stage nodes", () => {
    const priorityNodes = mexicoCompanies.filter((company) => company.opportunityStage === "Priority");
    expect(priorityNodes.length).toBeGreaterThan(0);
    for (const company of priorityNodes) {
      expect(company.evidence.length, company.displayName).toBeGreaterThanOrEqual(2);
    }
  });
});
