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
      .toMatchObject({ runtimeBindingMatched: true, readyForModelCalls: false });
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
