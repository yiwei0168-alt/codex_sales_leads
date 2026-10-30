import type { PoolClient } from "pg";
import { BudgetDeniedError } from "./policy";
import { currentStagePaidCallOverride } from "./stage-paid-call-override";

export interface RecoveryRequestState {
  status: string; stage: string; task: string | null; endpoint: string | null;
  http_status: string | null; valid_outputs: string | null;
}

/** Only known text calls and completed read-only lead acquisition are eligible for MA05 continuation.
 * This does not classify a bill as paid/unpaid, release occupation, or authorize request replay. */
export function isReadOnlyUnknownRecoveryRequest(row: RecoveryRequestState) {
  if (row.status !== "unknown") return false;
  const textTasks = ["lead-evidence-correction", "lead-qualification", "lead-review-secondary", "lead-review-judge", "lead-playbook"];
  if (row.task && textTasks.includes(row.task) && ["chat-completions", "messages"].includes(row.endpoint ?? "")) return true;
  return ["discovering", "collecting-evidence", "correcting-evidence"].includes(row.stage)
    && row.task === null && row.http_status === "200" && row.valid_outputs === "1";
}

export async function assertSavedRecoveryRequestsSafe(client: PoolClient, userId: string, actionId: string) {
  const observation = currentStagePaidCallOverride(userId)?.ruleId === "MA05";
  const rows = await client.query<RecoveryRequestState>(`with recursive sources(action_id) as (
    select $2::text union select p.parent_action_id::text from lead_processing_recovery p
      join sources s on p.child_action_id::text=s.action_id where p.user_id=$1
  ) select r.status,r.stage,r.metrics->'modelAttempt'->>'task' as task,
      r.metrics->'modelAttempt'->>'endpointKind' as endpoint,
      r.metrics->'providerUsage'->>'httpStatus' as http_status,r.metrics->>'validOutputItems' as valid_outputs
    from paid_call_reservation r join sources s on s.action_id=r.operation_id where r.user_id=$1
      and (r.status in ('reserved','bound-exceeded') or (r.status='unknown' and r.settled_micros is null))`,
    [userId, actionId]);
  if (rows.rows.some(row => !observation || !isReadOnlyUnknownRecoveryRequest(row)))
    throw new BudgetDeniedError("paid-request-already-recorded");
}
