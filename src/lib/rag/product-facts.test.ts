import { describe, expect, it } from "vitest";

import { extractStructuredProductFacts } from "./product-facts";

describe("extractStructuredProductFacts", () => {
  it("extracts canonical, source-backed product facts without model inference", () => {
    const facts = extractStructuredProductFacts({
      model: "WR3000P",
      productName: "AX3000 2.5G Wi-Fi 6 Mesh PoE Router",
      category: "Multi-Function Wi-Fi Router",
      brand: "Cudy Technology",
      lifecycleStatus: "unknown",
      description: "Wi-Fi 6 Mesh Router, 1 x 2.5Gbps Port (PoE-IN, 802.3at/af), WireGuard, WPA3, Cudy APP",
    });
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factKey: "wireless_generation", factValue: "Wi-Fi 6" }),
      expect.objectContaining({ factKey: "ethernet_speed", factValue: "2.5 Gbps" }),
      expect.objectContaining({ factKey: "poe_standard", factValue: "802.3at" }),
      expect.objectContaining({ factKey: "vpn_protocol", factValue: "WireGuard" }),
    ]));
    expect(new Set(facts.map((fact) => `${fact.factKey}:${fact.normalizedValue}`)).size).toBe(facts.length);
    expect(facts.every((fact) => fact.factHash.length === 64 && fact.evidenceExcerpt.length > 0)).toBe(true);
  });
});
