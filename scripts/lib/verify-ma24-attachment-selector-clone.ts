import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import { hashPassword } from "../../src/lib/auth/password";
import {ma24BrowserContext,ma24FixtureFetch} from './ma24-browser-context';

export async function verifyMa24AttachmentSelectorClone(options: {
  admin: Client; base: string; cookie: string; userId: string;allowSelfSignedLoopback?:boolean;
}): Promise<unknown> {
  const fetch=(input:string,init?:RequestInit)=>ma24FixtureFetch(options,input,init);
  const prefix = `MA24-F08-${randomUUID().slice(0, 8)}`;
  const collection = randomUUID();
  await options.admin.query(
    "insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic attachment selector','company')",
    [collection, prefix.toLowerCase()],
  );
  const titles: string[] = [];
  for (let index = 0; index < 13; index++) {
    const document = randomUUID();
    const asset=randomUUID(),version=randomUUID(),unit=randomUUID();
    const content=`Generated processed attachment block ${index}`,sourceSha=createHash('sha256').update(`Generated attachment source ${index}`).digest('hex');
    const contentSha=createHash('sha256').update(content).digest('hex');
    const title = `${prefix} ${String(index + 1).padStart(2, "0")}${index === 12 ? ` ${"LongSourceCoordinate".repeat(45)}` : ""}`;
    titles.push(title);
    await options.admin.query(
      `insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility,updated_at)
       values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private',now()-$6::int*interval '1 second')`,
      [document, collection, title, contentSha, options.userId, index],
    );
    await options.admin.query(
      `insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
       values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')`,
      [asset,document, `synthetic/${document}.pdf`, sourceSha],
    );
    await options.admin.query("insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at) values($1,$2,$3,$4,'synthetic-f08-v1',$5,'ready',now())",[version,document,asset,sourceSha,contentSha]);
    await options.admin.query("insert into knowledge_tree_node(id,version_id,ordinal,node_kind,title,unit_type,unit_index,source_location) values($1,$2,0,'unit','Generated page','page',1,$3)",[unit,version,JSON.stringify({unitType:'page',unitIndex:1})]);
    await options.admin.query("insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256) values($1,$2,0,'evidence','Generated processed block','page',1,$3,$4,$5)",[version,unit,JSON.stringify({unitType:'page',unitIndex:1}),content,contentSha]);
    await options.admin.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[document,version]);
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

  const forbiddenTask = await fetch(`${options.base}/api/assistant/messages`, {
    method: "POST", headers: { cookie: otherCookie, "content-type": "application/json" },
    body: JSON.stringify({ content: "Synthetic inaccessible attachment reference", requestKey: randomUUID(),
      attachments: [{ assetId: secondPage.items[0].assetId }] }),
  });
  assert.equal(forbiddenTask.status, 409);
  assert.equal((await options.admin.query("select count(*)::int as total from agent_run where user_id=$1", [otherUser])).rows[0].total, 0);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots:string[]=[];
  try {
    let submittedRunId = "";
    for (const viewport of [{ width: 390, height: 560 }, { width: 1366, height: 620 }]) {
      const context = await ma24BrowserContext(browser,options,{ viewport });
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
        await expect(dialog.locator(".ai-attachment-list label").filter({ hasText: titles[12] })).toBeVisible();
        await dialog.locator(".ai-attachment-list label").filter({ hasText: titles[12] }).getByRole("checkbox").check();
        await expect(dialog.getByRole("region", { name: "已选资料" })).toContainText(titles[0]);
        await expect(dialog.getByRole("region", { name: "已选资料" })).toContainText(titles[12]);
        await dialog.getByRole("button", { name: `移除 ${titles[0]}` }).click();
        await expect(dialog.getByRole("region", { name: "已选资料" })).not.toContainText(titles[0]);
        await page.keyboard.press("Escape");
        await page.locator(".ai-composer").getByRole("button", { name: /^资料/ }).click();
        await expect(page.getByRole("dialog", { name: "本次任务资料" }).getByRole("region", { name: "已选资料" })).toContainText(titles[12]);
        const layout = await page.getByRole("dialog", { name: "本次任务资料" }).evaluate(element => {
          const body = element.querySelector<HTMLElement>(".workspace-dialog-body");
          const selected = element.querySelector<HTMLElement>(".ai-attachment-selected");
          const close = element.querySelector<HTMLElement>(".workspace-dialog-head button");
          if (!body || !selected || !close) throw new Error("Attachment dialog structure missing");
          return {
            dialogWidth: element.scrollWidth,
            bodyWidth: body.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            bodyScrollHeight: body.scrollHeight,
            bodyHeight: body.clientHeight,
            closeVisible: close.getBoundingClientRect().bottom <= innerHeight,
            selectedVisibleAfterScroll: (() => { selected.scrollIntoView(); return selected.getBoundingClientRect().top < innerHeight; })(),
          };
        });
        assert(layout.bodyScrollWidth <= layout.bodyWidth + 1, `Attachment body overflows horizontally: ${JSON.stringify(layout)}`);
        assert(layout.closeVisible && layout.selectedVisibleAfterScroll, `Attachment controls are unreachable: ${JSON.stringify(layout)}`);
        assert(layout.bodyScrollHeight > layout.bodyHeight, `Expected short viewport to scroll: ${JSON.stringify(layout)}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        const screenshot=`tmp/ma24-ready-attachment-selector-${viewport.width}-${randomUUID()}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);
        if (viewport.width > 700) {
          await page.keyboard.press("Escape");
          await page.locator(".ai-composer textarea").fill("Synthetic F08 attachment reference acceptance");
          const taskResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/assistant/messages") && response.request().method() === "POST");
          await page.locator(".ai-composer").getByRole("button", { name: "发送" }).click();
          const taskResponse = await taskResponsePromise;
          assert.equal(taskResponse.status(), 202);
          const taskRequest = taskResponse.request().postDataJSON() as { attachments: Array<{ assetId: string }> };
          assert.deepEqual(taskRequest.attachments, [{ assetId: secondPage.items[0].assetId }]);
          const task = await taskResponse.json() as { run: { id: string; status: string } };
          submittedRunId = task.run.id;
          assert.equal(task.run.status, "queued");
          const persisted = (await options.admin.query<{ user_id: string; status: string; input: { attachments: Array<{ assetId: string }> } }>(
            "select user_id,status,input from agent_run where id=$1", [submittedRunId],
          )).rows[0];
          assert.equal(persisted.user_id, options.userId);
          assert.equal(persisted.status, "queued");
          assert.deepEqual(persisted.input.attachments, [{ assetId: secondPage.items[0].assetId }]);
        }
      } finally { await context.close(); }
    }
    assert(submittedRunId);
    return { candidatePage: true, privateAssets: 13, syntheticReadyCurrentTreeMetadata:true, realLibraryApi: true, pageSizes: [12, 1],
      crossPageSelection: true, selectedNamePersists: true, removal: true, otherAccountExcluded: true,
      viewports: ["390x560", "1366x620"], longTitleCharacters: titles[12].length,
      shortViewportScroll: true, noHorizontalOverflow: true, pageErrors: 0,
      ownerTaskQueuedWithExactSelectedAsset: true, otherAccountTaskRejected: true,
      screenshots,modelCalls: 0, uploads: 0, taskSubmissions: 1 };
  } finally { await browser.close(); }
}
