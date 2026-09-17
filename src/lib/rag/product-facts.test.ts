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

  it("keeps decimal link rates separate from cellular generations", () => {
    const facts = extractStructuredProductFacts({
      model: "MODEL-A", productName: "Example", category: "Access Point", brand: "Example", lifecycleStatus: "active",
      description: "One 2.5G RJ45 port and one 2.5Gbps uplink.",
    });
    expect(facts).toEqual(expect.arrayContaining([expect.objectContaining({ factKey: "ethernet_speed", factValue: "2.5 Gbps" })]));
    expect(facts).not.toEqual(expect.arrayContaining([expect.objectContaining({ factKey: "cellular_generation", factValue: "5G" })]));
  });

  it("preserves plus-qualified interfaces without adding the base interface", () => {
    const facts = extractStructuredProductFacts({
      model: "MODEL-B", productName: "Example", category: "Switch", brand: "Example", lifecycleStatus: "active",
      description: "Includes two SFP+ uplink ports.",
    });
    expect(facts.filter((fact) => fact.factKey === "interface_type").map((fact) => fact.factValue)).toEqual(["SFP+"]);
  });

  it("does not turn negated capabilities into positive facts", () => {
    const facts = extractStructuredProductFacts({
      model: "MODEL-C", productName: "Example", category: "Router", brand: "Example", lifecycleStatus: "active",
      description: "No PoE support. Does not support WPA3. Without Mesh.",
    });
    expect(facts.some((fact) => fact.factKey === "poe_capability")).toBe(false);
    expect(facts.some((fact) => fact.factValue === "WPA3")).toBe(false);
    expect(facts.some((fact) => fact.factValue === "Mesh")).toBe(false);
  });

  it("expands compound standards and extracts an explicitly labelled power budget", () => {
    const facts = extractStructuredProductFacts({
      model: "MODEL-D", productName: "Example", category: "Switch", brand: "Example", lifecycleStatus: "active",
      description: "PoE output supports IEEE 802.3af/at with a maximum PoE budget of 120W.",
    });
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factKey: "poe_standard", factValue: "802.3af" }),
      expect.objectContaining({ factKey: "poe_standard", factValue: "802.3at" }),
      expect.objectContaining({ factKey: "poe_power_budget", numericValue: 120, unit: "W" }),
    ]));
  });
});
