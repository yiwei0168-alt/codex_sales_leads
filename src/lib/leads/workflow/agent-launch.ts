import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { digest } from "@/lib/assistant/main/contracts";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { confirmAndQueueLeadWorkflow } from "./jobs";

type Action = { id: string; payload: LeadSearchPlan; status: string };
export type AgentLeadLaunch = { actionId: string; jobId: string | null; status: string };

/** Re-entry after a lost worker can only reuse the action bound to this saved call. */
export async function queueAgentLeadWorkflow(userId: string, runId: string, callId: string, plan: LeadSearchPlan): Promise<AgentLeadLaunch | null> {
  const action = await tenantTransaction(userId, async client => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`agent-lead:${userId}:${callId}`]);
    const owner = await client.query<{ conversation_id: string }>(`select r.conversation_id from agent_run r
      join agent_tool_call c on c.user_id=r.user_id and c.run_id=r.id
      where r.user_id=$1 and r.id=$2 and c.id=$3 and c.tool_id='lead_workflow'`, [userId, runId, callId]);
    if (!owner.rows[0]) return null;
    const existing = await client.query<Action>("select id,payload,status from assistant_action where user_id=$1 and source_agent_call_id=$2", [userId, callId]);
    if (existing.rows[0]) {
      if (digest(existing.rows[0].payload) !== digest(plan)) throw new Error("Saved lead workflow plan changed; do not replay");
      return existing.rows[0];
    }
    const inserted = await client.query<Action>(`insert into assistant_action(user_id,conversation_id,action_type,payload,source_agent_call_id)
      values($1,$2,'lead-search',$3,$4) returning id,payload,status`, [userId, owner.rows[0].conversation_id, JSON.stringify(plan), callId]);
    return inserted.rows[0];
  });
  if (!action) return null;
  if (action.status === "proposed") await confirmAndQueueLeadWorkflow(userId, action.id, "worker");
  const rows = await tenantQuery<{ status: string; job_id: string | null }>(userId, `select a.status,j.id as job_id from assistant_action a
    left join lead_workflow_job j on j.user_id=a.user_id and j.action_id=a.id
    where a.user_id=$1 and a.id=$2`, [userId, action.id]);
  return rows[0] ? { actionId: action.id, jobId: rows[0].job_id, status: rows[0].status } : null;
}
