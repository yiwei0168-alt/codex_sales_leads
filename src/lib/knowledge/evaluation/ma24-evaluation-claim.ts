import { execFileSync } from "node:child_process";
import { query } from "../../rag/db";
import { finishRun } from "../../assistant/main/repository";
import { modeModelConfig } from "../../assistant/main/mode-config";
import { assertMa24FrozenSnapshotBytes, assertMa24GoldMatchesManifest,
  assertMa24SourceSetMatchesManifest, type Ma24GoldSnapshot,
  type Ma24SourceSetSnapshot } from "./ma24-independent-comparison";
import { verifyMa24EvaluationTaskBinding } from "./ma24-evaluation-task-binding";
import { assertMa24G15RuntimeBinding, type Ma24G15Preview } from "./ma24-g15-runtime-binding";
import { assertMa24CorpusSnapshotBytes, assertMa24PermissionGoldControl,
  assertMa24RouteGoldCorpusAccess,
  verifyMa24LiveCorpusAccount, verifyMa24LivePermissionControl,
  verifyMa24LivePermissionGoldEvidence,
  verifyMa24LiveRouteGoldEvidence } from "./ma24-corpus-snapshot";

type ClaimedEvaluationRun = { id: string; user_id: string; lease_token: string };

/** Claim one named evaluation task after the caller has approved the frozen run inputs. */
export async function claimMa24EvaluationRun(runId: string, expectedUserId: string,
  workerId: string): Promise<ClaimedEvaluationRun | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expectedUserId) ||
    !workerId.trim()) throw new Error("MA24 explicit evaluation claim identity required");
  return (await query<ClaimedEvaluationRun>(
    "select * from claim_ma24_evaluation_run($1,$2,$3)",
    [runId, expectedUserId, workerId]))[0] ?? null;
}

type BindingInput = Parameters<typeof verifyMa24EvaluationTaskBinding>[0];

/** Rebuild the G15 preview from the currently loaded repository before claiming. */
export function loadCurrentMa24G15Preview(): Ma24G15Preview {
  const output = execFileSync(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/prepare-ma24-g15-config-local.ts"],
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 4_194_304 });
  return JSON.parse(output) as Ma24G15Preview;
}

/** Claim one task, bind its current lease to all frozen inputs, and retire failed admissions. */
export async function claimAndBindMa24EvaluationRun(input: Omit<BindingInput,
  "leaseToken" | "loadedCodeAndConfig" | "nowUtcDate" | "loadedModelConfig"> & {
  workerId: string;
}) {
  const entry = input.manifest.cases.find(item => item.caseId === input.caseId);
  if (!entry) throw new Error("MA24 evaluation case absent from frozen manifest");
  assertMa24FrozenSnapshotBytes(input.manifest, {
    sourceSet: input.sourceSetBytes, gold: input.goldBytes,
    codeAndConfig: input.codeAndConfigBytes,
    corpus: input.corpusSnapshotBytes,
  });
  const corpus = assertMa24CorpusSnapshotBytes(input.manifest, input.corpusSnapshotBytes,
    input.manifest.corpusSnapshotSha256);
  await verifyMa24LiveCorpusAccount(corpus, entry.userId, entry.knowledgeScope);
  await verifyMa24LivePermissionControl(input.manifest, corpus, entry.caseId);
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder("utf-8", { fatal: true })
    .decode(bytes));
  assertMa24SourceSetMatchesManifest(input.manifest,
    decode(input.sourceSetBytes) as Ma24SourceSetSnapshot);
  const gold = decode(input.goldBytes) as Ma24GoldSnapshot;
  assertMa24GoldMatchesManifest(input.manifest, gold);
  assertMa24PermissionGoldControl(input.manifest, corpus, gold);
  assertMa24RouteGoldCorpusAccess(input.manifest, corpus, gold);
  await verifyMa24LivePermissionGoldEvidence(input.manifest, corpus, gold, input.caseId);
  await verifyMa24LiveRouteGoldEvidence(input.manifest, gold, input.caseId);
  const frozenCodeAndConfig = decode(input.codeAndConfigBytes) as Ma24G15Preview;
  const loadedCodeAndConfig = loadCurrentMa24G15Preview();
  const nowUtcDate = new Date().toISOString().slice(0, 10);
  assertMa24G15RuntimeBinding(frozenCodeAndConfig, loadedCodeAndConfig, nowUtcDate);
  const loadedModelConfig = modeModelConfig("standard");
  const claimed = await claimMa24EvaluationRun(input.runId, entry.userId, input.workerId);
  if (!claimed) throw new Error("MA24 evaluation task unavailable for explicit claim");
  try {
    if (claimed.user_id !== entry.userId)
      throw new Error("MA24 claimed evaluation account differs from frozen case");
    const bound = await verifyMa24EvaluationTaskBinding({ ...input,
      loadedCodeAndConfig, nowUtcDate, loadedModelConfig, leaseToken: claimed.lease_token });
    return { ...claimed, ...bound };
  } catch (error) {
    try {
      await finishRun({ userId: claimed.user_id, runId: claimed.id,
        leaseToken: claimed.lease_token, role: "member" },
      "failed", "MA24 evaluation admission rejected");
    } catch (settlementError) {
      throw new AggregateError([error, settlementError],
        "MA24 evaluation admission and failure settlement both failed");
    }
    throw error;
  }
}
