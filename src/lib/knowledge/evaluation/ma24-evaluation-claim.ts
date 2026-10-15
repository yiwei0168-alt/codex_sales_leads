import { query } from "../../rag/db";

type ClaimedEvaluationRun = { id: string; user_id: string; lease_token: string };

/** Claim one named evaluation task after the caller has approved the frozen run inputs. */
export async function claimMa24EvaluationRun(runId: string, workerId: string): Promise<ClaimedEvaluationRun | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId) ||
    !workerId.trim()) throw new Error("MA24 explicit evaluation claim identity required");
  return (await query<ClaimedEvaluationRun>(
    "select * from claim_ma24_evaluation_run($1,$2)", [runId, workerId]))[0] ?? null;
}
