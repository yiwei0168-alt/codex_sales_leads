import { describe, expect, it } from "vitest";
import { selectEvidenceWindow } from "./evidence-window";

describe("evidence windows", () => {
  it("keeps relevant tail evidence instead of always taking the prefix", () => {
    const content = `${"intro ".repeat(200)}No PoE support. Maximum budget 120W.`;
    const window = selectEvidenceWindow(content, "Does it support PoE and what is the budget?", 180);
    expect(window).toContain("No PoE support");
    expect(window).toContain("120W");
  });
  it("preserves both head and tail when no term matches", () => {
    const content = `HEAD-${"x".repeat(300)}-TAIL`;
    const window = selectEvidenceWindow(content, "unrelated", 100);
    expect(window).toContain("HEAD");
    expect(window).toContain("TAIL");
  });
});
