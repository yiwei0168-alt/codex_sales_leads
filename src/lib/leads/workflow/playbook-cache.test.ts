import { describe, expect, it } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { LeadRagCitation } from "./types";
import { playbookDependencyFingerprint } from "./playbook-cache";

const plan: LeadSearchPlan = { countryCode: "DE", countryName: "德国", objective: "new-market",
  roles: ["Distributor", "SI"], targetCount: 20, queryLanguage: "zh-CN", userRequest: "搜索德国渠道" };
const citations: LeadRagCitation[] = ["product", "company", "industry"].map((collection, index) => ({
  chunkId: `chunk-${index}`, collection: collection as LeadRagCitation["collection"], title: collection,
  content: `${collection} context`, score: 0.8, retrievalSignals: ["vector"], corroborated: true,
  structuredFacts: [],
}));

describe("playbook dependency cache", () => {
  it("is stable across citation order and invalidates content changes", () => {
    const original = playbookDependencyFingerprint(plan, citations);
    expect(playbookDependencyFingerprint(plan, [...citations].reverse())).toBe(original);
    const changed = structuredClone(citations);
    changed[0].content = "updated product context";
    expect(playbookDependencyFingerprint(plan, changed)).not.toBe(original);
  });
});
