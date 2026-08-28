import { describe, expect, it } from "vitest";

import { selectPrimaryChannel } from "./primary-channel";

describe("selectPrimaryChannel", () => {
  it("keeps all supported families but routes a standard distributor upward", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor", "Reseller", "E-tailer"],
      smallLongTailExceptionEligible: false });
    expect(result.supportedFamilies).toEqual(["distribution", "resale", "retail"]);
    expect(result.primaryRole).toBe("Distributor");
    expect(result.primaryFamily).toBe("distribution");
    expect(result.primaryChannel).toBe("tier1-distribution");
    expect(result.usedSmallLongTailException).toBe(false);
  });

  it("routes a positively evidenced small long-tail mixed company downstream", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor", "VAR", "Reseller", "Installer"],
      smallLongTailExceptionEligible: true });
    expect(result.supportedFamilies).toEqual(["distribution", "resale", "services"]);
    expect(result.primaryRole).toBe("VAR");
    expect(result.primaryFamily).toBe("resale");
    expect(result.primaryChannel).toBe("b2b-resale");
    expect(result.usedSmallLongTailException).toBe(true);
  });

  it("does not demote a small long-tail company with only a distribution role", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor"], smallLongTailExceptionEligible: true });
    expect(result.primaryFamily).toBe("distribution");
    expect(result.usedSmallLongTailException).toBe(false);
  });

  it("returns no display route without an evidence-supported role", () => {
    expect(selectPrimaryChannel({ roles: [], smallLongTailExceptionEligible: false }).primaryChannel).toBeNull();
  });
});
