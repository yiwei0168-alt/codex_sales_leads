import { describe, expect, it } from "vitest";

import { knowledgeFactConflictKey } from "./fact-conflict";

const setAttributes = new Set(["frequency_band", "poe_standard"]);
const fact = (overrides: Partial<Parameters<typeof knowledgeFactConflictKey>[0]> = {}) => ({
  entityId: "model-1", entityVersion: "1.0", market: "EU", attributeKey: "wifi_generation", typedValue: "Wi-Fi 6",
  ...overrides,
});

describe("knowledge fact conflict identity", () => {
  it("keeps scalar alternatives in one exact version and market conflict slot", () => {
    expect(knowledgeFactConflictKey(fact(), setAttributes)).toBe(
      knowledgeFactConflictKey(fact({ typedValue:"Wi-Fi 7" }), setAttributes),
    );
  });

  it("separates versions and markets instead of mislabeling version differences as conflicts", () => {
    const base = knowledgeFactConflictKey(fact(), setAttributes);
    expect(knowledgeFactConflictKey(fact({ entityVersion:"2.0" }), setAttributes)).not.toBe(base);
    expect(knowledgeFactConflictKey(fact({ market:"US" }), setAttributes)).not.toBe(base);
  });

  it("treats different members of a set-valued attribute as compatible", () => {
    const two = fact({ attributeKey:"frequency_band", typedValue:"2.4 GHz" });
    const five = fact({ attributeKey:"frequency_band", typedValue:"5 GHz" });
    expect(knowledgeFactConflictKey(two, setAttributes)).not.toBe(knowledgeFactConflictKey(five, setAttributes));
  });
});
