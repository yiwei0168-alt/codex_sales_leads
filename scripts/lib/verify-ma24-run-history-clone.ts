import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

export async function verifyMa24RunHistoryClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const conversationId = randomUUID();
  const runId = randomUUID();
  await options.admin.query(
    "insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic forty-event run')",
    [conversationId, options.userId],
  );
  await options.admin.query(
    `insert into agent_run(id,user_id,conversation_id,request_key,request_hash,status,input,model_config)
     values($1,$2,$3,$4,$5,'paused','{}','{}')`,
    [runId, options.userId, conversationId, randomUUID(), randomUUID()],
  );
  for (let index = 1; index <= 40; index++) {
    await options.admin.query(
      "insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'tool_result',$3)",
      [options.userId, runId, JSON.stringify({ tool: `Synthetic step ${String(index).padStart(2, "0")}`, status: "success", callId: randomUUID() })],
    );
  }
  const totalEvents = (await options.admin.query<{ n: number }>(
    "select count(*)::int as n from agent_run_event where user_id=$1 and run_id=$2", [options.userId, runId],
  )).rows[0].n;
  assert(totalEvents >= 40 && totalEvents <= 41);
  const list = await fetch(`${options.base}/api/assistant/runs?conversationId=${conversationId}`, { headers: { cookie: options.cookie } });
  assert.equal(list.status, 200);
  assert.equal((await list.json() as { runs: Array<{ id: string }> }).runs[0].id, runId);
  const events = await fetch(`${options.base}/api/assistant/runs/${runId}/events?after=0`, { headers: { cookie: options.cookie } });
  assert.equal(events.status, 200);
  assert.equal((await events.text()).match(/^event: tool_result$/gm)?.length, 40);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [iteration, viewport] of [{ width: 390, height: 760 }, { width: 1366, height: 900 }].entries()) {
      const pageEventCount = totalEvents + iteration;
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(`${options.base}/c/${conversationId}`);
        const run = page.getByRole("region", { name: "当前任务" });
        await expect(run).toContainText("已暂停");
        await expect(run.getByText(`查看执行详情（${pageEventCount} 条）`)).toBeVisible();
        await run.getByText(`查看执行详情（${pageEventCount} 条）`).click();
        await expect(run.locator(".agent-run-event")).toHaveCount(16);
        await expect(run).toContainText("Synthetic step 40");
        await run.getByRole("button", { name: `加载更早记录（剩余 ${pageEventCount - 16} 条）` }).click();
        await expect(run.locator(".agent-run-event")).toHaveCount(pageEventCount);
        await expect(run).toContainText("Synthetic step 01");
        const instruction = `Synthetic instruction ${viewport.width}`;
        await run.getByRole("textbox", { name: "追加任务要求" }).fill(instruction);
        const response = page.waitForResponse(value => value.url().endsWith(`/api/assistant/runs/${runId}/control`) && value.request().method() === "POST");
        await run.getByRole("button", { name: "追加", exact: true }).click();
        assert.equal((await response).status(), 200);
        await expect(run.getByRole("textbox", { name: "追加任务要求" })).toHaveValue("");
        const saved = (await options.admin.query<{ instructions: Array<{ content: string }> }>(
          "select instructions from agent_run where id=$1 and user_id=$2", [runId, options.userId],
        )).rows[0].instructions;
        assert(saved.some(item => item.content === instruction));
        if (viewport.width > 700) {
          const rejectedInstruction = "Synthetic stale control must remain editable";
          await run.getByRole("textbox", { name: "追加任务要求" }).fill(rejectedInstruction);
          await page.route(`**/api/assistant/runs/${runId}/control`, async route => {
            await options.admin.query("update agent_run set status='completed' where id=$1 and user_id=$2", [runId, options.userId]);
            await route.continue();
          }, { times: 1 });
          const rejected = page.waitForResponse(value => value.url().endsWith(`/api/assistant/runs/${runId}/control`) && value.request().method() === "POST");
          await run.getByRole("button", { name: "追加", exact: true }).click();
          assert.equal((await rejected).status(), 409);
          await expect(run.getByRole("textbox", { name: "追加任务要求" })).toHaveValue(rejectedInstruction);
          await expect(page.getByRole("status").filter({ hasText: "操作失败" })).toBeVisible();
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    const saved = (await options.admin.query<{ instructions: Array<{ content: string }> }>(
      "select instructions from agent_run where id=$1 and user_id=$2", [runId, options.userId],
    )).rows[0].instructions;
    assert.equal(saved.length, 2);
    return { candidatePage: true, syntheticToolEvents: 40, totalEventsBeforeControl: totalEvents,
      initialVisible: 16, expandedVisibleByViewport: [totalEvents, totalEvents + 1],
      actualControlApiAccepted: 2, persistedInstructions: 2, actualControlConflict: 409,
      failedInstructionRetained: true, workerStarted: false, modelCalls: 0,
      viewports: ["390x760", "1366x900"], noHorizontalOverflow: true, pageErrors: 0 };
  } finally { await browser.close(); }
}
