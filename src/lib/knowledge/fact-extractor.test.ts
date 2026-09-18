import { describe, expect, it } from "vitest";

import type { StructuredKnowledgeBlock } from "@/lib/rag/types";
import { extractKnowledgeFacts } from "./fact-extractor";
import { buildControlledLexicalQuery, defaultComparisonAttributes, exactModelMentions, inferComparisonCategory, resolveAttributeCandidates } from "./query-normalizer";

const block = (text: string, id = "b"): StructuredKnowledgeBlock => ({
  id, unitType: "page", unitIndex: 1, blockType: "paragraph", text,
  extractorVersion: "layout-v2.0.0", quality: "success",
});

describe("versioned knowledge facts", () => {
  it("extracts generic interface, PoE, SIM, USB and dimension facts", () => {
    const facts = extractKnowledgeFacts([
      block("8 x RJ45 Ethernet ports; 2 x SFP+ ports; maximum PoE budget 120W"),
      block("2 x Nano-SIM slots; USB 3.0; 200 x 118 x 44 mm", "c"),
    ]);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ attributeKey: "ethernet_port_count", typedValue: 8 }),
      expect.objectContaining({ attributeKey: "sfp_plus_port_count", typedValue: 2 }),
      expect.objectContaining({ attributeKey: "poe_power_budget", typedValue: 120 }),
      expect.objectContaining({ attributeKey: "sim_count", typedValue: 2 }),
      expect.objectContaining({ attributeKey: "usb_version", typedValue: "USB 3.0" }),
      expect.objectContaining({ attributeKey: "dimensions", unit: "mm" }),
    ]));
  });
  it("keeps negated standards negative", () => expect(
    extractKnowledgeFacts([block("Does not support 802.3at")]).find((item) => item.attributeKey === "poe_standard")?.polarity,
  ).toBe("negative"));
  it("normalizes cellular aliases while preserving 4G and 5G as separate set members", () => {
    expect(extractKnowledgeFacts([block("4G LTE fallback")])).toEqual(expect.arrayContaining([
      expect.objectContaining({ attributeKey:"cellular_generation", typedValue:"4G" }),
    ]));
    expect(extractKnowledgeFacts([block("5G NR modem")])).toEqual(expect.arrayContaining([
      expect.objectContaining({ attributeKey:"cellular_generation", typedValue:"5G" }),
    ]));
  });
  it("keeps package dimensions separate from device dimensions", () => {
    const facts = extractKnowledgeFacts([
      block("Dimensions: 100 x 80 x 20 mm", "device"),
      {...block("Package dimensions: 130 x 100 x 40 mm", "package"),headingPath:["Packaging"]},
    ]);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({attributeKey:"dimensions",typedValue:["100","80","20"]}),
      expect.objectContaining({attributeKey:"package_dimensions",typedValue:["130","100","40"]}),
    ]));
  });
  it("extracts category comparison fields without model-specific branches", () => {
    const facts = extractKnowledgeFacts([block("Wi-Fi 6E tri-band 2.4 GHz / 5 GHz / 6 GHz; 2.5 Gbps Ethernet; VPN Client and VPN Server; Net weight: 1.2 kg; supports PoE-in")]);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ attributeKey: "wifi_generation", typedValue: "Wi-Fi 6E" }),
      expect.objectContaining({ attributeKey: "frequency_band", typedValue: ["2.4 GHz", "5 GHz", "6 GHz"] }),
      expect.objectContaining({ attributeKey: "ethernet_speed", typedValue: ["2.5"] }),
      expect.objectContaining({ attributeKey: "vpn_role", typedValue: ["client", "server"] }),
      expect.objectContaining({ attributeKey: "weight", typedValue: 1200, unit: "g" }),
      expect.objectContaining({ attributeKey: "poe_input", typedValue: true }),
    ]));
  });
  it("pairs same-row coordinate blocks without flattening the whole page", () => {
    const facts = extractKnowledgeFacts([
      { ...block("10/100 Mbps RJ45 Ports", "label"), bbox: [100, 100, 250, 120] },
      { ...block("16", "value"), bbox: [300, 101, 320, 121] },
    ]);
    expect(facts).toEqual(expect.arrayContaining([expect.objectContaining({ attributeKey: "ethernet_port_count", typedValue: 16 })]));
  });
  it("normalizes aliases and uses longest exact model boundaries", () => {
    expect(resolveAttributeCandidates("有几个网口和 PoE 总功率？")).toEqual(expect.arrayContaining(["ethernet_port_count", "poe_power_budget"]));
    expect(exactModelMentions("compare AB-100P with AB-100", ["AB-100", "AB-100P", "AB-10"])).toEqual(["AB-100P", "AB-100"]);
    expect(exactModelMentions("XAB-100Z", ["AB-100"])).toEqual([]);
  });
  it("builds controlled multilingual lexical expansion without product-specific rules", () => {
    const query = buildControlledLexicalQuery("AB-100P 有几个网口？");
    expect(query).toContain('"AB-100P"');
    expect(query).toContain('"网口"');
    expect(query).toMatch(/ethernet/i);
    expect(buildControlledLexicalQuery("explain channel strategy")).toBe("explain channel strategy");
  });
  it("loads category comparison profiles from registered source paths",()=>{
    expect(inferComparisonCategory(["knowledge/product/Wi-Fi Router/AB.pdf"])).toBe("router");
    expect(inferComparisonCategory(["knowledge/product/5G LTE Router/P5.pdf"])).toBe("cpe");
    expect(defaultComparisonAttributes(["router"])).toContain("wifi_generation");
    expect(defaultComparisonAttributes(["router"])).toContain("ethernet_port_count");
  });
});
