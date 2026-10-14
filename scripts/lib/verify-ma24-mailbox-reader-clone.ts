import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import { encryptMailboxContent } from "../../src/lib/mailbox/crypto";

export async function verifyMa24MailboxReaderClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const connection = await options.admin.query<{ id: string }>(
    `insert into mailbox_connection(user_id,provider,email,display_name,credential_ciphertext,host,status)
     values($1,'alimail-imap','ma24-reader@example.invalid','Synthetic reader','synthetic-unusable','invalid.example','active') returning id`,
    [options.userId],
  );
  const subject = "Synthetic long mail";
  const body = Array.from({ length: 80 }, (_, index) =>
    `Line ${index + 1}: synthetic mailbox content for reading area and scroll verification.`).join("\n");
  const digest = createHash("sha256").update(body).digest("hex");
  const sealed = encryptMailboxContent(options.userId, { subject, bodyText: body, sender: [], recipients: [] });
  await options.admin.query(
    `insert into mailbox_message(user_id,connection_id,folder_path,uid_validity,message_uid,
      internet_message_id,direction,subject,body_text,content_sha256,content_ciphertext,screening_bucket,screened_at)
     values($1,$2,'INBOX','ma24-reader',1,'<ma24-reader@example.invalid>','inbound','', '',$3,$4,'review',now())`,
    [options.userId, connection.rows[0].id, digest, sealed],
  );
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    await mkdir("tmp/ma24-mailbox-reader-clone", { recursive: true });
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 760 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      let failList = true;
      let failDetail = true;
      let listRequests = 0;
      let detailRequests = 0;
      await page.route("**/api/mailbox/messages**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/mailbox/messages") {
          listRequests++;
          if (failList) {
            failList = false;
            await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"synthetic-list-failure"}' });
          } else await route.continue();
        } else {
          detailRequests++;
          if (failDetail) {
            failDetail = false;
            await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"synthetic-detail-failure"}' });
          } else await route.continue();
        }
      });
      try {
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "客户开发", exact: true }).click();
        await page.getByRole("navigation", { name: "客户开发页签" }).getByRole("button", { name: "邮箱" }).click();
        const listAlert = page.locator(".mail-reader aside").getByRole("alert");
        await expect(listAlert).toContainText("邮件列表读取失败");
        await expect(page.getByText("没有已同步邮件", { exact: false })).toHaveCount(0);
        await listAlert.getByRole("button", { name: "重试邮件列表" }).click();
        const item = page.locator(".mail-reader-list > button").first();
        await expect(item).toContainText(subject);
        await item.click();
        const reader = page.getByRole("region", { name: "邮件阅读区" });
        const detailAlert = reader.getByRole("alert");
        await expect(detailAlert).toContainText("邮件原文读取失败");
        await expect(reader.getByText("正在读取原文…")).toHaveCount(0);
        await detailAlert.getByRole("button", { name: "重试邮件原文" }).click();
        await expect(reader.locator("pre")).toContainText("Line 80: synthetic mailbox content");
        await expect(detailAlert).toHaveCount(0);
        if (viewport.width >= 700) {
          failDetail = true;
          await page.getByRole("button", { name: "刷新", exact: true }).click();
          await expect(detailAlert).toContainText("邮件原文读取失败");
          await expect(reader.locator("pre")).toHaveCount(0);
          await detailAlert.getByRole("button", { name: "重试邮件原文" }).click();
          await expect(reader.locator("pre")).toContainText("Line 80: synthetic mailbox content");
        }
        const scroll = await reader.evaluate(element => ({ content: element.scrollHeight, viewport: element.clientHeight }));
        assert(scroll.content > scroll.viewport + 1, "Long mail did not overflow the reading area");
        await reader.evaluate(element => element.scrollTop = 0);
        const bounds = await reader.boundingBox();
        assert(bounds);
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(80, bounds.height / 2));
        await page.mouse.wheel(0, 900);
        await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        failDetail = true;
        await page.getByRole("tab", { name: /私有学习候选/ }).click();
        const row = page.getByRole("tabpanel").locator(".mailbox-row").first();
        await row.locator("summary", { hasText: "查看邮件原文" }).click();
        const inlineAlert = row.getByRole("alert");
        await expect(inlineAlert).toContainText("synthetic-detail-failure");
        await inlineAlert.getByRole("button", { name: "重试" }).click();
        await expect(row.locator(".mailbox-message-content pre")).toContainText("Line 80: synthetic mailbox content");
        await expect(inlineAlert).toHaveCount(0);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `tmp/ma24-mailbox-reader-clone/${viewport.width}x${viewport.height}.png` });
        results.push({ viewport, listRequests, detailRequests, listRetry: true, detailRetry: true,
          inlineOriginalRetry: true, refreshFailureClearsStaleBody: viewport.width >= 700,
          longBodyInternalScroll: true, noHorizontalOverflow: true, pageErrors: 0 });
      } finally {
        await context.close();
      }
    }
    return { candidatePage: true, syntheticEncryptedMessages: 1, modelCalls: 0, mailSends: 0, results };
  } finally {
    await browser.close();
  }
}
