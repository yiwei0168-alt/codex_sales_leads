import { describe, expect, it } from "vitest";

import { assessNetworkingRelevanceEvidence } from "./networking-relevance";

describe("active-networking relevance evidence gate", () => {
  it.each([
    "Sells routers, PoE switches and wireless access points to SMB customers.",
    "Official Ubiquiti UniFi and TP-Link Omada partner.",
    "Wir planen, installieren und betreiben professionelle WLAN-Lösungen.",
    "The team specifies and deploys LAN network equipment for customer projects.",
    "Distributor of D-Link and MikroTik networking hardware.",
    "Supplies network firewalls and security gateways to channel partners.",
  ])("accepts explicit active-networking evidence: %s", (evidence) => {
    expect(assessNetworkingRelevanceEvidence([evidence]).status).toBe("demonstrated");
  });

  it.each([
    "Cloud connectivity, managed IT and digital transformation consulting.",
    "Broadcast IP integration and data-center services.",
    "Structured copper and fiber cabling installation.",
    "Enterprise network infrastructure consulting.",
    "IT procurement and edge infrastructure services.",
    "Wir installieren strukturierte LAN-Verkabelung und Glasfaser.",
    "",
  ])("does not treat generic or passive wording as proof: %s", (evidence) => {
    const result = assessNetworkingRelevanceEvidence([evidence]);
    expect(result.status).toBe("not-demonstrated");
    expect(result.reason).toMatch(/not demonstrate|not demonstrated/i);
  });

  it("reports not-demonstrated without asserting factual irrelevance", () => {
    const result = assessNetworkingRelevanceEvidence(["IT solutions provider"]);
    expect(result.demonstrated).toBe(false);
    expect(result.reason).not.toMatch(/company is (?:not|unrelated)/i);
  });

  it("does not promote a computer repair shop from a generic WLAN security article", () => {
    const result = assessNetworkingRelevanceEvidence([
      "Computer and laptop repair, virus removal, data recovery and software service.",
      "Ratgeber: Sichern Sie Ihren WLAN-Router vor Cyberkriminellen.",
    ]);
    expect(result.demonstrated).toBe(false);
  });
});
