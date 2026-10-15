import { query } from "../../rag/db";
import { finishRun } from "../../assistant/main/repository";
import { assertMa24FrozenSnapshotBytes } from "./ma24-independent-comparison";
import { verifyMa24EvaluationTaskBinding } from "./ma24-evaluation-task-binding";

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

/** Claim one task, bind its current lease to all frozen inputs, and retire failed admissions. */
export async function claimAndBindMa24EvaluationRun(input: Omit<BindingInput, "leaseToken"> & {
  workerId: string;
}) {
  const entry = input.manifest.cases.find(item => item.caseId === input.caseId);
  if (!entry) throw new Error("MA24 evaluation case absent from frozen manifest");
  assertMa24FrozenSnapshotBytes(input.manifest, {
    sourceSet: input.sourceSetBytes, gold: input.goldBytes,
    codeAndConfig: input.codeAndConfigBytes,
  });
  const claimed = await claimMa24EvaluationRun(input.runId, entry.userId, input.workerId);
  if (!claimed) throw new Error("MA24 evaluation task unavailable for explicit claim");
  try {
    if (claimed.user_id !== entry.userId)
      throw new Error("MA24 claimed evaluation account differs from frozen case");
    const bound = await verifyMa24EvaluationTaskBinding({ ...input,
      leaseToken: claimed.lease_token });
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
