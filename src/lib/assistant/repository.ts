import { tenantQuery, tenantTransaction } from "@/lib/rag/db";
import type {
  AssistantActionDto, AssistantActionStatus, AssistantConversationDto, AssistantConversationSummary,
  AssistantIntent, AssistantMessageDto, LeadSearchPlan,
} from "./types";

export async function createConversation(userId: string, title = "新对话"): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into assistant_conversation (user_id, title) values ($1, $2) returning id`,
    [userId, title.slice(0, 120)],
  );
  return rows[0].id;
}

export async function listConversations(userId: string): Promise<AssistantConversationSummary[]> {
  const rows = await tenantQuery<{
    id: string; title: string; status: "active" | "archived"; updated_at: string; message_count: number;
  }>(userId,
    `select c.id, c.title, c.status, c.updated_at::text,
            (select count(*)::int from assistant_message m where m.user_id = c.user_id and m.conversation_id = c.id) as message_count
     from assistant_conversation c where c.user_id = $1 and c.status = 'active'
     order by c.updated_at desc limit 100`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, title: row.title, status: row.status, updatedAt: row.updated_at, messageCount: row.message_count }));
}

export async function getConversation(userId: string, conversationId: string): Promise<AssistantConversationDto | null> {
  const conversations = await tenantQuery<{ id: string; title: string; status: "active" | "archived" }>(userId,
    `select id, title, status from assistant_conversation where id = $1 and user_id = $2 limit 1`,
    [conversationId, userId],
  );
  if (!conversations[0]) return null;
  const [messages, actions] = await Promise.all([
    tenantQuery<{
      id: string; role: AssistantMessageDto["role"]; intent: AssistantIntent; content: string;
      metadata: AssistantMessageDto["metadata"]; created_at: string;
    }>(userId,
      `select id, role, intent, content, metadata, created_at::text from assistant_message
       where user_id = $1 and conversation_id = $2 order by created_at, id`,
      [userId, conversationId],
    ),
    tenantQuery<{
      id: string; action_type: "lead-search"; status: AssistantActionStatus; payload: LeadSearchPlan;
      result: Record<string, unknown>; error_message: string | null; created_at: string; updated_at: string;
    }>(userId,
      `select id, action_type, status, payload, result, error_message, created_at::text, updated_at::text
       from assistant_action where user_id = $1 and conversation_id = $2 order by created_at, id`,
      [userId, conversationId],
    ),
  ]);
  return {
    ...conversations[0],
    messages: messages.map((row) => ({ id: row.id, role: row.role, intent: row.intent, content: row.content, metadata: row.metadata, createdAt: row.created_at })),
    actions: actions.map((row) => ({ id: row.id, actionType: row.action_type, status: row.status, payload: row.payload,
      result: row.result, errorMessage: row.error_message ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at })),
  };
}

export async function appendMessage(userId: string, conversationId: string, input: {
  role: AssistantMessageDto["role"]; intent: AssistantIntent; content: string; metadata?: AssistantMessageDto["metadata"];
}): Promise<string> {
  return tenantTransaction(userId, async (client) => {
    const rows = await client.query<{ id: string }>(
      `insert into assistant_message (user_id, conversation_id, role, intent, content, metadata)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [userId, conversationId, input.role, input.intent, input.content, JSON.stringify(input.metadata ?? {})],
    );
    await client.query(`update assistant_conversation set updated_at = now() where id = $1 and user_id = $2`, [conversationId, userId]);
    return rows.rows[0].id;
  });
}

export async function createLeadSearchAction(userId: string, conversationId: string, payload: LeadSearchPlan): Promise<string> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `insert into assistant_action (user_id, conversation_id, action_type, payload)
     values ($1, $2, 'lead-search', $3) returning id`,
    [userId, conversationId, JSON.stringify(payload)],
  );
  return rows[0].id;
}

export async function getAssistantAction(userId: string, actionId: string): Promise<AssistantActionDto | null> {
  const rows = await tenantQuery<{
    id: string; action_type: "lead-search"; status: AssistantActionStatus; payload: LeadSearchPlan;
    result: Record<string, unknown>; error_message: string | null; created_at: string; updated_at: string;
  }>(userId,
    `select id, action_type, status, payload, result, error_message, created_at::text, updated_at::text
     from assistant_action where id = $1 and user_id = $2 limit 1`,
    [actionId, userId],
  );
  const row = rows[0];
  return row ? { id: row.id, actionType: row.action_type, status: row.status, payload: row.payload,
    result: row.result, errorMessage: row.error_message ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export async function claimLeadSearchAction(userId: string, actionId: string): Promise<{ conversationId: string; payload: LeadSearchPlan } | null> {
  const rows = await tenantQuery<{ conversation_id: string; payload: LeadSearchPlan }>(userId,
    `update assistant_action set status = 'running', confirmed_at = now(), started_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and action_type = 'lead-search' and status = 'proposed'
     returning conversation_id, payload`,
    [actionId, userId],
  );
  return rows[0] ? { conversationId: rows[0].conversation_id, payload: rows[0].payload } : null;
}

export async function setAssistantActionStatus(userId: string, actionId: string, status: AssistantActionStatus, input: {
  result?: Record<string, unknown>; error?: string;
} = {}): Promise<boolean> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `update assistant_action set status = $3, result = coalesce($4::jsonb, result), error_message = $5,
       confirmed_at = case when $3 = 'confirmed' then now() else confirmed_at end,
       started_at = case when $3 = 'running' then now() else started_at end,
       finished_at = case when $3 in ('completed', 'failed', 'cancelled') then now() else finished_at end,
       updated_at = now() where id = $1 and user_id = $2 returning id`,
    [actionId, userId, status, input.result ? JSON.stringify(input.result) : null, input.error?.slice(0, 2000) ?? null],
  );
  return Boolean(rows[0]);
}

export async function updateConversation(userId: string, conversationId: string, input: { title?: string; status?: "active" | "archived" }): Promise<boolean> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `update assistant_conversation set title = coalesce($3, title), status = coalesce($4, status), updated_at = now()
     where id = $1 and user_id = $2 returning id`,
    [conversationId, userId, input.title?.slice(0, 120) ?? null, input.status ?? null],
  );
  return Boolean(rows[0]);
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  const rows = await tenantQuery<{ id: string }>(userId,
    `delete from assistant_conversation where id = $1 and user_id = $2 returning id`,
    [conversationId, userId],
  );
  return Boolean(rows[0]);
}
