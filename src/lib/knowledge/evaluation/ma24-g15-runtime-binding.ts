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
  sourceClosureMethod: string; sourceClosureFileCount: number;
  intendedLocalBgeFlagForBothArms: string; currentLocalBgeFlagEnabled: boolean;
  sourceSetFrozen: boolean; goldFrozen: boolean; runtimeBuildVerified: boolean;
  transitiveCodeClosureVerified: boolean; providerTariffsVerified: boolean;
  paidCallAuthorizationConfirmed: boolean; readyForPaidEvaluation: boolean;
  paidCallAuthorizationReference?: string | null;
  maximumProviderRequests?: number | null; maximumRequestBytes?: number | null;
  maximumOutputTokens?: number | null; hardSpendCapUsd?: number | null;
};

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const positiveSafeInteger = (value: number | null | undefined) =>
  Number.isSafeInteger(value) && (value ?? 0) > 0;
const positiveFinite = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

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
    "modelFunctionsSha256", "intendedLocalBgeFlagForBothArms", "sourceClosureMethod"] as const)
    if (!Object.is(frozen[field], loaded[field])) throw new Error(`MA24 G15 ${field} drift`);
  for (const field of ["maximumProviderRequests", "maximumRequestBytes",
    "maximumOutputTokens", "hardSpendCapUsd", "paidCallAuthorizationReference"] as const)
    if (!Object.is(frozen[field], loaded[field])) throw new Error(`MA24 G15 ${field} drift`);
  for (const field of ["currentLocalBgeFlagEnabled", "sourceSetFrozen", "goldFrozen",
    "runtimeBuildVerified", "transitiveCodeClosureVerified", "providerTariffsVerified",
    "paidCallAuthorizationConfirmed", "readyForPaidEvaluation"] as const)
    if (typeof frozen[field] !== "boolean" || typeof loaded[field] !== "boolean" ||
      frozen[field] !== loaded[field]) throw new Error(`MA24 G15 ${field} drift`);
  if (frozen.sourceClosureMethod !== "recursive-local-static-imports-v1" ||
    !Number.isSafeInteger(frozen.sourceClosureFileCount) ||
    frozen.sourceClosureFileCount !== Object.keys(frozen.sourceHashes).length ||
    loaded.sourceClosureFileCount !== Object.keys(loaded.sourceHashes).length)
    throw new Error("MA24 G15 local source closure incomplete");
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
    ...(!loaded.paidCallAuthorizationReference?.trim() ? ["paid call authorization reference missing"] : []),
    ...(!positiveSafeInteger(loaded.maximumProviderRequests) ? ["maximum provider requests not fixed"] : []),
    ...(!positiveSafeInteger(loaded.maximumRequestBytes) ? ["maximum request bytes not fixed"] : []),
    ...(!positiveSafeInteger(loaded.maximumOutputTokens) ? ["maximum output tokens not fixed"] : []),
    ...(!positiveFinite(loaded.hardSpendCapUsd) ? ["hard spend cap not fixed"] : []),
    ...(!loaded.readyForPaidEvaluation ? ["paid evaluation not ready"] : []),
  ];
  return { runtimeBindingMatched: true, readyForModelCalls: false,
    missing: [...missing, "independent source/Gold and paid admission preflight not implemented"] };
}

/** Require an admitted frozen preview before a dedicated evaluation task is claimed. */
export function requireMa24G15ModelReady(frozen: Ma24G15Preview,
  loaded: Ma24G15Preview, nowUtcDate: string) {
  const gate = assertMa24G15RuntimeBinding(frozen, loaded, nowUtcDate);
  if (!gate.readyForModelCalls)
    throw new Error(`MA24 evaluation model admission unavailable: ${gate.missing.join("; ")}`);
  return loaded;
}
