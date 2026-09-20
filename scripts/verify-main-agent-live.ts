import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { enqueueRun, finishRun } from "../src/lib/assistant/main/repository";
import { defaultModelConfig } from "../src/lib/assistant/main/product";
import { executeMainAgentRun } from "../src/lib/assistant/main/graph";
nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--live")) throw new Error("Explicit --live required; uses configured model and records billing");
// Exercise the confirmed MA05 policy in this verification process, not the legacy owner-only gate.
process.env.PRODUCT_FINANCIAL_POLICY = "observe";
// Close only earlier public probes that failed before making any call.
await tenantQuery(OWNER_USER_ID, `update agent_run r set status='failed',lease_until=null where user_id=$1
  and request_key like 'live-main-agent-%' and status='running'
  and not exists(select 1 from agent_tool_call c where c.run_id=r.id and c.user_id=r.user_id)`, [OWNER_USER_ID]);
const run = await enqueueRun(OWNER_USER_ID, {
  content: "This is a public synthetic acceptance probe. Call discover_tools once and summarize which tools can read knowledge and which can send email. Do not read any business records, send mail, or use any other tools.",
  requestKey: `live-main-agent-${randomUUID()}`, attachments: [],
}, defaultModelConfig());
const token = randomUUID();
await tenantQuery(OWNER_USER_ID, "update agent_run set status='running',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2", [OWNER_USER_ID, run.id, token]);
try {
  await executeMainAgentRun(OWNER_USER_ID, run.id, token);
  const summaries = await tenantQuery(OWNER_USER_ID, "select status,(select count(*)::int from agent_tool_call c where c.run_id=r.id and c.user_id=r.user_id) as journal_entries from agent_run r where user_id=$1 and id=$2", [OWNER_USER_ID, run.id]);
  const metrics = await tenantQuery(OWNER_USER_ID, "select tool_id,status,metrics from agent_tool_call where user_id=$1 and run_id=$2 order by created_at", [OWNER_USER_ID, run.id]);
  console.log(JSON.stringify({ mode: "live-public-synthetic", runs: summaries, calls: metrics }, null, 2));
  if (summaries[0]?.status !== "completed") process.exitCode = 1;
} catch (error) {
  await finishRun({ userId: OWNER_USER_ID, runId: run.id, leaseToken: token, role: "admin" }, "partial", "Public synthetic probe failed; saved receipts retained").catch(() => undefined);
  throw error;
} finally { await getPool().end(); }
