import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function verifyMa24RawJsonClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const collection = randomUUID();
  const documentId = randomUUID();
  const assetId = randomUUID();
  const versionId = randomUUID();
  const title = `MA24 F12 synthetic coordinates ${documentId.slice(0, 8)}`;
  const sourceSha = "a".repeat(64);
  const longValue = "SYNTHETIC".repeat(180);
  const location = { unitType: "page", unitIndex: 1, blockId: "block-1", diagnosticKey: longValue };
  const content = "Synthetic evidence body for raw coordinate display.";
  await options.admin.query(
    "insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic coordinate display','company')",
    [collection, `ma24-f12-${documentId.slice(0, 8)}`],
  );
  await options.admin.query(
    `insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
     values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private')`,
    [documentId, collection, title, sourceSha, options.userId],
  );
  await options.admin.query(
    `insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
     values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')`,
    [assetId, documentId, `synthetic/${assetId}.pdf`, sourceSha],
  );
  await options.admin.query(
    `insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at)
     values($1,$2,$3,$4,'synthetic-v1',$5,'ready',now())`,
    [versionId, documentId, assetId, sourceSha, digest(content)],
  );
  const unit = (await options.admin.query<{ id: string }>(
    `insert into knowledge_tree_node(version_id,ordinal,node_kind,title,unit_type,unit_index,source_location)
     values($1,0,'unit','Page 1','page',1,$2) returning id`,
    [versionId, JSON.stringify({ unitType: "page", unitIndex: 1 })],
  )).rows[0].id;
  await options.admin.query(
    `insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256)
     values($1,$2,0,'evidence','Synthetic block','page',1,$3,$4,$5)`,
    [versionId, unit, JSON.stringify(location), content, digest(content)],
  );
  await options.admin.query("update knowledge_document set current_tree_version_id=$2 where id=$1", [documentId, versionId]);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.base });
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
        const tree = page.getByRole("region", { name: "原文坐标" });
        await tree.getByRole("button", { name: /Page 1/ }).click();
        await tree.getByRole("button", { name: /Synthetic block/ }).click();
        await expect(tree).toContainText(content);
        await tree.getByText("完整来源坐标", { exact: true }).click();
        const details = tree.locator(".raw-json-details");
        await expect(details.locator("pre")).toContainText(longValue);
        assert(await details.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await details.getByRole("button", { name: "复制 JSON" }).click();
        await expect(details.getByRole("status")).toContainText("已复制原始 JSON");
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), location);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    return { candidatePage: true, syntheticTreeRead: true, longCoordinateCharacters: longValue.length,
      rawJsonSecondary: true, wrappedWithoutHorizontalOverflow: true, copiedExactJson: true,
      viewports: ["390x760", "1366x900"], pageErrors: 0, modelCalls: 0, productionWrites: 0 };
  } finally { await browser.close(); }
}
