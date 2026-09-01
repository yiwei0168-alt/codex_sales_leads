import { randomUUID } from "node:crypto";

import { appendMessage, getAssistantAction, setAssistantActionStatus } from "@/lib/assistant/repository";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import { query, tenantQuery, tenantTransaction } from "@/lib/rag/db";

import { runLeadWorkflow } from "./graph";
import type { LeadWorkflowResult } from "./types";

export type LeadWorkflowExecutionMode = "inline" | "worker";

export interface LeadWorkflowJobClaim {
  jobId: string;
  userId: string;
  actionId: string;
  graphThreadId: string;
  conversationId: string;
  plan: LeadSearchPlan;
}

export function configuredLeadWorkflowMode(): LeadWorkflowExecutionMode {
  return process.env.LEAD_WORKFLOW_EXECUTION_MODE?.trim().toLowerCase() === "worker" ? "worker" : "inline";
}

export async function confirmAndQueueLeadWorkflow(userId: string, actionId: string, mode = configuredLeadWorkflowMode()): Promise<LeadWorkflowJobClaim | null> {
  return tenantTransaction(userId, async (client) => {
    const action = await client.query<{ conversation_id: string; payload: LeadSearchPlan; status: "proposed" | "failed" }>(
      `select conversation_id, payload, status from assistant_action
       where id=$1 and user_id=$2 and action_type='lead-search' and status in ('proposed','failed')
       for update`, [actionId, userId]);
    if (!action.rows[0]) return null;
    await client.query(
      `update assistant_action set status='confirmed', confirmed_at=coalesce(confirmed_at,now()),
         started_at=null, finished_at=null, error_message=null, updated_at=now()
       where id=$1 and user_id=$2`, [actionId, userId]);
    if (action.rows[0].status === "failed") {
      const existing = await client.query<{ id: string; graph_thread_id: string }>(
        `update lead_workflow_job set status='queued', phase='queued', execution_mode=$3,
           worker_id=null, lease_until=null, error_message=null, finished_at=null, updated_at=now()
         where action_id=$1 and user_id=$2 and attempts < 20
         returning id, graph_thread_id`, [actionId, userId, mode]);
      if (!existing.rows[0]) {
        await client.query(
          `update assistant_action set status='failed', finished_at=now(),
             error_message='已达到最大工作流重试次数', updated_at=now()
           where id=$1 and user_id=$2`, [actionId, userId]);
        return null;
      }
      return { jobId: existing.rows[0].id, userId, actionId,
        graphThreadId: existing.rows[0].graph_thread_id, conversationId: action.rows[0].conversation_id,
        plan: action.rows[0].payload };
    }
    const graphThreadId = `lead:${actionId}:${randomUUID()}`;
    const job = await client.query<{ id: string }>(
      `insert into lead_workflow_job (user_id, action_id, graph_thread_id, execution_mode)
       values ($1,$2,$3,$4) returning id`, [userId, actionId, graphThreadId, mode]);
    return {
      jobId: job.rows[0].id,
      userId,
      actionId,
      graphThreadId,
      conversationId: action.rows[0].conversation_id,
      plan: action.rows[0].payload,
    };
  });
}

export async function claimLeadWorkflowByAction(userId: string, actionId: string, workerId: string): Promise<LeadWorkflowJobClaim | null> {
  const rows = await tenantQuery<{
    id: string; graph_thread_id: string; conversation_id: string; payload: LeadSearchPlan;
  }>(userId,
    `with claimed as (
       update lead_workflow_job set status='running', worker_id=$3, lease_until=now()+interval '2 hours',
         attempts=attempts+1, started_at=coalesce(started_at,now()), updated_at=now()
       where user_id=$1 and action_id=$2 and status in ('queued','running')
         and attempts < 20
         and (status='queued' or lease_until is null or lease_until < now()) returning id, graph_thread_id
     )
     select claimed.id, claimed.graph_thread_id, action.conversation_id, action.payload
       from claimed join assistant_action action on action.id=$2 and action.user_id=$1`,
    [userId, actionId, workerId.slice(0, 120)]);
  if (!rows[0]) return null;
  await setAssistantActionStatus(userId, actionId, "running");
  return { jobId: rows[0].id, userId, actionId, graphThreadId: rows[0].graph_thread_id,
    conversationId: rows[0].conversation_id, plan: rows[0].payload };
}

export async function claimNextLeadWorkflow(workerId: string): Promise<LeadWorkflowJobClaim | null> {
  const rows = await query<{ job_id: string; user_id: string; action_id: string; graph_thread_id: string }>(
    `select * from claim_next_lead_workflow_job($1, 7200)`, [workerId.slice(0, 120)]);
  if (!rows[0]) return null;
  const action = await getAssistantAction(rows[0].user_id, rows[0].action_id);
  if (!action) throw new Error("Claimed lead workflow has no tenant-visible assistant action");
  await setAssistantActionStatus(rows[0].user_id, rows[0].action_id, "running");
  const conversation = await tenantQuery<{ conversation_id: string }>(rows[0].user_id,
    `select conversation_id from assistant_action where id=$1 and user_id=$2`, [rows[0].action_id, rows[0].user_id]);
  return { jobId: rows[0].job_id, userId: rows[0].user_id, actionId: rows[0].action_id,
    graphThreadId: rows[0].graph_thread_id, conversationId: conversation[0].conversation_id, plan: action.payload };
}

async function finishJob(claim: LeadWorkflowJobClaim, result: LeadWorkflowResult): Promise<void> {
  await tenantQuery(claim.userId,
    `update lead_workflow_job set status='completed', phase='completed', result=$3,
       lease_until=null, finished_at=now(), updated_at=now() where id=$1 and user_id=$2`,
    [claim.jobId, claim.userId, JSON.stringify(result)]);
  await setAssistantActionStatus(claim.userId, claim.actionId, "completed", { result: result as unknown as Record<string, unknown> });
  await appendMessage(claim.userId, claim.conversationId, {
    role: "assistant",
    intent: "lead-search",
    content: `${result.countryName} LangGraph 搜索完成：RAG 使用 ${result.ragCitationCount} 个知识片段，发现 ${result.discovered} 家、评估 ${result.assessed} 家、合格 ${result.qualified} 家，最终保存 ${result.accepted}/${result.requested} 家。共使用 ${result.creditsUsed} 个付费搜索/证据 credits。候选角色由 Agent 基于证据决定，搜索类别仅保留为来源记录。`,
    metadata: { searchResult: result as unknown as Record<string, unknown> },
  });
}

async function failJob(claim: LeadWorkflowJobClaim, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await tenantQuery(claim.userId,
    `update lead_workflow_job set status='failed', phase='failed', error_message=$3,
       lease_until=null, finished_at=now(), updated_at=now() where id=$1 and user_id=$2`,
    [claim.jobId, claim.userId, message.slice(0, 2_000)]);
  await setAssistantActionStatus(claim.userId, claim.actionId, "failed", { error: message });
  await appendMessage(claim.userId, claim.conversationId, {
    role: "assistant", intent: "lead-search",
    content: `LangGraph 搜索未完成：${message}。工作流 checkpoint 已保留；没有使用模拟公司替代真实结果。`,
  });
}

export async function executeClaimedLeadWorkflow(claim: LeadWorkflowJobClaim): Promise<LeadWorkflowResult> {
  try {
    const result = await runLeadWorkflow({ userId: claim.userId, actionId: claim.actionId,
      graphThreadId: claim.graphThreadId, plan: claim.plan });
    await finishJob(claim, result);
    return result;
  } catch (error) {
    await failJob(claim, error);
    throw error;
  }
}
