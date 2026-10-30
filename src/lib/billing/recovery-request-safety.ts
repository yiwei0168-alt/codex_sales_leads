import type { PoolClient } from "pg";
import { billingPolicy, BudgetDeniedError } from "./policy";
import { createHash } from "node:crypto";
import { currentStagePaidCallOverride } from "./stage-paid-call-override";

export interface RecoveryRequestState {
  status: string; stage: string; task: string | null; endpoint: string | null;
  http_status: string | null; valid_outputs: string | null;
  tariff_key?: string;
}

/** Only known text calls and completed read-only lead acquisition are eligible for MA05 continuation.
 * This does not classify a bill as paid/unpaid, release occupation, or authorize request replay. */
export function isReadOnlyUnknownRecoveryRequest(row: RecoveryRequestState) {
  if (row.status !== "unknown") return false;
  const textTasks = ["lead-evidence-correction", "lead-qualification", "lead-review-secondary", "lead-review-judge", "lead-playbook"];
  if (row.task && textTasks.includes(row.task) && ["chat-completions", "messages"].includes(row.endpoint ?? "")) return true;
  const acquisitionStage=["discovering", "collecting-evidence", "correcting-evidence"].includes(row.stage);
  const knownTavilyKeys=new Set(["/search","/extract"].flatMap(path=>[
    ...billingPolicy.rules.filter(rule=>rule.origin==="https://api.tavily.com"&&rule.pathname===path).map(rule=>rule.key),
    `a33-unbounded-${createHash("sha256").update(`https://api.tavily.com\n${path}\n`).digest("hex").slice(0,16)}`,
  ]));
  if(acquisitionStage&&row.task===null&&row.tariff_key&&knownTavilyKeys.has(row.tariff_key))return true;
  return ["discovering", "collecting-evidence", "correcting-evidence"].includes(row.stage)
    && row.task === null && row.http_status === "200" && row.valid_outputs === "1";
}

export async function assertSavedRecoveryRequestsSafe(client: PoolClient, userId: string, actionId: string) {
  const observation = currentStagePaidCallOverride(userId)?.ruleId === "MA05";
  const rows = await client.query<RecoveryRequestState>(`with recursive sources(action_id) as (
    select $2::text union select p.parent_action_id::text from lead_processing_recovery p
      join sources s on p.child_action_id::text=s.action_id where p.user_id=$1
  ) select r.status,r.stage,r.tariff_key,r.metrics->'modelAttempt'->>'task' as task,
      r.metrics->'modelAttempt'->>'endpointKind' as endpoint,
      r.metrics->'providerUsage'->>'httpStatus' as http_status,r.metrics->>'validOutputItems' as valid_outputs
    from paid_call_reservation r join sources s on s.action_id=r.operation_id where r.user_id=$1
      and (r.status in ('reserved','bound-exceeded') or (r.status='unknown' and r.settled_micros is null))`,
    [userId, actionId]);
  if (rows.rows.some(row => !observation || !isReadOnlyUnknownRecoveryRequest(row)))
    throw new BudgetDeniedError("paid-request-already-recorded");
}
