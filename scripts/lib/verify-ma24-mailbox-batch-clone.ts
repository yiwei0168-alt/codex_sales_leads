import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import { encryptMailboxContent } from "../../src/lib/mailbox/crypto";

export async function verifyMa24MailboxBatchClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const connection = await options.admin.query<{ id: string }>(
    `insert into mailbox_connection(user_id,provider,email,display_name,credential_ciphertext,host,status)
     values($1,'alimail-imap','ma24-batch@example.invalid','Synthetic batch','synthetic-unusable','invalid.example','active')
     returning id`, [options.userId],
  );
  const connectionId = connection.rows[0].id;
  const messageIds: string[] = [];
  const messageDigests = new Map<string, string>();
  for (let index = 1; index <= 10; index++) {
    const body = `Synthetic mailbox batch item ${index}. No real sender or account.`;
    const digest = createHash("sha256").update(body).digest("hex");
    const subject = `Synthetic mail ${index}`;
    const sealed = encryptMailboxContent(options.userId,
      { subject, bodyText: body, sender: [], recipients: [] });
    const inserted = await options.admin.query<{ id: string }>(
      `insert into mailbox_message(user_id,connection_id,folder_path,uid_validity,message_uid,
        internet_message_id,direction,subject,body_text,content_sha256,content_ciphertext,screening_bucket,screened_at)
       values($1,$2,'INBOX','ma24-synthetic', $3,$4,'inbound','', '',$5,$6,'review',now()) returning id`,
      [options.userId, connectionId, index, `<ma24-batch-${index}@example.invalid>`,
        digest, sealed],
    );
    messageIds.push(inserted.rows[0].id);
    messageDigests.set(inserted.rows[0].id, digest);
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 760 }]) {
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
        await page.getByRole("button", { name: "客户开发", exact: true }).click();
        await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
        await page.getByRole("tab", { name: /私有学习候选/ }).click();
        const panel = page.getByRole("tabpanel");
        await expect(panel.locator(".mailbox-row")).toHaveCount(8);
        await panel.getByRole("checkbox", { name: "选择当前页" }).check();
        await expect(panel.getByRole("button", { name: "授权所选 8" })).toBeEnabled();
        await panel.getByRole("button", { name: "下一页" }).click();
        await expect(panel.locator(".mailbox-row")).toHaveCount(2);
        await panel.getByRole("checkbox", { name: "选择当前页" }).check();
        await expect(panel.getByRole("button", { name: "授权所选 10" })).toBeEnabled();
        await panel.getByRole("button", { name: "上一页" }).click();
        await expect(panel.getByRole("checkbox", { name: "选择当前页" })).toBeChecked();
        await page.reload();
        await page.getByRole("tab", { name: /私有学习候选/ }).click();
        await expect(page.getByRole("tabpanel").locator(".mailbox-row")).toHaveCount(8);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        results.push({ viewport, selectedAcrossPages: 10, noHorizontalOverflow: true, pageErrors: 0 });
      } finally {
        await context.close();
      }
    }
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const [name, value] = options.cookie.split("=");
    assert(name && value);
    await context.addCookies([{ name, value, url: options.base }]);
    try {
      const page = await context.newPage();
      await page.goto(options.base);
      await page.getByRole("button", { name: "客户开发", exact: true }).click();
      await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
      await page.getByRole("tab", { name: /私有学习候选/ }).click();
      const panel = page.getByRole("tabpanel");
      await panel.getByRole("button", { name: "选择全部待学习" }).click();
      await expect(panel.getByRole("button", { name: "授权所选 10" })).toBeEnabled();
      let confirmation = "";
      page.on("dialog", async dialog => { confirmation = dialog.message(); await dialog.accept(); });
      const response = page.waitForResponse(value => value.url().endsWith("/api/mailbox/screening")
        && value.request().method() === "POST");
      await panel.getByRole("button", { name: "授权所选 10" }).click();
      const authorization = await response;
      assert.equal(authorization.status(), 202);
      assert.match(confirmation, /10 封/);
      await expect(page.getByText("已排队 10 封", { exact: false })).toBeVisible();
      await page.reload();
      await expect(page.getByText("1 个邮箱已连接 · 后台处理中")).toBeVisible();
      await page.getByRole("button", { name: "管理 / 连接邮箱" }).click();
      await expect(page.getByText(/后台任务：排队 10/)).toBeVisible();
    } finally {
      await context.close();
    }
    const jobs = (await options.admin.query<{ target_id: string; status: string; payload: { consent?: boolean; contentSha256?: string } }>(
      "select target_id,status,payload from mailbox_work_job where user_id=$1 and kind='learn'", [options.userId],
    )).rows;
    assert.equal(jobs.length, 10);
    assert.equal(new Set(jobs.map(job => job.target_id)).size, 10);
    assert(jobs.every(job => messageIds.includes(job.target_id) && job.status === "queued"
      && job.payload.consent === true
      && job.payload.contentSha256 === messageDigests.get(job.target_id)));
    assert.equal((await options.admin.query("select count(*)::int as n from mailbox_sync_run where user_id=$1", [options.userId])).rows[0].n, 0);
    return { candidatePage: true, syntheticMessages: 10, queuedLearningJobs: 10,
      gatewayCredential: "synthetic-unusable", workerStarted: false, modelCalls: 0, mailSends: 0, results };
  } finally {
    await browser.close();
  }
}
