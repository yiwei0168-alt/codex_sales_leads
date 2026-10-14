import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

export async function verifyMa24ConversationDeleteClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 760 }]) {
      const title = `MA24 isolated delete ${viewport.width}`;
      const created = await fetch(`${options.base}/api/assistant/conversations`, {
        method: "POST", headers: { cookie: options.cookie, "content-type": "application/json" },
        body: JSON.stringify({ title }), signal: AbortSignal.timeout(10_000),
      });
      assert.equal(created.status, 201);
      const conversationId = ((await created.json()) as { id: string }).id;
      assert(/^[a-f0-9-]{36}$/.test(conversationId));
      const runId = randomUUID();
      await options.admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,status,input,model_config)
        values($1,$2,$3,$4,$5,'paused','{}','{}')`, [runId, options.userId, conversationId, randomUUID(), randomUUID()]);
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        const trigger = page.getByRole("button", { name: `${title} 更多操作` });
        await expect(trigger).toBeVisible({ timeout: 15_000 });
        await trigger.click();
        await page.getByRole("menuitem", { name: "删除对话" }).click();
        const dialog = page.getByRole("dialog", { name: "删除对话" });
        await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
        await expect(dialog.getByText(/等待确认或暂停的任务/)).toBeVisible();
        await dialog.getByRole("button", { name: "取消" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByRole("menuitem", { name: "删除对话" }).click();
        const blockedResponse = page.waitForResponse(response => response.url().endsWith(`/api/assistant/conversations/${conversationId}`)
          && response.request().method() === "DELETE");
        await dialog.getByRole("button", { name: "删除对话" }).click();
        assert.equal((await blockedResponse).status(), 409);
        await expect(dialog.getByRole("alert")).toContainText("未结束的任务或操作");
        assert.equal((await options.admin.query("select status from assistant_conversation where id=$1", [conversationId])).rows[0].status, "active");
        await options.admin.query("update agent_run set status='completed' where id=$1", [runId]);
        const deletedResponse = page.waitForResponse(response => response.url().endsWith(`/api/assistant/conversations/${conversationId}`)
          && response.request().method() === "DELETE");
        await dialog.getByRole("button", { name: "删除对话" }).click();
        assert.equal((await deletedResponse).status(), 200);
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toHaveCount(0);
        assert.equal((await options.admin.query("select status from assistant_conversation where id=$1", [conversationId])).rows[0].status, "deleted");
        assert.equal((await options.admin.query("select status from agent_run where id=$1", [runId])).rows[0].status, "completed");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        results.push({ viewport, cancelFocusRestored: true, pausedRunBlocked: true,
          blockedStatus: 409, completedRunAllowsDelete: true, deletedStatus: 200,
          databaseSoftDeleted: true, taskRetained: true, noHorizontalOverflow: true });
      } finally {
        await context.close();
      }
    }
    return { candidatePageAndDatabase: true, syntheticCloneOnly: true, modelCalls: 0, results };
  } finally {
    await browser.close();
  }
}
