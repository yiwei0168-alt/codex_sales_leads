import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import { digest } from "../../src/lib/assistant/main/contracts";

export async function verifyMa24NonMailApprovalRawJsonClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const conversation = randomUUID(), run = randomUUID(), approval = randomUUID();
  const longValue = "SYNTHETIC".repeat(180);
  const payload = { id: randomUUID(), name: "Synthetic inactive method", revision: 7,
    reason: "UI-only denial check", diagnosticKey: longValue };
  const hash = digest({ tool: "skill_delete", version: "1", input: payload });
  await options.admin.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic non-mail approval')",
    [conversation, options.userId]);
  await options.admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,status,input,model_config)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'waiting_user','{}','{}')`,
    [run, options.userId, conversation]);
  await options.admin.query(`insert into agent_approval(id,user_id,run_id,tool_id,tool_version,parameter_hash,payload)
    values($1,$2,$3,'skill_delete','1',$4,$5)`,
    [approval, options.userId, run, hash, JSON.stringify(payload)]);
  const runApi = await fetch(`${options.base}/api/assistant/runs?conversationId=${conversation}`,
    { headers: { cookie: options.cookie } });
  assert.equal(runApi.status, 200);
  const listed = await runApi.json() as { runs: Array<{ id: string; approvals: Array<{ id: string; payload: unknown }> }> };
  assert.equal(listed.runs[0].id, run);
  assert.equal(listed.runs[0].approvals[0].id, approval);
  assert.deepEqual(listed.runs[0].approvals[0].payload, payload);
  const explicit = await fetch(`${options.base}/api/assistant/runs/${run}/approvals`,
    { headers: { cookie: options.cookie } });
  assert.equal(explicit.status, 200);
  assert.deepEqual((await explicit.json() as { approvals: Array<{ payload: unknown }> }).approvals[0].payload, payload);
  const anonymous = await fetch(`${options.base}/api/assistant/runs/${run}/approvals`);
  assert.equal(anonymous.status, 401);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.base });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${options.base}/c/${conversation}`);
        const runCard = page.getByRole("region", { name: "当前任务" });
        const card = runCard.locator(".agent-approval").filter({ hasText: "确认删除方法" });
        await expect(card).toBeVisible();
        await expect(card).toContainText("Synthetic inactive method");
        const raw = card.locator(".raw-json-details").filter({ hasText: "工具参数与版本详情" });
        await expect(raw).not.toHaveAttribute("open");
        await raw.locator("summary").click();
        await expect(raw.locator("pre")).toContainText(longValue);
        assert(await raw.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await raw.getByRole("button", { name: "复制 JSON" }).click();
        await expect(raw.getByRole("status")).toContainText("已复制原始 JSON");
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), payload);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        if (viewport.width > 700) {
          const response = page.waitForResponse(value => value.url().endsWith(`/api/assistant/approvals/${approval}`)
            && value.request().method() === "POST");
          await card.getByRole("button", { name: "拒绝" }).click();
          assert.equal((await response).status(), 200);
          assert.equal((await options.admin.query("select status from agent_approval where id=$1", [approval])).rows[0].status, "denied");
          assert.equal((await options.admin.query("select status from agent_run where id=$1", [run])).rows[0].status, "queued");
          const stale = await fetch(`${options.base}/api/assistant/approvals/${approval}`, {
            method: "POST", headers: { cookie: options.cookie, "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve", parameterHash: hash }),
          });
          assert.equal(stale.status, 409);
          assert.equal((await options.admin.query("select status from agent_approval where id=$1", [approval])).rows[0].status, "denied");
        }
      } finally { await context.close(); }
    }
    assert.equal((await options.admin.query("select count(*)::int as n from agent_tool_call where approval_id=$1", [approval])).rows[0].n, 0);
    return { candidatePage: true, runApi: 200, approvalApi: 200, anonymousDenied: true,
      copiedJsonEqualsApi: true, defaultCollapsed: true, noHorizontalOverflow: true,
      rejectedViaActualApi: true, staleApproveConflict: 409, executedToolCalls: 0,
      viewports: ["390x760", "1366x900"], pageErrors: 0, modelCalls: 0, productionWrites: 0 };
  } finally { await browser.close(); }
}
