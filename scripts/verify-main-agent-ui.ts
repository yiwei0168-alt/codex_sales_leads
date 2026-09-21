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
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(`page: ${error.message}`));
    page.on("console", message => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
    page.on("response", response => { if (response.status() >= 400) browserErrors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    await page.goto(base);
    await page.getByLabel("登录邮箱").fill(email); await page.getByLabel("密码", { exact: true }).fill(password);
    const loginResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST", { timeout: 5000 });
    await page.getByRole("button", { name: "登录", exact: true }).click();
    const loginResponse = await loginResponsePromise.catch(() => { throw new Error(`Login request never sent. Browser errors: ${browserErrors.join(" | ")}`); });
    if (!loginResponse.ok()) {
      const detail = await loginResponse.json().catch(() => ({})) as { error?: string };
      throw new Error(`Synthetic login failed: HTTP ${loginResponse.status()} ${detail.error ?? "unknown"}`);
    }
    await expect(page.getByRole("heading", { name: "今天想推进哪个市场？" })).toBeVisible();
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "Agent 设置" }).click();
    await expect(page.getByText("Skill、记忆与定时任务", { exact: true })).toBeVisible();
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    await page.getByLabel("方法名称").fill(`Fixture ${viewport.width}`);
    await page.getByLabel("使用说明", { exact: true }).fill("Use only supplied public facts. Never send mail.");
    await page.getByRole("button", { name: "保存方法", exact: true }).click();
    await expect(page.getByText(`Fixture ${viewport.width}`, { exact: true })).toBeVisible();
    await page.route("**/api/assistant/skills", route => {
      const payload = route.request().method() === "POST" ? route.request().postDataJSON() as Record<string, unknown> : null;
      if (payload?.kind === "url") {
        expect(payload).toMatchObject({ name: `Source ${viewport.width}`, url: "https://example.com/SKILL.md" });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: randomUUID(), version: 1, validation: { instructions: "available", scripts: "none", dependencies: "not-declared" } }) });
      }
      return route.continue();
    });
    await page.getByLabel("来源 Skill 名称").fill(`Source ${viewport.width}`);
    await page.getByLabel("公开 SKILL.md 的 HTTPS 网址").fill("https://example.com/SKILL.md");
    await page.getByRole("button", { name: "从公开来源导入", exact: true }).click();
    await expect(page.getByRole("status").getByText(/公开 Skill 来源已导入/)).toBeVisible();
    await page.getByLabel("任务名称").fill(`Schedule ${viewport.width}`);
    await page.getByLabel("执行要求", { exact: true }).fill("Read account tasks only; no sending");
    await page.getByRole("button", { name: "创建周期任务", exact: true }).click();
    await expect(page.getByText(`Schedule ${viewport.width}`, { exact: true })).toBeVisible();
    await page.reload();
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "Agent 设置" }).click();
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    await expect(page.getByText(`Fixture ${viewport.width}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Schedule ${viewport.width}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `tmp/main-agent-library-${viewport.width}.png`, fullPage: true });
    await page.getByText("Skill、记忆与定时任务", { exact: true }).click();
    // The root is a new conversation. History lives in the one application sidebar.
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("region", { name: "对话历史" }).locator(".conversation-history-select").filter({ hasText: "Synthetic review task" }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${run.conversation_id}$`));
    await page.reload();
    if (viewport.width < 800) {
      await page.getByRole("button", { name: "打开导航菜单" }).click();
      await page.getByRole("dialog", { name: "主导航菜单" }).getByRole("button", { name: "关闭导航菜单" }).click();
      await expect(page.locator("#primary-navigation")).not.toHaveClass(/mobile-open/);
    }
    await expect(page.getByText("确认操作 · plan_confirmation", { exact: true })).toBeVisible();
    await expect(page.getByText(/执行记录 · \d+ 条已保存事件/)).toBeVisible();
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
    if (viewport.width < 800) await expect(page.locator("#primary-navigation")).not.toHaveClass(/mobile-open/);
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "知识库 & RAG" }).click();
    await expect(page.getByRole("heading", { name: "知识库 & RAG" })).toBeVisible();
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "对话", exact: true }).click();
    await expect(page.getByText("确认操作 · plan_confirmation", { exact: true })).toBeVisible();
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "销售线索" }).click();
    await expect(page).toHaveURL(/\/markets\/all\/leads$/);
    if (viewport.width < 800) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "对话", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${run.conversation_id}$`));
    await expect(page.getByText("确认操作 · plan_confirmation", { exact: true })).toBeVisible();
    checks.push(`${viewport.width}:authenticated-import-source-form-schedule-refresh-exact-batch-approval-no-overflow`);
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
