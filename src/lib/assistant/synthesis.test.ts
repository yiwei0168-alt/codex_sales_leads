import { describe, expect, it } from "vitest";

import { validateSynthesizedCitations } from "./synthesis";

describe("hybrid synthesis citation validation", () => {
  it("accepts only citations present in the bounded evidence", () => {
    expect(() => validateSynthesizedCitations(
      "内部结论 [KB:00000000-0000-0000-0000-000000000001]，外部结论 [WEB:1]。",
      ["00000000-0000-0000-0000-000000000001"], 2,
    )).not.toThrow();
  });

  it("rejects invented internal or external citations", () => {
    expect(() => validateSynthesizedCitations("错误 [KB:invented]", [], 1)).toThrow("internal citation");
    expect(() => validateSynthesizedCitations("错误 [WEB:3]", [], 2)).toThrow("external citation");
  });
});
