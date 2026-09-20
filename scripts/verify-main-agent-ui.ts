import nextEnv from "@next/env";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth/password";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getPool } from "../src/lib/rag/db";
import { enqueueRun } from "../src/lib/assistant/main/repository";
import { defaultModelConfig } from "../src/lib/assistant/main/product";
import { saveMemory } from "../src/lib/assistant/main/memory";
import { requestApproval } from "../src/lib/assistant/main/approvals";
import { productTools } from "../src/lib/assistant/main/tools";
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.UI_VERIFY_BASE_URL || "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("Local UI only");
const url = process.env.DATABASE_MIGRATION_URL!;
if (!url) throw new Error("Migration database required for isolated fixtures");
const pool = new Pool({ connectionString: databaseConnectionString(url), ssl: databaseSslConfiguration(url) });
const userId = randomUUID(), workspaceId = randomUUID(), password = randomBytes(32).toString("base64url"), email = `${userId}@example.invalid`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks: string[] = [];
try {
  await pool.query("insert into app_user(id,email,display_name,password_hash) values($1,$2,'Agent UI fixture',$3)", [userId, email, hashPassword(password)]);
  await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Agent UI fixture','Global','WW','Synthetic verification')", [workspaceId, userId]);
  const run = await enqueueRun(userId, { content: "Synthetic review task", requestKey: randomUUID(), attachments: [] }, defaultModelConfig());
  const context = { userId, runId: run.id, leaseToken: randomUUID(), role: "member" as const };
  await saveMemory(context, { key: "format", content: "Use a short bullet list", kind: "preference", scope: "account", mandatory: false, markets: [], companies: [] }, true);
  await requestApproval(context, productTools.find(t => t.id === "plan_confirmation")!, { plan: "Synthetic plan with zero external execution", scale: "one fixture", uncertainty: "none" });
  for(const recipient of ["batch-one@example.invalid","batch-two@example.invalid"]) await requestApproval(context,productTools.find(t=>t.id==="mail_send")!,{connectionId:randomUUID(),to:recipient,subject:"Reviewed fixture",body:"Synthetic final content; no send is executed"});
  // Keep the fixture paused even after approval so a separate worker can never
  // pick up this UI-only task. No send tool is invoked by this verifier.
  await pool.query("update agent_run set status='paused' where id=$1 and user_id=$2", [run.id, userId]);
  await mkdir("tmp", { recursive: true });
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const browserContext = await browser.newContext({ viewport });
    await browserContext.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const page = await browserContext.newPage();
    await page.goto(base);
    await page.getByLabel("登录邮箱").fill(email); await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByText("Skill、记忆与定时任务", { exact: true })).toBeVisible();
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    await page.getByLabel("方法名称").fill(`Fixture ${viewport.width}`);
    await page.getByLabel("使用说明", { exact: true }).fill("Use only supplied public facts. Never send mail.");
    await page.getByRole("button", { name: "保存方法", exact: true }).click();
    await expect(page.getByText(`Fixture ${viewport.width}`, { exact: true })).toBeVisible();
    await page.getByLabel("任务名称").fill(`Schedule ${viewport.width}`);
    await page.getByLabel("执行要求", { exact: true }).fill("Read account tasks only; no sending");
    await page.getByRole("button", { name: "创建周期任务", exact: true }).click();
    await expect(page.getByText(`Schedule ${viewport.width}`, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    await expect(page.getByText(`Fixture ${viewport.width}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Schedule ${viewport.width}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `tmp/main-agent-library-${viewport.width}.png`, fullPage: true });
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    // Opening persisted conversation must show exact approval and current memory notices.
    // The latest conversation is loaded automatically, including on mobile where
    // the conversation sidebar is collapsed.
    await expect(page.getByText("确认操作 · plan_confirmation", { exact: true })).toBeVisible();
    if (viewport.width === 1366) {
      await page.getByRole("button", { name: "撤销", exact: true }).last().click();
      await expect(page.getByText("已记住偏好：format", { exact: false })).toHaveCount(0);
      await page.getByRole("button",{name:"确认以上全部邮件（2 封）",exact:true}).click();
      await expect(page.getByRole("button",{name:"确认以上全部邮件（2 封）",exact:true})).toHaveCount(0);
      const approved=await pool.query("select count(*)::int n from agent_approval where user_id=$1 and run_id=$2 and tool_id='mail_send' and status='approved'",[userId,run.id]);
      expect(approved.rows[0].n).toBe(2);
      expect((await pool.query("select status from agent_run where id=$1 and user_id=$2",[run.id,userId])).rows[0].status).toBe("paused");
    }
    await page.screenshot({ path: `tmp/main-agent-runs-${viewport.width}.png`, fullPage: true });
    checks.push(`${viewport.width}:authenticated-import-schedule-refresh-exact-batch-approval-no-overflow`);
    await browserContext.close();
  }
  expect((await pool.query("select count(*)::int n from paid_call_reservation where user_id=$1", [userId])).rows[0].n).toBe(0);
  console.log(JSON.stringify({ passed: checks, paidCalls: 0, sends: 0, synthetic: true }));
} finally {
  await browser.close();
  for (const table of ["agent_schedule", "agent_run_skill"]) await pool.query(`delete from ${table} where user_id=$1`, [userId]);
  await pool.query("delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)", [userId]);
  await pool.query("delete from agent_skill where owner_id=$1", [userId]);
  await pool.query("delete from agent_memory_version where memory_id in(select id from agent_memory where owner_id=$1)", [userId]);
  await pool.query("delete from agent_memory where owner_id=$1", [userId]);
  for (const table of ["agent_run_event", "agent_tool_call", "agent_approval", "agent_run", "assistant_message", "assistant_conversation", "product_operation_metric"]) await pool.query(`delete from ${table} where user_id=$1`, [userId]);
  await pool.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
  await pool.query("delete from app_user where id=$1 and email=$2", [userId, email]);
  await pool.end(); await getPool().end();
}
