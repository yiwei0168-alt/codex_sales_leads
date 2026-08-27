import { describe, expect, it } from "vitest";

import { assessChannelMembershipEvidence } from "./channel-membership";

describe("multi-role channel membership", () => {
  it("records several supported roles without choosing a primary role", () => {
    const result = assessChannelMembershipEvidence({ lane: "services", evidence: [
      "We are a system integrator that designs WLAN networks, installs access points and resells routers.",
    ] });
    expect(result.demonstrated).toBe(true);
    expect(result.supportedRoles).toEqual(expect.arrayContaining(["SI", "Installer", "Reseller"]));
  });

  it("admits any lane whose actual business is demonstrated", () => {
    const evidence = ["We install WLAN access points and sell routers to business customers."];
    expect(assessChannelMembershipEvidence({ lane: "services", evidence }).demonstrated).toBe(true);
    expect(assessChannelMembershipEvidence({ lane: "resale", evidence }).demonstrated).toBe(true);
  });

  it("does not infer Tier-1 distribution from direct buying or resale alone", () => {
    const result = assessChannelMembershipEvidence({ lane: "distribution", evidence: [
      "Direct-buy VAR selling routers to final business customers.",
    ] });
    expect(result.demonstrated).toBe(false);
    expect(result.supportedRoles).toEqual(expect.arrayContaining(["VAR", "Reseller"]));
  });

  it("does not classify a company as Distributor merely because it buys from one", () => {
    const result = assessChannelMembershipEvidence({ lane: "distribution", evidence: [
      "The VAR buys routers from a national distributor and resells them to final customers.",
    ] });
    expect(result.demonstrated).toBe(false);
    expect(result.supportedRoles).not.toContain("Distributor");
  });

  it("maps VAD to both VAD and Distributor", () => {
    const result = assessChannelMembershipEvidence({ lane: "distribution", evidence: [
      "Value-added distributor providing pre-sales engineering and reseller enablement.",
    ] });
    expect(result.demonstrated).toBe(true);
    expect(result.supportedRoles).toEqual(expect.arrayContaining(["VAD", "Distributor"]));
  });

  it("does not treat installation-only evidence as SI", () => {
    const result = assessChannelMembershipEvidence({ lane: "services", evidence: [
      "The company installs WLAN access points according to customer specifications.",
    ] });
    expect(result.supportedRoles).toContain("Installer");
    expect(result.supportedRoles).not.toContain("SI");
  });

  it("does not let an unrelated software Fachhändler label prove networking resale", () => {
    const result = assessChannelMembershipEvidence({ lane: "resale", evidence: [
      "Sage-Fachhändler and IT consultant. We also plan and install WLAN solutions for offices.",
    ] });
    expect(result.demonstrated).toBe(false);
    expect(result.supportedRoles).not.toContain("Dealer");
  });

  it("admits a mixed B2B online networking shop as both E-tailer and Reseller", () => {
    const result = assessChannelMembershipEvidence({ lane: "resale", evidence: [
      "Online shop with B2B purchase on invoice, a cart, and live router and PoE switch products.",
    ] });
    expect(result.demonstrated).toBe(true);
    expect(result.supportedRoles).toEqual(expect.arrayContaining(["E-tailer", "Reseller"]));
  });
});
