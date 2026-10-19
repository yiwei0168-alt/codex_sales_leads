import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import {ma24BrowserContext} from './ma24-browser-context';

export async function verifyMa24MailboxDrawerClone(options: {
  admin: Client; base: string; cookie: string; userId: string; allowSelfSignedLoopback?:boolean;
}): Promise<unknown> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  try {
    await mkdir("tmp/ma24-mailbox-drawer-clone", { recursive: true });
    for (const scenario of ["empty", "four-connected"] as const) {
    if (scenario === "four-connected") {
      for (let index = 1; index <= 4; index++) await options.admin.query(
        `insert into mailbox_connection(user_id,provider,email,display_name,credential_ciphertext,host,status)
         values($1,'alimail-imap',$2,$3,'synthetic-unusable','invalid.example','active')`,
        [options.userId, `ma24-mailbox-${index}@example.invalid`, `邮箱 ${index}`],
      );
    }
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1366, height: 360 }, { width: 390, height: 760 }]) {
      const context = await ma24BrowserContext(browser,options,{ viewport });
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
        const trigger = page.getByRole("button", { name: "管理 / 连接邮箱" });
        await expect(trigger).toBeVisible({ timeout: 15_000 });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "管理 / 连接邮箱" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button", { name: "关闭窗口" })).toBeFocused();
        if (scenario === "empty") await expect(dialog.getByText("尚未连接邮箱。")).toBeVisible();
        else {
          await expect(dialog.getByRole("textbox", { name: "名称" })).toHaveCount(4);
          await expect(dialog.getByRole("textbox", { name: "名称" }).last()).toHaveValue("邮箱 4");
          const account = dialog.locator(".mailbox-managed-account").first();
          await expect(account.getByRole("button", { name: "保存设置" })).toBeVisible();
          await expect(account.getByRole("button", { name: "同步", exact: true })).toBeVisible();
          await expect(account.getByRole("button", { name: "断开", exact: true })).toHaveCount(0);
          await account.getByText("连接与数据管理", { exact: true }).click();
          await expect(account.getByRole("button", { name: "断开", exact: true })).toBeVisible();
          await expect(account.getByRole("button", { name: "删除本地数据" })).toBeVisible();
          page.once("dialog", confirmation => confirmation.dismiss());
          await account.getByRole("button", { name: "断开", exact: true }).click();
          page.once("dialog", confirmation => confirmation.dismiss());
          await account.getByRole("button", { name: "删除本地数据" }).click();
          assert.equal((await options.admin.query("select count(*)::int as n from mailbox_connection where user_id=$1 and status='active'", [options.userId])).rows[0].n, 4);
        }
        assert.equal(await dialog.evaluate(element => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
        const bounds = await dialog.boundingBox();
        assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1
          && bounds.y + bounds.height <= viewport.height + 1);
        if (viewport.width < 700) assert.equal(bounds.width, viewport.width);
        await dialog.getByText("添加邮箱", { exact: true }).click();
        const email = dialog.getByRole("textbox", { name: "邮箱地址" });
        await email.fill("unsaved@example.invalid");
        const body = dialog.locator(".workspace-dialog-body");
        const scrollDimensions = await body.evaluate(element => ({ content: element.scrollHeight, viewport: element.clientHeight }));
        const scrollAvailable = scrollDimensions.content > scrollDimensions.viewport + 1;
        if (viewport.height < 900 || scenario === "four-connected")
          assert(scrollAvailable, `Drawer lacks overflow at ${scenario} ${viewport.width}x${viewport.height}`);
        if (scrollAvailable) {
          await body.evaluate(element => element.scrollTop = 0);
          const scrollArea = await body.boundingBox();
          assert(scrollArea);
          await page.mouse.move(scrollArea.x + scrollArea.width / 2, scrollArea.y + Math.min(60, scrollArea.height / 2));
          await page.mouse.wheel(0, 900);
          await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `tmp/ma24-mailbox-drawer-clone/${scenario}-${viewport.width}x${viewport.height}.png` });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        const reopened = page.getByRole("dialog", { name: "管理 / 连接邮箱" });
        await reopened.getByText("添加邮箱", { exact: true }).click();
        await expect(reopened.getByRole("textbox", { name: "邮箱地址" }))
          .toHaveValue("unsaved@example.invalid");
        assert.deepEqual(errors, []);
        results.push({ scenario, viewport, opaque: true, withinViewport: true, scrollAvailable, internalWheelScroll: scrollAvailable,
          escapeAndFocusReturn: true, unsavedDraftPreserved: true, noHorizontalOverflow: true });
      } finally {
        await context.close();
      }
    }
    }
    assert.equal((await options.admin.query("select count(*)::int as n from mailbox_sync_run where user_id=$1", [options.userId])).rows[0].n, 0);
    return { candidatePage: true, syntheticAccountOnly: true, syntheticConnectionFixtures: 4,
      syncRuns: 0, modelCalls: 0, results };
  } finally {
    await browser.close();
  }
}
