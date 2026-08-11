import { describe, expect, it } from "vitest";
import { classificationEvals, searchBriefEvals } from "@/data/evals";
import { buildDevelopmentPlan, validateTaxonomy, type CompanyRecord } from "@/lib/domain";

const isp: CompanyRecord = {
  id: "isp-test",
  legalName: "Public ISP Test Record",
  displayName: "Public ISP Test Record",
  domain: "example.com",
  city: "Mexico City",
  country: "Mexico",
  layer: "Downstream Channel",
  roles: ["ISP"],
  accountTier: "KA",
  supplyModel: "Brand Direct",
  brandInvolvement: "Deep",
  fitScore: 90,
  accountValue: 95,
  reachability: 55,
  evidenceConfidence: 90,
  summary: "Test fixture, not production data.",
  opportunityStage: "Priority",
  priority: "High",
  owner: "Demo owner",
  nextAction: "Review",
  risks: [],
  unknowns: ["Procurement cycle"],
  evidence: [{
    id: "ev-test",
    sourceUrl: "https://example.com",
    title: "Fixture",
    sourceType: "Company website",
    capturedAt: "2026-08-11",
    claim: "Fixture claim",
    summary: "The organization offers internet services",
    status: "Verified",
    confidence: 90,
  }],
};

describe("domain rules", () => {
  it("keeps ISP in the downstream layer and KA outside roles", () => {
    expect(validateTaxonomy(isp)).toEqual([]);
    expect(isp.roles).not.toContain("KA");
    expect(isp.accountTier).toBe("KA");
  });

  it("produces an evidence-linked plan", () => {
    const plan = buildDevelopmentPlan(isp);
    expect(plan.supplyPath).toBe("Brand Direct");
    expect(plan.evidenceIds).toContain("ev-test");
    expect(plan.draft).toContain("[ev-test]");
  });

  it("includes the PRD minimum eval suites", () => {
    expect(searchBriefEvals.length).toBeGreaterThanOrEqual(12);
    expect(classificationEvals.length).toBeGreaterThanOrEqual(20);
  });
});
