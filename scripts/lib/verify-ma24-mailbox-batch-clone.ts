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
    const partialContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const [partialCookieName, partialCookieValue] = options.cookie.split("=");
    assert(partialCookieName && partialCookieValue);
    await partialContext.addCookies([{ name: partialCookieName, value: partialCookieValue, url: options.base }]);
    try {
      const page = await partialContext.newPage();
      await page.route("**/api/mailbox/screening", async route => {
        const body = route.request().postDataJSON() as { action: string; messageIds: string[] };
        assert.equal(body.action, "skip");
        assert.equal(body.messageIds.length, 2);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          results: [
            { id: body.messageIds[0], status: "skipped", candidates: 0 },
            { id: body.messageIds[1], status: "failed", candidates: 0, error: "synthetic conflict" },
          ], processed: 2, failed: 1,
        }) });
      });
      await page.goto(options.base);
      await page.getByRole("button", { name: "客户开发", exact: true }).click();
      await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
      await page.getByRole("tab", { name: /私有学习候选/ }).click();
      const panel = page.getByRole("tabpanel");
      await panel.locator(".mailbox-row input[type=checkbox]").nth(0).check();
      await panel.locator(".mailbox-row input[type=checkbox]").nth(1).check();
      await panel.getByRole("button", { name: "跳过所选" }).click();
      await expect(panel.locator(".mailbox-batch-result")).toContainText("成功 1 封，失败 1 封");
      await panel.locator(".mailbox-batch-result summary").click();
      await expect(panel.locator(".mailbox-batch-result li")).toHaveCount(2);
      await expect(panel.locator(".mailbox-batch-result")).toContainText("synthetic conflict");
      await expect(panel.locator(".mailbox-row input[type=checkbox]").nth(0)).not.toBeChecked();
      await expect(panel.locator(".mailbox-row input[type=checkbox]").nth(1)).toBeChecked();
    } finally {
      await partialContext.close();
    }
    const reviewContext = await browser.newContext({ viewport: { width: 390, height: 760 } });
    await reviewContext.addCookies([{ name: partialCookieName, value: partialCookieValue, url: options.base }]);
    try {
      const page = await reviewContext.newPage();
      const reviewItems = Array.from({ length: 9 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        message_id: messageIds[index], kind: "customer-signal", title: `Synthetic candidate ${index + 1}`,
        content: `Synthetic content ${index + 1}`, excerpt: `Synthetic excerpt ${index + 1}`,
        contentHash: "a".repeat(64), created_at: "2026-10-15T00:00:00.000Z",
        confidence: null, rationale: null, model: "synthetic",
      }));
      await page.route("**/api/mailbox/status", async route => {
        const response = await route.fetch();
        const data = await response.json() as Record<string, unknown>;
        await route.fulfill({ response, json: { ...data, pendingCandidates: 9 } });
      });
      await page.route("**/api/mailbox/candidates?page=*", async route => {
        const selectedPage = Number(new URL(route.request().url()).searchParams.get("page"));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          candidates: selectedPage === 1 ? reviewItems.slice(0, 8) : reviewItems.slice(8),
        }) });
      });
      await page.route("**/api/mailbox/candidates/batch", async route => {
        const body = route.request().postDataJSON() as { items: Array<{ id: string }> };
        assert.equal(body.items.length, 2);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          results: [
            { id: body.items[0].id, result: "saved" },
            { id: body.items[1].id, result: "failed", error: "synthetic stale hash" },
          ], processed: 1, failed: 1,
        }) });
      });
      await page.goto(options.base);
      await page.getByRole("button", { name: "打开导航菜单" }).click();
      await page.getByRole("button", { name: "客户开发", exact: true }).click();
      await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
      await page.getByRole("tab", { name: /待审核内容/ }).click();
      const panel = page.getByRole("tabpanel");
      await expect(panel.locator(".mailbox-review-card")).toHaveCount(8);
      await panel.locator(".mailbox-review-card input[type=checkbox]").nth(0).check();
      await panel.locator(".mailbox-review-card input[type=checkbox]").nth(1).check();
      await panel.getByRole("button", { name: "下一页" }).click();
      await expect(panel.locator(".mailbox-review-card")).toHaveCount(1);
      await panel.locator(".mailbox-review-card input[type=checkbox]").first().check();
      await expect(panel.getByRole("button", { name: "批量拒绝（1）" })).toBeEnabled();
      await panel.getByRole("button", { name: "上一页" }).click();
      await expect(panel.locator(".mailbox-review-card input[type=checkbox]").nth(0)).toBeChecked();
      await expect(panel.locator(".mailbox-review-card input[type=checkbox]").nth(1)).toBeChecked();
      await expect(panel.getByRole("button", { name: "批量拒绝（2）" })).toBeEnabled();
      await panel.getByRole("button", { name: "批量拒绝（2）" }).click();
      await expect(panel.locator(".mailbox-batch-result")).toContainText("审核成功 1 条，失败 1 条");
      await panel.locator(".mailbox-batch-result summary").click();
      await expect(panel.locator(".mailbox-batch-result li")).toHaveCount(2);
      await expect(panel.locator(".mailbox-batch-result")).toContainText("synthetic stale hash");
      await expect(panel.locator(".mailbox-review-card input[type=checkbox]").nth(0)).not.toBeChecked();
      await expect(panel.locator(".mailbox-review-card input[type=checkbox]").nth(1)).toBeChecked();
      await expect(panel.getByRole("button", { name: "批量拒绝（1）" })).toBeEnabled();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await panel.locator(".mailbox-batch-result summary").click();
      await page.screenshot({ path: "tmp/ma24-g13-f07-review-partial-mobile.png", fullPage: true });
      await panel.getByRole("button", { name: "下一页" }).click();
      await expect(panel.locator(".mailbox-review-card input[type=checkbox]").first()).toBeChecked();
    } finally {
      await reviewContext.close();
    }
    return { candidatePage: true, syntheticMessages: 10, queuedLearningJobs: 10,
      gatewayCredential: "synthetic-unusable", workerStarted: false, modelCalls: 0, mailSends: 0,
      partialBatchUi: "HTTP responses intercepted for deterministic learning/review partial results; no skip or candidate-review write",
      candidateReviewSelectionAcrossPages: true, results };
  } finally {
    await browser.close();
  }
}
