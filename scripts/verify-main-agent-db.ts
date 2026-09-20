import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { enqueueRun, getRun, beginCall, completeCall, readEvents, boundary, controlRun } from "../src/lib/assistant/main/repository";
import { result, type ExecutionContext } from "../src/lib/assistant/main/contracts";
import { defaultModelConfig } from "../src/lib/assistant/main/product";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Database configuration required");
if (process.env.DATABASE_URL) {
  const a = new URL(url), b = new URL(process.env.DATABASE_URL);
  assert.equal(`${a.hostname}:${a.port || "5432"}${a.pathname}`, `${b.hostname}:${b.port || "5432"}${b.pathname}`);
}
const admin = new Pool({ connectionString: databaseConnectionString(url), ssl: databaseSslConfiguration(url) });
const owners = [randomUUID(), randomUUID()];
let checks = 0;
try {
  if (process.argv.includes("--apply")) await admin.query(await readFile("db/migrations/090_main_agent_runtime.sql", "utf8"));
  for (const id of owners) await admin.query("insert into app_user(id,email,display_name) values($1,$2,'Synthetic main Agent test')", [id, `${id}@example.invalid`]);
  const input = { content: "Synthetic isolated task, no provider calls", requestKey: randomUUID(), attachments: [] };
  const run = await enqueueRun(owners[0], input, defaultModelConfig());
  assert.equal((await enqueueRun(owners[0], input, defaultModelConfig())).id, run.id); checks++;
  await assert.rejects(enqueueRun(owners[0], { ...input, content: "changed" }, defaultModelConfig())); checks++;
  assert.equal(await getRun(owners[1], run.id), null); checks++;
  await assert.rejects(enqueueRun(owners[1], { ...input, conversationId: run.conversation_id }, defaultModelConfig())); checks++;
  const context: ExecutionContext = { userId: owners[0], runId: run.id, leaseToken: randomUUID(), role: "member" };
  await tenantQuery(owners[0], "update agent_run set status='running',lease_token=$3,lease_until=now()+interval '90 seconds' where user_id=$1 and id=$2", [owners[0], run.id, context.leaseToken]);
  assert.equal((await boundary(context)).id, run.id); checks++;
  await assert.rejects(boundary({ ...context, leaseToken: randomUUID() })); checks++;
  const args = { key: "tool:one", tool: "company_read", version: "1", input: { candidateId: "synthetic" }, effect: "read" };
  const started = await beginCall(context, args); assert.equal(started.fresh, true); checks++;
  assert.equal((await beginCall(context, args)).fresh, false); checks++;
  await assert.rejects(beginCall(context, { ...args, input: { candidateId: "changed" } })); checks++;
  await completeCall(context, started.id, result({ receipt: "synthetic" }), { inputItems: 1, validOutputItems: 1, downstreamUsedItems: null });
  assert.deepEqual((await beginCall(context, args)).output?.data, { receipt: "synthetic" }); checks++;
  const events = await readEvents(owners[0], run.id, "0"); assert.equal(events.length, 1); checks++;
  assert.equal((await readEvents(owners[0], run.id, events[0].id)).length, 0); checks++;
  assert.equal((await readEvents(owners[1], run.id, "0")).length, 0); checks++;
  await controlRun(owners[0], run.id, "cancel");
  await assert.rejects(beginCall(context, { ...args, key: "tool:two" })); checks++;
  const tables = await admin.query<{ forced: boolean }>("select relforcerowsecurity as forced from pg_class where relname=any($1::text[])", [["agent_run", "agent_run_event", "agent_tool_call"]]);
  assert.equal(tables.rows.length, 3); assert(tables.rows.every(t => t.forced)); checks++;
  console.log(JSON.stringify({ passed: checks, synthetic: true, modelCalls: 0, searchCalls: 0, sends: 0, customerDataModified: false }));
} finally {
  for (const id of owners) {
    await admin.query("delete from agent_run_event where user_id=$1", [id]);
    await admin.query("delete from agent_tool_call where user_id=$1", [id]);
    await admin.query("delete from agent_run where user_id=$1", [id]);
    await admin.query("delete from assistant_message where user_id=$1", [id]);
    await admin.query("delete from assistant_conversation where user_id=$1", [id]);
    await admin.query("delete from app_user where id=$1", [id]);
  }
  await admin.end(); await getPool().end();
}
