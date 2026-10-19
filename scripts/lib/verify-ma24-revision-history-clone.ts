import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import {ma24BrowserContext,ma24FixtureFetch} from './ma24-browser-context';

export async function verifyMa24RevisionHistoryClone(options: {
  admin: Client; base: string; cookie: string; userId: string;allowSelfSignedLoopback?:boolean;
}): Promise<unknown> {
  const fetch=(input:string,init?:RequestInit)=>ma24FixtureFetch(options,input,init);
  const collection = randomUUID();
  const documentId = randomUUID();
  const title = `MA24 F10 synthetic history ${documentId.slice(0, 8)}`;
  await options.admin.query(
    "insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic history','company')",
    [collection, `ma24-f10-${documentId.slice(0, 8)}`],
  );
  await options.admin.query(
    `insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
     values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private')`,
    [documentId, collection, title, "f".repeat(64), options.userId],
  );
  for (let index = 1; index <= 11; index++) {
    await options.admin.query(
      `insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,created_at,reconstructed)
       values($1,$2,$3,$4,$5,now()-$6::int*interval '1 day',$7)`,
      [documentId, options.userId, String(index).padStart(64, "a"), `Synthetic version ${String(index).padStart(2, "0")}`,
        `Synthetic historical body ${index}`, 11 - index, index === 1],
    );
  }
  const history = (offset: number) => `${options.base}/api/knowledge/library/history?document=${documentId}&offset=${offset}`;
  const first = await fetch(history(0), { headers: { cookie: options.cookie } });
  assert.equal(first.status, 200);
  const firstPage = await first.json() as { items: Array<{ title: string }>; hasMore: boolean };
  assert.equal(firstPage.items.length, 10);
  assert.equal(firstPage.items[0].title, "Synthetic version 11");
  assert(firstPage.hasMore);
  const second = await fetch(history(10), { headers: { cookie: options.cookie } });
  assert.equal(second.status, 200);
  const secondPage = await second.json() as { items: Array<{ title: string; reconstructed: boolean }>; hasMore: boolean };
  assert.deepEqual(secondPage.items.map(item => item.title), ["Synthetic version 01"]);
  assert(secondPage.items[0].reconstructed);
  assert.equal(secondPage.hasMore, false);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await ma24BrowserContext(browser,options,{ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "知识库", exact: true }).click();
        await page.getByRole("textbox", { name: "搜索资料" }).fill(title);
        await page.getByRole("button", { name: "搜索", exact: true }).click();
        await page.locator(".library-title").filter({ hasText: title }).click();
        const reader = page.locator(".library-reader");
        await reader.getByText("历史内容版本", { exact: true }).click();
        await expect(reader.getByText("Synthetic version 11", { exact: false })).toBeVisible();
        await expect(reader.getByText("Synthetic version 02", { exact: false })).toBeVisible();
        await expect(reader.getByText("Synthetic version 01", { exact: false })).toHaveCount(0);
        await page.route(`**/api/knowledge/library/history?document=${documentId}&offset=10`, route =>
          route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic read interruption" }) }),
        { times: 1 });
        await reader.getByRole("button", { name: "下一页版本" }).click();
        await expect(reader.getByRole("alert")).toContainText("版本读取失败");
        await expect(reader.getByText("Synthetic version 11", { exact: false })).toHaveCount(0);
        await expect(reader.getByText("第 2 页", { exact: true })).toBeVisible();
        await reader.getByRole("button", { name: "重试", exact: true }).click();
        await expect(reader.getByText("Synthetic version 01", { exact: false })).toBeVisible();
        await expect(reader.getByRole("alert")).toHaveCount(0);
        await reader.getByText("Synthetic version 01", { exact: false }).click();
        await expect(reader).toContainText("旧版本由历史检索片段重建");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    return { candidatePage: true, actualHistoryApi: true, privateRevisions: 11, pageSizes: [10, 1],
      injectedOneShot503: true, stalePageHidden: true, retrySameOffset: true, reconstructedDisclosure: true,
      viewports: ["390x760", "1366x900"], noHorizontalOverflow: true, pageErrors: 0,
      modelCalls: 0, productionWrites: 0 };
  } finally { await browser.close(); }
}
