import { describe, expect, it } from "vitest";

import { assessmentNeedsIncompleteRecovery, correctionNeedsIncompleteRecovery } from "./product-cell";

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
});
