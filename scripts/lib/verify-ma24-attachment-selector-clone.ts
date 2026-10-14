import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import { hashPassword } from "../../src/lib/auth/password";

export async function verifyMa24AttachmentSelectorClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const prefix = `MA24-F08-${randomUUID().slice(0, 8)}`;
  const collection = randomUUID();
  await options.admin.query(
    "insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic attachment selector','company')",
    [collection, prefix.toLowerCase()],
  );
  const titles: string[] = [];
  for (let index = 0; index < 13; index++) {
    const document = randomUUID();
    const title = `${prefix} ${String(index + 1).padStart(2, "0")}`;
    titles.push(title);
    await options.admin.query(
      `insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility,updated_at)
       values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private',now()-$6::int*interval '1 second')`,
      [document, collection, title, String(index).padStart(64, "a"), options.userId, index],
    );
    await options.admin.query(
      `insert into knowledge_asset(document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
       values($1,$2,$3,'application/pdf',0,'datasheet','synthetic')`,
      [document, `synthetic/${document}.pdf`, String(index).padStart(64, "b")],
    );
  }
  const first = await fetch(`${options.base}/api/knowledge/library?scope=private&offset=0&q=${prefix}`, { headers: { cookie: options.cookie } });
  assert.equal(first.status, 200);
  const firstPage = await first.json() as { items: Array<{ title: string; assetId: string }>; hasMore: boolean };
  assert.equal(firstPage.items.length, 12);
  assert(firstPage.hasMore);
  assert(firstPage.items.every(item => item.assetId && item.title.startsWith(prefix)));
  const second = await fetch(`${options.base}/api/knowledge/library?scope=private&offset=12&q=${prefix}`, { headers: { cookie: options.cookie } });
  assert.equal(second.status, 200);
  const secondPage = await second.json() as { items: Array<{ title: string; assetId: string }>; hasMore: boolean };
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.hasMore, false);
  const otherUser = randomUUID();
  const otherEmail = `${otherUser}@example.invalid`;
  const otherPassword = randomUUID();
  await options.admin.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic other account',$3,'member','active')",
    [otherUser, otherEmail, hashPassword(otherPassword)],
  );
  const otherLogin = await fetch(`${options.base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password: otherPassword }),
  });
  assert.equal(otherLogin.status, 200);
  const otherCookie = otherLogin.headers.get("set-cookie")?.split(";")[0];
  assert(otherCookie);
  const otherList = await fetch(`${options.base}/api/knowledge/library?scope=private&offset=0&q=${prefix}`, {
    headers: { cookie: otherCookie },
  });
  assert.equal(otherList.status, 200);
  assert.deepEqual((await otherList.json() as { items: unknown[] }).items, []);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "新对话", exact: true }).click();
        await page.locator(".ai-composer").getByRole("button", { name: /^资料/ }).click();
        const dialog = page.getByRole("dialog", { name: "本次任务资料" });
        await dialog.getByRole("textbox", { name: "搜索资料" }).fill(prefix);
        await dialog.getByRole("button", { name: "搜索", exact: true }).click();
        await expect(dialog.locator(".ai-attachment-list label")).toHaveCount(12);
        await dialog.locator(".ai-attachment-list label").filter({ hasText: titles[0] }).getByRole("checkbox").check();
        await dialog.getByRole("button", { name: "下一页资料" }).click();
        await expect(dialog.locator(".ai-attachment-list label")).toHaveCount(1);
        await dialog.locator(".ai-attachment-list label").filter({ hasText: titles[12] }).getByRole("checkbox").check();
        await expect(dialog.getByRole("region", { name: "已选资料" })).toContainText(titles[0]);
        await expect(dialog.getByRole("region", { name: "已选资料" })).toContainText(titles[12]);
        await dialog.getByRole("button", { name: `移除 ${titles[0]}` }).click();
        await expect(dialog.getByRole("region", { name: "已选资料" })).not.toContainText(titles[0]);
        await page.keyboard.press("Escape");
        await page.locator(".ai-composer").getByRole("button", { name: /^资料/ }).click();
        await expect(page.getByRole("dialog", { name: "本次任务资料" }).getByRole("region", { name: "已选资料" })).toContainText(titles[12]);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    return { candidatePage: true, privateAssets: 13, realLibraryApi: true, pageSizes: [12, 1],
      crossPageSelection: true, selectedNamePersists: true, removal: true, otherAccountExcluded: true,
      viewports: ["390x760", "1366x900"], noHorizontalOverflow: true, pageErrors: 0,
      modelCalls: 0, uploads: 0, taskSubmissions: 0 };
  } finally { await browser.close(); }
}
