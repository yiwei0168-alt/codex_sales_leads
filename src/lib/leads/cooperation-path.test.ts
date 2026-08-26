import { describe, expect, it } from "vitest";

import { assessCooperationPathEvidence } from "./cooperation-path";

describe("evidence-capped cooperation path", () => {
  it("caps generic role relevance with no demonstrated control at level 2", () => {
    const result = assessCooperationPathEvidence({ lane: "project-services", evidence: [
      "The company provides enterprise networking and IT infrastructure services.",
    ] });
    expect(result.cap).toBe(2);
  });

  it("caps one explicit cooperation lever at level 3", () => {
    const result = assessCooperationPathEvidence({ lane: "b2b-resale", evidence: [
      "Request a quote for routers and business Wi-Fi products.",
    ] });
    expect(result.cap).toBe(3);
  });

  it("caps multiple complementary levers at level 4 without a complete path", () => {
    const result = assessCooperationPathEvidence({ lane: "project-services", evidence: [
      "The team specifies network equipment and deploys WLAN access points for customer projects.",
    ] });
    expect(result.cap).toBe(4);
  });

  it("allows level 5 for a complete Tier-1 path", () => {
    const result = assessCooperationPathEvidence({ lane: "tier1-distribution", evidence: [
      "Authorized networking distributor with a reseller portal supplying dealers and system integrators.",
    ] });
    expect(result.cap).toBe(5);
  });

  it("allows level 5 when a live Cudy listing proves the path", () => {
    const result = assessCooperationPathEvidence({ lane: "b2b-resale", evidence: [
      "Cudy WR3000 is in stock, with price and Add to cart available now.",
    ] });
    expect(result.cap).toBe(5);
  });

  it("caps customer-supplied installation at level 2", () => {
    const result = assessCooperationPathEvidence({ lane: "project-services", evidence: [
      "Installation only for customer-supplied equipment and WLAN access points.",
    ] });
    expect(result.cap).toBe(2);
  });

  it("does not treat a Cudy partner label alone as a live transaction", () => {
    const result = assessCooperationPathEvidence({ lane: "b2b-resale", evidence: [
      "The company is described as a current Cudy partner.",
    ] });
    expect(result.cap).toBe(2);
    expect(result.completeRepeatablePath).toBe(false);
  });
});
