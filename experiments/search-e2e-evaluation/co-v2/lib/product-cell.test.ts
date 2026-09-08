import { describe, expect, it } from "vitest";

import { assessmentNeedsIncompleteRecovery, cachedDomainsForSearchExtension,
  correctionNeedsIncompleteRecovery } from "./product-cell";

describe("Colombia incomplete-only recovery", () => {
  it("retries only deterministic semantic fallbacks", () => {
    expect(correctionNeedsIncompleteRecovery("deterministic-fallback")).toBe(true);
    expect(correctionNeedsIncompleteRecovery("deepseek-v4-flash")).toBe(false);
    expect(correctionNeedsIncompleteRecovery("openai/gpt-4o-mini")).toBe(false);
  });

  it("rescored recovered, missing or retry-required records without touching unaffected completed scores", () => {
    const recovered = new Set(["recovered"]);
    expect(assessmentNeedsIncompleteRecovery("recovered", "completed", recovered)).toBe(true);
    expect(assessmentNeedsIncompleteRecovery("missing", undefined, recovered)).toBe(true);
    expect(assessmentNeedsIncompleteRecovery("retry", "retry-required", recovered)).toBe(true);
    expect(assessmentNeedsIncompleteRecovery("stable", "completed", recovered)).toBe(false);
  });

  it("preloads all prior discovery, evidence and corrected identities before a search extension", () => {
    expect(cachedDomainsForSearchExtension({
      corrected: [{ domain: "CORRECTED.example" }],
      discoveredRuns: [{ candidates: [{ domain: "discovered.example" }],
        rejectedCandidates: [{ domain: "rejected.example" }] }],
      enrichedRuns: [{ candidates: [{ domain: "enriched.example" }, { domain: " corrected.example " }] }],
    }).sort()).toEqual(["corrected.example", "discovered.example", "enriched.example", "rejected.example"]);
  });
});
