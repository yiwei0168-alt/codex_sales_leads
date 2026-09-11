import { describe, expect, it } from "vitest";
import type { CompanyRecord } from "@/lib/domain";
import { companyOverride } from "./company-overrides";

const company = { primaryBusinessRole: "SI", roles: ["SI", "Reseller"], layer: "Downstream Channel",
  accountTier: "KA", fitScore: 81 } as CompanyRecord;

describe("user company overrides", () => {
  it("moves a KA to distributor without retaining an invalid tier or claiming a fresh score", () => {
    expect(companyOverride(company, { primaryBusinessRole: "Distributor" })).toMatchObject({
      layer: "Tier-1 Distributor", accountTier: "Standard Distributor", assessmentNeedsRefresh: true,
      roles: ["Distributor", "SI", "Reseller"],
    });
    expect(company.fitScore).toBe(81);
  });
  it("rejects incompatible explicit tier even on a combined role edit", () => {
    expect(() => companyOverride(company, { primaryBusinessRole: "VAD", accountTier: "KA" })).toThrow();
  });
  it("does not invalidate a score for an unchanged role or path-only update", () => {
    expect(companyOverride(company, { primaryBusinessRole: "SI" })).toEqual({});
    expect(companyOverride(company, { selectedCooperationPath: "Other" })).toEqual({
      selectedCooperationPath: "Other", selectedPathId: "user-selected",
    });
  });
});
