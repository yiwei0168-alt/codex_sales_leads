import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import { digest, type ExecutionContext, type ProductTool } from "./contracts";
export interface AgentApproval {
  id: string; run_id: string; tool_id: string; tool_version: string; parameter_hash: string;
  payload: unknown; status: "pending" | "approved" | "denied" | "revoked" | "consumed" | "expired"; expires_at: string;
}
export function needsApproval(tool: Pick<ProductTool, "effect">) { return ["send", "destructive", "publish"].includes(tool.effect); }
export function approvalDigest(tool: Pick<ProductTool, "id" | "version">, input: unknown) { return digest({ tool: tool.id, version: tool.version, input }); }
export async function requestApproval(context: ExecutionContext, tool: ProductTool, input: unknown): Promise<AgentApproval> {
  return tenantTransaction(context.userId, async client => {
    const hash = approvalDigest(tool, input);
    const inserted = await client.query(`insert into agent_approval(user_id,run_id,tool_id,tool_version,parameter_hash,payload)
      values($1,$2,$3,$4,$5,$6) on conflict do nothing returning id`, [context.userId, context.runId, tool.id, tool.version, hash, JSON.stringify(input)]);
    const rows = await client.query<AgentApproval>(`select *,case when expires_at<=now() and status in('pending','approved') then 'expired' else status end as status
      from agent_approval where user_id=$1 and run_id=$2 and tool_id=$3 and tool_version=$4 and parameter_hash=$5`, [context.userId, context.runId, tool.id, tool.version, hash]);
    if (inserted.rowCount) await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'approval_requested',$3)", [context.userId, context.runId, JSON.stringify({ approvalId: rows.rows[0].id, tool: tool.id })]);
    return rows.rows[0];
  });
}
export async function listApprovals(userId: string, runId: string) {
  return tenantQuery<AgentApproval>(userId, `select id,run_id,tool_id,tool_version,parameter_hash,payload,expires_at::text,
    case when expires_at<=now() and status in('pending','approved') then 'expired' else status end as status
    from agent_approval where user_id=$1 and run_id=$2 order by created_at,id`, [userId, runId]);
}
/** Called only from the authenticated human approval route, never registered as an Agent tool. */
export async function decideApproval(userId: string, id: string, hash: string, decision: "approve" | "deny" | "revoke") {
  return tenantTransaction(userId, async client => {
    const rows = await client.query<{ run_id: string }>(`update agent_approval set status=$4,decided_at=now()
      where user_id=$1 and id=$2 and parameter_hash=$3 and expires_at>now()
      and (($4 in('approved','denied') and status='pending') or ($4='revoked' and status in('pending','approved')))
      returning run_id`, [userId, id, hash, decision === "approve" ? "approved" : decision === "deny" ? "denied" : "revoked"]);
    if (!rows.rows[0]) return false;
    const runId = rows.rows[0].run_id;
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'approval_decision',$3)", [userId, runId, JSON.stringify({ approvalId: id, decision })]);
    // Re-enter the pending tool at a safe boundary; a denial becomes an observed tool result.
    await client.query("update agent_run set status='queued',control=null,lease_token=null,lease_until=null,updated_at=now() where user_id=$1 and id=$2 and status='waiting_user'", [userId, runId]);
    return true;
  });
}
