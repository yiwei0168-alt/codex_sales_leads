import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

export async function verifyMa24MailboxSyncClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const connection = await options.admin.query<{ id: string }>(
    `insert into mailbox_connection(user_id,provider,email,display_name,credential_ciphertext,host,status)
     values($1,'alimail-imap','ma24-sync@example.invalid','Synthetic sync','synthetic-unusable','invalid.example','active') returning id`,
    [options.userId],
  );
  const connectionId = connection.rows[0].id;
  const completedRange = { connectionId, folderScope: "inbox", from: "2026-09-01", through: "2026-09-30", maxMessages: 100 };
  const failedRange = { connectionId, folderScope: "both", from: "2026-10-01", through: "2026-10-15", maxMessages: 100 };
  await options.admin.query(
    `insert into mailbox_work_job(user_id,kind,target_id,payload,status,result,created_at)
     values($1,'sync',$2,$3,'completed',$4,now()-interval '1 hour')`,
    [options.userId, connectionId, JSON.stringify(completedRange), JSON.stringify({ discovered: 253, processed: 253, remaining: 0, imported: 250 })],
  );
  await options.admin.query(
    `insert into mailbox_work_job(user_id,kind,target_id,payload,status,result,error)
     values($1,'sync',$2,$3,'failed',$4,'Synthetic interruption')`,
    [options.userId, connectionId, JSON.stringify(failedRange), JSON.stringify({ discovered: 130, processed: 100, remaining: 30, imported: 100 })],
  );
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const [cookieName, cookieValue] = options.cookie.split("=");
  assert(cookieName && cookieValue);
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([{ name: cookieName, value: cookieValue, url: options.base }]);
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "客户开发", exact: true }).click();
        await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
        await page.getByRole("button", { name: "管理 / 连接邮箱" }).click();
        const dialog = page.getByRole("dialog", { name: "管理 / 连接邮箱" });
        await expect(dialog.locator(".mailbox-sync-progress")).toHaveCount(2);
        await expect(dialog.locator(".mailbox-sync-progress").first()).toContainText("发现 130 封 · 本次处理 100 封 · 剩余待处理 30 封 · 新增 100 封");
        await expect(dialog.locator(".mailbox-sync-progress").first()).toContainText("2026-10-01 至 2026-10-15 · 收件箱及已发送");
        await expect(dialog.locator(".mailbox-sync-progress").nth(1)).toContainText("发现 253 封 · 本次处理 253 封 · 剩余待处理 0 封 · 新增 250 封");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        if (viewport.width < 700) {
          await page.screenshot({ path: "tmp/ma24-g13-f04-sync-progress-mobile.png", fullPage: true });
          await dialog.getByRole("button", { name: "同步", exact: true }).scrollIntoViewIfNeeded();
          await expect(dialog.getByRole("button", { name: "同步", exact: true })).toBeVisible();
        } else {
          const response = page.waitForResponse(value => value.url().endsWith("/api/mailbox/sync") && value.request().method() === "POST");
          await dialog.getByRole("button", { name: "按原范围继续同步" }).click();
          assert.equal((await response).status(), 202);
          await expect(dialog.locator(".mailbox-sync-progress").first()).toContainText("等待后台开始；发现量尚未确定");
        }
      } finally {
        await context.close();
      }
    }
    const queued = (await options.admin.query<{ payload: Record<string, unknown>; status: string }>(
      "select payload,status from mailbox_work_job where user_id=$1 and kind='sync' and status='queued'", [options.userId],
    )).rows;
    assert.equal(queued.length, 1);
    assert.deepEqual(queued[0].payload, failedRange);
    assert.equal((await options.admin.query("select count(*)::int as n from mailbox_sync_run where user_id=$1", [options.userId])).rows[0].n, 0);
    return { candidatePage: true, syntheticSyncJobs: 2, queuedContinuation: 1,
      exactFrozenRangeReused: true, workerStarted: false, imapCalls: 0, modelCalls: 0,
      mailSends: 0, viewports: ["390x760", "1366x900"], noHorizontalOverflow: true, pageErrors: 0 };
  } finally {
    await browser.close();
  }
}
