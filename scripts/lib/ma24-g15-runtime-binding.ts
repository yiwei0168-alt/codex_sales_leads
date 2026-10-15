/** Compare a G15 preview with the code and prompts loaded immediately before a run. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

type Arm = { knowledgeScope: string[]; baseline: Record<string, unknown>;
  candidate: Record<string, unknown>; addedTools: string[] };
export type Ma24G15Preview = {
  schema: string; productPromptDateUtc: string; requiredRunPromptDateUtc: string;
  mode: string; modePromptVersion: string; modePromptSha256: string;
  productVersion: string; modelProfile: unknown; modelFunctionsSha256: string;
  arms: Arm[]; sourceHashes: Record<string, string>;
  intendedLocalBgeFlagForBothArms: string; currentLocalBgeFlagEnabled: boolean;
  sourceSetFrozen: boolean; goldFrozen: boolean; runtimeBuildVerified: boolean;
  transitiveCodeClosureVerified: boolean; providerTariffsVerified: boolean;
  paidCallAuthorizationConfirmed: boolean; readyForPaidEvaluation: boolean;
};

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function assertMa24G15RuntimeBinding(frozen: Ma24G15Preview,
  loaded: Ma24G15Preview, nowUtcDate: string) {
  assert.equal(frozen.schema, "ma24-g15-config-preview-v1");
  assert.equal(loaded.schema, frozen.schema);
  if (!date(nowUtcDate) || !date(frozen.productPromptDateUtc))
    throw new Error("MA24 G15 preview lacks a bound UTC prompt date");
  if (frozen.productPromptDateUtc !== frozen.requiredRunPromptDateUtc ||
    frozen.productPromptDateUtc !== loaded.productPromptDateUtc ||
    loaded.productPromptDateUtc !== loaded.requiredRunPromptDateUtc ||
    loaded.productPromptDateUtc !== nowUtcDate)
    throw new Error("MA24 G15 product prompt UTC date drift");
  for (const field of ["mode", "modePromptVersion", "modePromptSha256", "productVersion",
    "modelFunctionsSha256", "intendedLocalBgeFlagForBothArms"] as const)
    if (frozen[field] !== loaded[field]) throw new Error(`MA24 G15 ${field} drift`);
  for (const field of ["modelProfile", "arms", "sourceHashes"] as const)
    if (sha(frozen[field]) !== sha(loaded[field])) throw new Error(`MA24 G15 ${field} drift`);
  const missing = [
    ...(!loaded.currentLocalBgeFlagEnabled ? ["local BGE flag disabled"] : []),
    ...(!loaded.sourceSetFrozen ? ["source set not frozen"] : []),
    ...(!loaded.goldFrozen ? ["Gold not frozen"] : []),
    ...(!loaded.runtimeBuildVerified ? ["runtime build not verified"] : []),
    ...(!loaded.transitiveCodeClosureVerified ? ["transitive code closure not verified"] : []),
    ...(!loaded.providerTariffsVerified ? ["provider tariffs not verified"] : []),
    ...(!loaded.paidCallAuthorizationConfirmed ? ["paid call authorization not confirmed"] : []),
    ...(!loaded.readyForPaidEvaluation ? ["paid evaluation not ready"] : []),
  ];
  return { runtimeBindingMatched: true, readyForModelCalls: false,
    missing: [...missing, "independent source/Gold and paid admission preflight not implemented"] };
}
