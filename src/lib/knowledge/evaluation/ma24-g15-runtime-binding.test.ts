import { describe, expect, it } from "vitest";
import { assertMa24G15RuntimeBinding, type Ma24G15Preview } from "./ma24-g15-runtime-binding";

const preview = (): Ma24G15Preview => ({ schema: "ma24-g15-config-preview-v1",
  productPromptDateUtc: "2026-10-15", requiredRunPromptDateUtc: "2026-10-15",
  mode: "standard", modePromptVersion: "v1", modePromptSha256: "prompt",
  productVersion: "v1", modelProfile: { routes: ["primary", "fallback"] },
  modelFunctionsSha256: "functions", arms: [{ knowledgeScope: ["industry"],
    baseline: { prompt: "a" }, candidate: { prompt: "b" }, addedTools: ["vectorless_read"] }],
  sourceHashes: { "src/graph.ts": "graph" },
  sourceClosureMethod: "recursive-local-static-imports-v1", sourceClosureFileCount: 1,
  intendedLocalBgeFlagForBothArms: "flag=1",
  currentLocalBgeFlagEnabled: false, sourceSetFrozen: false, goldFrozen: false,
  runtimeBuildVerified: false, transitiveCodeClosureVerified: false,
  providerTariffsVerified: false, paidCallAuthorizationConfirmed: false,
  readyForPaidEvaluation: false });

describe("MA24 G15 runtime binding", () => {
  it("reports a matching preview as still unready when freeze and spend gates are missing", () => {
    const same = preview();
    expect(assertMa24G15RuntimeBinding(same, structuredClone(same), "2026-10-15"))
      .toMatchObject({ runtimeBindingMatched: true, readyForModelCalls: false,
        missing: expect.arrayContaining(["maximum provider requests not fixed",
          "maximum request bytes not fixed", "maximum output tokens not fixed",
          "hard spend cap not fixed"]) });
  });
  it("requires positive bounded request, output and total spend values", () => {
    const loaded = preview();
    loaded.maximumProviderRequests = 0;
    loaded.maximumRequestBytes = Number.NaN;
    loaded.maximumOutputTokens = -1;
    loaded.hardSpendCapUsd = Number.POSITIVE_INFINITY;
    expect(assertMa24G15RuntimeBinding(loaded, loaded, "2026-10-15").missing)
      .toEqual(expect.arrayContaining(["maximum provider requests not fixed",
        "maximum request bytes not fixed", "maximum output tokens not fixed",
        "hard spend cap not fixed"]));
    loaded.maximumProviderRequests = 100;
    loaded.maximumRequestBytes = 100_000;
    loaded.maximumOutputTokens = 16_384;
    loaded.hardSpendCapUsd = 10;
    const result = assertMa24G15RuntimeBinding(loaded, loaded, "2026-10-15");
    expect(result.readyForModelCalls).toBe(false);
    expect(result.missing).not.toContain("hard spend cap not fixed");
  });
  it("rejects a changed request or spend ceiling after a preview is frozen", () => {
    const frozen = preview();
    frozen.maximumProviderRequests = 100;
    frozen.maximumRequestBytes = 100_000;
    frozen.maximumOutputTokens = 16_384;
    frozen.hardSpendCapUsd = 10;
    for (const field of ["maximumProviderRequests", "maximumRequestBytes",
      "maximumOutputTokens", "hardSpendCapUsd"] as const) {
      const loaded = structuredClone(frozen);
      loaded[field] = 1;
      expect(() => assertMa24G15RuntimeBinding(frozen, loaded, "2026-10-15"))
        .toThrow(`${field} drift`);
    }
  });
  it("rejects changed or missing admission decisions after a preview is frozen", () => {
    for (const field of ["currentLocalBgeFlagEnabled", "sourceSetFrozen", "goldFrozen",
      "runtimeBuildVerified", "transitiveCodeClosureVerified", "providerTariffsVerified",
      "paidCallAuthorizationConfirmed", "readyForPaidEvaluation"] as const) {
      const frozen = preview();
      const loaded = structuredClone(frozen);
      loaded[field] = true;
      expect(() => assertMa24G15RuntimeBinding(frozen, loaded, "2026-10-15"))
        .toThrow(`${field} drift`);
      const omitted = structuredClone(frozen);
      delete (omitted as Partial<Ma24G15Preview>)[field];
      expect(() => assertMa24G15RuntimeBinding(frozen, omitted, "2026-10-15"))
        .toThrow(`${field} drift`);
    }
  });
  it("rejects a different UTC prompt date before execution", () => {
    expect(() => assertMa24G15RuntimeBinding(preview(), preview(), "2026-10-16"))
      .toThrow(/UTC date drift/);
  });
  it("rejects an older preview without an explicit prompt date", () => {
    const old = { ...preview(), productPromptDateUtc: undefined } as unknown as Ma24G15Preview;
    expect(() => assertMa24G15RuntimeBinding(old, preview(), "2026-10-15"))
      .toThrow(/lacks a bound UTC prompt date/);
  });
  it("rejects changed model route, arm prompt and source code", () => {
    for (const mutate of [
      (row: Ma24G15Preview) => { row.modelProfile = { routes: ["other"] }; },
      (row: Ma24G15Preview) => { row.arms[0].candidate.prompt = "changed"; },
      (row: Ma24G15Preview) => { row.sourceHashes["src/graph.ts"] = "changed"; },
      (row: Ma24G15Preview) => { row.sourceClosureMethod = "other"; },
    ]) {
      const loaded = preview(); mutate(loaded);
      expect(() => assertMa24G15RuntimeBinding(preview(), loaded, "2026-10-15"))
        .toThrow(/drift/);
    }
  });
  it("rejects a preview that omits its source closure identity or count", () => {
    const old = { ...preview(), sourceClosureMethod: undefined } as unknown as Ma24G15Preview;
    expect(() => assertMa24G15RuntimeBinding(old, preview(), "2026-10-15"))
      .toThrow(/sourceClosureMethod drift/);
    const missing = { ...preview(), sourceClosureFileCount: 2 };
    expect(() => assertMa24G15RuntimeBinding(missing, preview(), "2026-10-15"))
      .toThrow(/local source closure incomplete/);
  });
});
