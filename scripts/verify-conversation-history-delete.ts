import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { appendMessage, createConversation, deleteConversation, getConversation, listConversations } from "../src/lib/assistant/repository";
import { enqueueRun, listRuns } from "../src/lib/assistant/main/repository";
import { defaultModelConfig } from "../src/lib/assistant/main/product";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw Error("Database configuration required");
if (process.env.DATABASE_URL) {
  const adminTarget = new URL(url), appTarget = new URL(process.env.DATABASE_URL);
  assert.equal(`${adminTarget.hostname}:${adminTarget.port || "5432"}${adminTarget.pathname}`,
    `${appTarget.hostname}:${appTarget.port || "5432"}${appTarget.pathname}`);
}
const admin = new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
const users = [randomUUID(), randomUUID()];
try {
  for (const id of users) await admin.query(
    "insert into app_user(id,email,display_name) values($1,$2,'Synthetic conversation history test')",
    [id, `${id}@example.invalid`]);
  const conversationId = await createConversation(users[0], "Synthetic deletion test");
  await appendMessage(users[0], conversationId, {role:"user",intent:"general",content:"Synthetic question"});
  const run = await enqueueRun(users[0], {content:"Synthetic question",conversationId,requestKey:randomUUID(),attachments:[]}, defaultModelConfig());
  assert.equal(await deleteConversation(users[0], conversationId), "active-task");
  assert.equal(await deleteConversation(users[1], conversationId), "missing");
  assert(await getConversation(users[0], conversationId));
  await tenantQuery(users[0], "update agent_run set status='completed' where id=$1 and user_id=$2", [run.id, users[0]]);
  assert.equal(await deleteConversation(users[0], conversationId), "deleted");
  assert.equal(await deleteConversation(users[0], conversationId), "missing");
  assert.equal(await getConversation(users[0], conversationId), null);
  assert(!((await listConversations(users[0])).some(item => item.id === conversationId)));
  assert.equal((await listRuns(users[0], conversationId))[0]?.id, run.id);
  const retained = await tenantQuery<{count:number}>(users[0],
    "select count(*)::int as count from assistant_message where user_id=$1 and conversation_id=$2", [users[0],conversationId]);
  assert(retained[0].count >= 1);
  assert.equal((await listRuns(users[1], conversationId)).length, 0);
  console.log("Conversation soft delete: active guard, account isolation, hidden history, retained task/message: PASS");
} finally {
  for (const id of users) await admin.query("delete from app_user where id=$1",[id]).catch(() => undefined);
  await getPool().end().catch(() => undefined);
  await admin.end();
}
