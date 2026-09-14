import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { LeadRagCitation } from "./types";
import { playbookDependencyFingerprint } from "./playbook-cache";
import {playbookRouteIdentity} from "./playbook";

const plan: LeadSearchPlan = { countryCode: "DE", countryName: "德国", objective: "new-market",
  roles: ["Distributor", "SI"], targetCount: 20, queryLanguage: "zh-CN", userRequest: "搜索德国渠道" };
const citations: LeadRagCitation[] = ["product", "company", "industry"].map((collection, index) => ({
  chunkId: `chunk-${index}`, collection: collection as LeadRagCitation["collection"], title: collection,
  content: `${collection} context`, score: 0.8, retrievalSignals: ["vector"], corroborated: true,
  structuredFacts: [],
}));

describe("playbook dependency cache", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("invalidates when the approved output limit changes", () => {
    vi.stubEnv("LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS", "4096");
    const original = playbookDependencyFingerprint(plan, citations);
    vi.stubEnv("LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS", "2048");
    expect(playbookDependencyFingerprint(plan, citations)).not.toBe(original);
  });
  it("invalidates when the model or S01 route contract changes", () => {
    vi.stubEnv("LEAD_PLANNER_MODEL", "gpt-5.6-sol");
    expect(playbookRouteIdentity().requestContract).toBe("openrouter-sol-openai-playbook-v2");
    const pinned=playbookDependencyFingerprint(plan,citations);
    vi.stubEnv("LEAD_PLANNER_MODEL", "gpt-5-mini");
    expect(playbookRouteIdentity()).not.toHaveProperty("requestContract");
    expect(playbookDependencyFingerprint(plan,citations)).not.toBe(pinned);
  });
  it("is stable across citation order and invalidates content changes", () => {
    const original = playbookDependencyFingerprint(plan, citations);
    expect(playbookDependencyFingerprint(plan, [...citations].reverse())).toBe(original);
    const changed = structuredClone(citations);
    changed[0].content = "updated product context";
    expect(playbookDependencyFingerprint(plan, changed)).not.toBe(original);
  });
});
