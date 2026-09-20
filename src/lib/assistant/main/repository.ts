import { randomUUID } from "node:crypto";
import { tenantQuery, tenantTransaction, query } from "@/lib/rag/db";
import type { AgentRun, ExecutionContext, MessageInput, ModelConfig, RunStatus, ToolResult } from "./contracts";
import { digest } from "./contracts";
import { approvalDigest } from "./approvals";

export async function enqueueRun(userId: string, input: MessageInput, model: ModelConfig, serverOptions?: { kind:"mail"; spec:unknown; paused:true }): Promise<AgentRun> {
  return tenantTransaction(userId, async client => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`agent-request:${userId}:${input.requestKey}`]);
    const hash = digest(serverOptions?{input,execution:serverOptions}:input);
    const existing = await client.query<AgentRun & { request_hash: string }>("select * from agent_run where user_id=$1 and request_key=$2", [userId, input.requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== hash) throw new Error("Request key already used with different content");
      return existing.rows[0];
    }
    let conversationId = input.conversationId;
    if (conversationId) {
      const c = await client.query("select id from assistant_conversation where user_id=$1 and id=$2 and status='active'", [userId, conversationId]);
      if (!c.rowCount) throw new Error("Conversation unavailable");
    } else {
      const c = await client.query<{ id: string }>("insert into assistant_conversation(user_id,title) values($1,$2) returning id", [userId, input.content.slice(0, 38)]);
      conversationId = c.rows[0].id;
    }
    for (const attachment of input.attachments) {
      const asset = await client.query(`select a.id from knowledge_asset a join knowledge_document d on d.id=a.document_id
        where a.id=$1 and (d.owner_id=$2 or d.visibility='shared') and a.registration_status='registered'`, [attachment.assetId, userId]);
      if (!asset.rowCount) throw new Error("Attachment unavailable");
    }
    const saved = await client.query<AgentRun>(`insert into agent_run(user_id,conversation_id,request_key,request_hash,input,model_config,execution_kind,execution_spec,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`, [userId, conversationId, input.requestKey, hash, JSON.stringify(input), JSON.stringify(model),serverOptions?.kind??"main-agent",serverOptions?JSON.stringify(serverOptions.spec):null,serverOptions?.paused?"paused":"queued"]);
    const run = saved.rows[0];
    await client.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)", [userId, conversationId, input.content, JSON.stringify({ runId: run.id })]);
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'queued','{}')", [userId, run.id]);
    await client.query("update assistant_conversation set updated_at=now() where user_id=$1 and id=$2", [userId, conversationId]);
    return run;
  });
}
export async function getRun(userId: string, id: string): Promise<AgentRun | null> {
  return (await tenantQuery<AgentRun>(userId, "select * from agent_run where user_id=$1 and id=$2", [userId, id]))[0] ?? null;
}
export async function listRuns(userId: string, conversationId?: string) {
  return tenantQuery<Pick<AgentRun, "id" | "status" | "conversation_id" | "result">>(userId,
    `select r.id,r.status,r.conversation_id,r.result,
      coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tool_id',a.tool_id,'parameter_hash',a.parameter_hash,'payload',a.payload,'status',a.status))
        from agent_approval a where a.user_id=r.user_id and a.run_id=r.id and a.status in('pending','approved') and a.expires_at>now()),'[]') as approvals,
      coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'key',m.memory_key,'version',m.current_version))
        from agent_memory m join agent_memory_version v on v.memory_id=m.id and v.version=m.current_version
        where m.owner_id=r.user_id and m.active and m.source_kind='automatic' and v.source_run_id=r.id),'[]') as memories
     from agent_run r where r.user_id=$1 and ($2::uuid is null or r.conversation_id=$2) order by r.created_at desc limit 50`, [userId, conversationId ?? null]);
}
export async function readEvents(userId: string, runId: string, after: string) {
  return tenantQuery<{ id: string; kind: string; payload: Record<string, unknown> }>(userId,
    "select id::text,kind,payload from agent_run_event where user_id=$1 and run_id=$2 and id>$3::bigint order by id limit 100", [userId, runId, after]);
}
export async function event(context: ExecutionContext, kind: string, payload: unknown) {
  await tenantQuery(context.userId, "insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,$3,$4)", [context.userId, context.runId, kind, JSON.stringify(payload)]);
}
export async function claimRun(workerId: string) {
  return (await query<{ id: string; user_id: string; lease_token: string }>("select * from claim_next_agent_run($1)", [workerId]))[0];
}
export async function heartbeat(context: ExecutionContext) {
  const rows = await tenantQuery(context.userId, `update agent_run set lease_until=now()+interval '90 seconds'
    where user_id=$1 and id=$2 and lease_token=$3 and status='running' and lease_until>now() returning id`, [context.userId, context.runId, context.leaseToken]);
  return rows.length === 1;
}
export class LeaseLostError extends Error { constructor() { super("Agent lease lost"); } }
export class InstructionsChangedError extends Error { constructor() { super("New instructions require replanning"); } }
export function assertCurrentInstructions(context: ExecutionContext, instructions: AgentRun["instructions"]) {
  if (context.instructionIds && instructions.some(i => !context.instructionIds!.includes(i.id))) throw new InstructionsChangedError();
}
export async function boundary(context: ExecutionContext) {
  const rows = await tenantQuery<AgentRun & { role: "admin" | "member" }>(context.userId,
    `select r.*,u.role from agent_run r join app_user u on u.id=r.user_id
     where r.user_id=$1 and r.id=$2 and r.lease_token=$3 and r.status='running' and r.lease_until>now() and u.status='active'`, [context.userId, context.runId, context.leaseToken]);
  if (!rows[0]) throw new LeaseLostError();
  context.role = rows[0].role;
  return rows[0];
}
export async function controlRun(userId: string, id: string, action: "pause" | "resume" | "cancel" | "instruct", content?: string) {
  return tenantTransaction(userId, async client => {
    const locked = await client.query<AgentRun>("select * from agent_run where user_id=$1 and id=$2 for update", [userId, id]);
    const run = locked.rows[0];
    if (!run) return false;
    if (["completed", "cancelled"].includes(run.status)) throw new Error("Task is terminal; create a new task");
    if (action === "instruct") {
      if (!content?.trim()) throw new Error("Instruction required");
      await client.query("update agent_run set instructions=instructions||$3::jsonb,status=case when status='waiting_user' then 'queued' else status end,next_attempt_at=now(),updated_at=now() where user_id=$1 and id=$2", [userId, id, JSON.stringify([{ id: randomUUID(), content }])]);
    } else if (action === "resume") {
      if (run.status === "running") throw new Error("Task is already running");
      await client.query("update agent_run set status='queued',control=null,lease_token=null,lease_until=null,next_attempt_at=now(),updated_at=now() where user_id=$1 and id=$2", [userId, id]);
    } else if (run.status === "running") {
      await client.query("update agent_run set control=$3,updated_at=now() where user_id=$1 and id=$2", [userId, id, action]);
    } else {
      await client.query("update agent_run set status=$3,control=null,updated_at=now() where user_id=$1 and id=$2", [userId, id, action === "pause" ? "paused" : "cancelled"]);
    }
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'control',$3)", [userId, id, JSON.stringify({ action })]);
    return true;
  });
}
export async function finishRun(context: ExecutionContext, status: RunStatus, reply: string) {
  await tenantTransaction(context.userId, async client => {
    const changed = await client.query<{ conversation_id: string; status: RunStatus }>(`update agent_run set
      status=case when control='cancel' then 'cancelled' when control='pause' then 'paused' else $4 end,
      result=$5,lease_until=null,updated_at=now()
      where user_id=$1 and id=$2 and lease_token=$3 and status='running' and lease_until>now() returning conversation_id,status`,
    [context.userId, context.runId, context.leaseToken, status, JSON.stringify({ reply })]);
    if (!changed.rows[0]) throw new LeaseLostError();
    if (changed.rows[0].status === "waiting_user") {
      // Approval can arrive between tool return and task settlement.
      const ready = await client.query(`update agent_run r set status='queued' where r.user_id=$1 and r.id=$2
        and exists(select 1 from agent_approval a where a.user_id=r.user_id and a.run_id=r.id and a.status in('approved','denied','revoked'))
        and not exists(select 1 from agent_approval a where a.user_id=r.user_id and a.run_id=r.id and a.status='pending') returning id`, [context.userId, context.runId]);
      if (ready.rowCount) changed.rows[0].status = "queued";
    }
    await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'status',$3)", [context.userId, context.runId, JSON.stringify({ status: changed.rows[0].status, reply })]);
    if (reply&&status!=="queued") await client.query(`insert into assistant_message(user_id,conversation_id,role,intent,content,metadata)
      values($1,$2,'assistant','general',$3,$4)`, [context.userId, changed.rows[0].conversation_id, reply, JSON.stringify({ runId: context.runId, status: changed.rows[0].status })]);
    await client.query("update assistant_conversation set updated_at=now() where user_id=$1 and id=$2", [context.userId, changed.rows[0].conversation_id]);
  });
}
export async function beginCall(context: ExecutionContext, call: { key: string; tool: string; version: string; input: unknown; effect: string; approvalId?: string }) {
  await boundary(context);
  return tenantTransaction(context.userId, async client => {
    // Serialize with controls and lease claims. A stale worker cannot start a new action.
    const lease = await client.query<{instructions: AgentRun["instructions"]}>(`select id,instructions from agent_run where user_id=$1 and id=$2 and lease_token=$3
      and status='running' and control is null and lease_until>now() for update`, [context.userId, context.runId, context.leaseToken]);
    if (!lease.rowCount) throw new LeaseLostError();
    assertCurrentInstructions(context, lease.rows[0].instructions);
    const previous = await client.query<{id:string}>("select id from agent_tool_call where user_id=$1 and run_id=$2 and (call_key=$3 or ($4::uuid is not null and approval_id=$4))", [context.userId, context.runId, call.key,call.approvalId??null]);
    if(previous.rows.length>1)throw new Error("Conflicting call/approval identity");
    if (!previous.rowCount && ["send", "destructive", "publish"].includes(call.effect)) {
      if (!call.approvalId) throw new Error("Exact approval required");
      const approved = await client.query(`update agent_approval set status='consumed' where id=$1 and user_id=$2 and run_id=$3
        and tool_id=$4 and tool_version=$5 and parameter_hash=$6 and status='approved' and expires_at>now() returning id`,
      [call.approvalId, context.userId, context.runId, call.tool, call.version, approvalDigest({ id: call.tool, version: call.version }, call.input)]);
      if (!approved.rowCount) throw new Error("Approval changed, expired, revoked or consumed");
    }
    const inserted = previous.rowCount ? {rowCount:0} : await client.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,'started') on conflict(user_id,run_id,call_key) do nothing returning id`,
    [context.userId, context.runId, call.key, call.tool, call.version, digest(call.input), JSON.stringify(call.input), call.effect]);
    const stored = await client.query<{ id: string; input_hash: string; tool_id: string; tool_version: string; status: string; output: ToolResult | null }>(
      "select * from agent_tool_call where user_id=$1 and run_id=$2 and (call_key=$3 or id=$4::uuid)", [context.userId, context.runId, call.key,previous.rows[0]?.id??null]);
    const row = stored.rows[0];
    if (row.input_hash !== digest(call.input) || row.tool_id !== call.tool || row.tool_version !== call.version) throw new Error("Persisted call identity mismatch");
    if (inserted.rowCount && call.approvalId) await client.query("update agent_tool_call set approval_id=$2 where id=$1", [row.id, call.approvalId]);
    return { ...row, fresh: Boolean(inserted.rowCount) };
  });
}
export async function completeCall(context: ExecutionContext, id: string, output: ToolResult, metrics: Record<string, unknown>) {
  // Late receipts are saved even after cancellation, but never overwrite an existing receipt.
  await tenantQuery(context.userId, `update agent_tool_call set status='completed',output=$3,metrics=$4,updated_at=now()
    where user_id=$1 and id=$2 and status='started'`, [context.userId, id, JSON.stringify(output), JSON.stringify(metrics)]);
}
