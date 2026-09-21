import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth/password";

nextEnv.loadEnvConfig(process.cwd());
if (process.env.MA16_ISOLATED_WORKER_STOPPED !== "1") {
  throw new Error("Stop the main-Agent worker and set MA16_ISOLATED_WORKER_STOPPED=1 before running this queued-run verification");
}
const base = process.env.UI_VERIFY_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_MIGRATION_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)
  || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("MA16 verification requires local product and local isolated database");
}

const pool = new Pool({ connectionString: databaseUrl });
const userId = randomUUID(), workspaceId = randomUUID();
const email = `ma16-${userId}@example.invalid`;
const password = randomBytes(32).toString("base64url");
const browser = await chromium.launch({ channel: "chrome", headless: true });
let created = false;
try {
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'MA16 isolated fixture',$3,'member','active')", [userId, email, hashPassword(password)]);
  created = true;
  await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','MA16 fixture','Global','WW','Synthetic acceptance')", [workspaceId, userId]);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".ai-composer textarea")).toBeVisible();
  async function post(path: string, data: unknown) {
    return page.evaluate(async ({ path, data }) => {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      return { status: response.status, body: await response.json() };
    }, { path, data });
  }
  const first = await post("/api/assistant/messages", { content: "比较两款产品的差异", knowledgeScope: ["product"] });
  expect(first.status).toBe(202);
  const firstBody = first.body as { conversation: { id: string }; run: { id: string; status: string } };
  expect(firstBody.run.status).toBe("queued");
  const second = await post("/api/assistant/messages", { conversationId: firstBody.conversation.id, content: "请继续说明来源" });
  expect(second.status).toBe(202);
  const secondBody = second.body as { conversation: { id: string }; run: { id: string; status: string } };
  expect(secondBody.conversation.id).toBe(firstBody.conversation.id);

  const runs = await page.evaluate(async id => {
    const response = await fetch(`/api/assistant/runs?conversationId=${encodeURIComponent(id)}`);
    return { status: response.status, body: await response.json() };
  }, firstBody.conversation.id);
  expect(runs.status).toBe(200);
  const runBody = runs.body as { enabled: boolean; runs: Array<{ id: string }> };
  expect(runBody.enabled).toBe(true);
  expect(runBody.runs.map(run => run.id)).toEqual(expect.arrayContaining([firstBody.run.id, secondBody.run.id]));
  const legacy = await post("/api/rag/query", { question: "通过旧入口提问", filters: { collections: ["product"] } });
  expect(legacy.status).toBe(202);

  const saved = await pool.query("select id,execution_kind,status,input from agent_run where user_id=$1 order by created_at", [userId]);
  expect(saved.rows).toHaveLength(3);
  expect(saved.rows.every(run => run.execution_kind === "main-agent" && run.status === "queued")).toBe(true);
  expect(saved.rows[0].input.knowledgeScope).toEqual(["product"]);
  expect(saved.rows[2].input.knowledgeScope).toEqual(["product"]);
  expect((await pool.query("select count(*)::int n from paid_call_reservation where user_id=$1", [userId])).rows[0].n).toBe(0);
  console.log(JSON.stringify({ ok: true, queuedRuns: 3, conversationRestored: true, knowledgeScope: ["product"], legacyQueryStatus: 202, paidCalls: 0 }));
  await context.close();
} finally {
  await browser.close();
  if (created) {
    for (const table of ["agent_run_event", "agent_tool_call", "agent_approval", "agent_run", "product_operation_metric"]) {
      await pool.query(`delete from ${table} where user_id=$1`, [userId]);
    }
    await pool.query("delete from assistant_conversation where user_id=$1", [userId]);
    await pool.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
    await pool.query("delete from app_user where id=$1 and display_name='MA16 isolated fixture'", [userId]);
  }
  await pool.end();
}
