import { describe, expect, it } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import {
  ACTIVE_HYBRID_SEARCH_POLICY,
  buildHybridSearchRoute,
  hybridSearchPolicyChecksum,
  normalizeLeadSearchPlan,
} from "./hybrid-search-policy";

function plan(overrides: Partial<LeadSearchPlan> = {}): LeadSearchPlan {
  return {
    countryCode: "DE", countryName: "Germany", objective: "new-market", roles: ["Distributor"],
    targetCount: 20, queryLanguage: "de", userRequest: "Search Germany distributors", ...overrides,
  };
}

describe("hybrid search policy", () => {
  it("keeps Tavily out of discovery and versions the confirmed strategy", () => {
    expect(ACTIVE_HYBRID_SEARCH_POLICY.strategyDocumentVersion).toBe("0.9.0-discussion");
    expect(JSON.stringify(ACTIVE_HYBRID_SEARCH_POLICY.categories)).not.toContain("tavily");
    expect(hybridSearchPolicyChecksum()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("routes distribution through Gemini Full without Product Gemini or Google SERP", () => {
    const route = buildHybridSearchRoute(plan());
    expect(route[0]).toMatchObject({ category: "distribution", provider: "gemini-full", trigger: "core" });
    expect(route.some((step) => step.provider === "gemini-product")).toBe(false);
    expect(route.some((step) => step.provider === "searchapi" && step.engine === "google")).toBe(false);
  });

  it("does not enable Agent, Brand Owner or OEM ODM from stale persisted role fields", () => {
    const normalized = normalizeLeadSearchPlan(plan({
      roles: ["Agent", "Brand Owner"], opportunityTargets: ["OEM/ODM"], userRequest: "Search Germany companies",
    }));
    expect(normalized.roles).not.toContain("Agent");
    expect(normalized.roles).not.toContain("Brand Owner");
    expect(normalized.opportunityTargets).toEqual([]);
  });

  it("enables Agent only from an explicit user request", () => {
    const route = buildHybridSearchRoute(plan({ roles: ["Agent"], userRequest: "Search Germany manufacturer representatives and sales agents" }));
    expect(route[0]).toMatchObject({ category: "agent", provider: "searchapi", engine: "google" });
    expect(route.some((step) => step.provider === "google-places" && step.trigger === "explicit-local-gap")).toBe(true);
  });

  it("uses one OEM opportunity route and does not duplicate a Brand Owner chain", () => {
    const route = buildHybridSearchRoute(plan({ roles: ["Brand Owner", "ISP"],
      userRequest: "Search Germany OEM ODM private-label customer leads", opportunityTargets: ["OEM/ODM"] }));
    expect(route.some((step) => step.category === "oem-odm-opportunity")).toBe(true);
    expect(route.some((step) => step.category === "brand-owner")).toBe(false);
    expect(route.some((step) => step.provider === "gemini-product")).toBe(false);
    expect(route.some((step) => step.provider === "google-places")).toBe(false);
  });

  it("splits SI MSP and Installer into different tool tracks", () => {
    const route = buildHybridSearchRoute(plan({ roles: ["SI", "Installer"], coverageMode: "national" }));
    expect(route.find((step) => step.category === "si-msp" && step.sequence === 0)?.provider).toBe("gemini-full");
    expect(route.find((step) => step.category === "installer" && step.sequence === 0)?.provider).toBe("searchapi");
  });
});
