import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";
import {ma24BrowserContext,ma24FixtureFetch} from './ma24-browser-context';
import { encryptMailboxContent } from "../../src/lib/mailbox/crypto";

export async function verifyMa24MailboxReaderClone(options: {
  admin: Client; base: string; cookie: string; userId: string; allowSelfSignedLoopback?:boolean;
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
  const shortSubject = "Synthetic short mail";
  const shortBody = "Short synthetic original.";
  await options.admin.query(
    `insert into mailbox_message(user_id,connection_id,folder_path,uid_validity,message_uid,
      internet_message_id,direction,subject,body_text,content_sha256,content_ciphertext,screening_bucket,screened_at)
     values($1,$2,'INBOX','ma24-reader',2,'<ma24-reader-short@example.invalid>','inbound','', '',$3,$4,'review',now())`,
    [options.userId, connection.rows[0].id, createHash("sha256").update(shortBody).digest("hex"),
      encryptMailboxContent(options.userId,
        { subject: shortSubject, bodyText: shortBody, sender: [], recipients: [] })],
  );
  const sentSubject="Synthetic sent mail",sentBody="Synthetic sent original.";
  await options.admin.query(
    `insert into mailbox_message(user_id,connection_id,folder_path,uid_validity,message_uid,
      internet_message_id,direction,subject,body_text,content_sha256,content_ciphertext,screening_bucket,screened_at)
     values($1,$2,'Sent','ma24-reader',3,'<ma24-reader-sent@example.invalid>','outbound','', '',$3,$4,'review',now())`,
    [options.userId,connection.rows[0].id,createHash('sha256').update(sentBody).digest('hex'),
      encryptMailboxContent(options.userId,{subject:sentSubject,bodyText:sentBody,sender:[],recipients:[]})],
  );
  const associationName='Synthetic reader association company';
  const companyResponse=await ma24FixtureFetch(options,`${options.base}/api/workspaces/current/companies`,{method:'POST',headers:{cookie:options.cookie,'content-type':'application/json'},body:JSON.stringify({name:associationName,country:'DE',website:'https://reader-association.example.invalid'})});
  assert.equal(companyResponse.status,200);const company=await companyResponse.json() as {externalId:string};assert(company.externalId);
  const longId=(await options.admin.query('select id from mailbox_message where user_id=$1 and connection_id=$2 and message_uid=1',[options.userId,connection.rows[0].id])).rows[0].id;
  const associated=await ma24FixtureFetch(options,`${options.base}/api/mailbox/messages/${longId}`,{method:'PATCH',headers:{cookie:options.cookie,'content-type':'application/json'},body:JSON.stringify({companyId:company.externalId,confirmed:true})});assert.equal(associated.status,200);
  const observed=await ma24FixtureFetch(options,`${options.base}/api/mailbox/messages/${longId}`,{headers:{cookie:options.cookie}});assert.equal(observed.status,200);const linked=await observed.json() as {companyLink:{companyId:string;companyName:string}};assert.equal(linked.companyLink.companyName,associationName);assert.notEqual(linked.companyLink.companyId,company.externalId,'Company identity and market candidate are distinct existing contracts');
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Array<Record<string, unknown>> = [];
  const associationScreenshots:string[]=[];
  const unavailableScreenshots:string[]=[];
  try {
    await mkdir("tmp/ma24-mailbox-reader-clone", { recursive: true });
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1366, height: 360 }, { width: 390, height: 760 }]) {
      const context = await ma24BrowserContext(browser,options,{ viewport });
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
      let associationWrites=0;
      let localDeletes=0;
      let releaseAssociationAck:(()=>void)|undefined;
      page.on('request',request=>{if(request.method()==='PATCH'&&new URL(request.url()).pathname.startsWith('/api/mailbox/messages/'))associationWrites++;});
      page.on('request',request=>{if(request.method()==='DELETE'&&new URL(request.url()).pathname.startsWith('/api/mailbox/messages/'))localDeletes++;});
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
        const item = page.locator(".mail-reader-list > button").filter({ hasText: subject });
        await expect(item).toContainText(subject);
        await item.click();
        const reader = page.getByRole("region", { name: "邮件阅读区" });
        const detailAlert = reader.getByRole("alert");
        await expect(detailAlert).toContainText("邮件原文读取失败");
        await expect(reader.getByText("正在读取原文…")).toHaveCount(0);
        await detailAlert.getByRole("button", { name: "重试邮件原文" }).click();
        await expect(reader.locator("pre")).toContainText("Line 80: synthetic mailbox content");
        await expect(detailAlert).toHaveCount(0);
        if(viewport.width>=700){
          const previousReads=detailRequests;await item.click();
          await expect(reader.locator('pre')).toContainText('Line 80: synthetic mailbox content');
          assert.equal(detailRequests,previousReads+1);
        }
        if (viewport.width >= 700) {
          failDetail = true;
          await page.getByRole("button", { name: "刷新", exact: true }).click();
          await expect(detailAlert).toContainText("邮件原文读取失败");
          await expect(reader.locator("pre")).toHaveCount(0);
          await detailAlert.getByRole("button", { name: "重试邮件原文" }).click();
          await expect(reader.locator("pre")).toContainText("Line 80: synthetic mailbox content");
        }
        await page.getByRole('tab',{name:'已发送',exact:true}).click();
        await page.locator('.mail-reader-list > button').filter({hasText:sentSubject}).click();
        await expect(reader.getByRole('heading',{name:sentSubject,exact:true})).toBeVisible();
        await expect(reader.locator('pre')).toHaveText(sentBody);
        await page.getByRole('tab',{name:'收件箱',exact:true}).click();await item.click();
        await expect(reader.locator('pre')).toContainText('Line 80: synthetic mailbox content');
        const scroll = await reader.evaluate(element => ({ content: element.scrollHeight, viewport: element.clientHeight }));
        if (viewport.height < 500) {
          const shell = page.locator(".main-shell");
          const outer = await shell.evaluate(element => ({ content: element.scrollHeight, viewport: element.clientHeight }));
          assert(outer.content > outer.viewport + 1, "Short viewport lacks a scrollable reading path");
          await shell.evaluate(element => element.scrollTop = 0);
          await page.mouse.move(viewport.width / 2, viewport.height / 2);
          await page.mouse.wheel(0, 900);
          await expect.poll(() => shell.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        } else {
          assert(scroll.content > scroll.viewport + 1, "Long mail did not overflow the reading area");
          await reader.evaluate(element => element.scrollTop = 0);
          const bounds = await reader.boundingBox();
          assert(bounds);
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(80, bounds.height / 2));
          await page.mouse.wheel(0, 900);
          await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        }
        failDetail = true;
        await page.getByRole("tab", { name: /私有学习候选/ }).click();
        const row = page.getByRole("tabpanel").locator(".mailbox-row").filter({ hasText: subject });
        if (viewport.height < 500) {
          await page.screenshot({ path: `tmp/ma24-mailbox-reader-clone/${viewport.width}x${viewport.height}-before-open.png` });
          assert(await page.locator(".mailbox-scroll-list").first().evaluate(element => element.clientHeight) > 120);
        }
        await row.locator("summary", { hasText: "查看邮件原文" }).click();
        const inlineAlert = row.getByRole("alert");
        await expect(inlineAlert).toContainText("synthetic-detail-failure");
        await inlineAlert.getByRole("button", { name: "重试" }).click();
        const drawer = page.getByRole("dialog", { name: "邮件原文" });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole("button", { name: "关闭窗口" })).toBeFocused();
        await expect(drawer.locator("pre")).toContainText("Line 80: synthetic mailbox content");
        await expect(drawer).toContainText(associationName);
        const association=drawer.locator('p').filter({hasText:/^关联公司：/});
        await drawer.getByText('修改公司关联',{exact:true}).click();
        const companySelect=drawer.getByRole('combobox',{name:'关联候选公司'});
        await expect(companySelect).toBeEnabled();await expect(drawer.getByRole('button',{name:'确认保存',exact:true})).toBeDisabled();
        assert.equal(associationWrites,0);
        if(viewport.width===1366&&viewport.height===900){
          await page.route(`**/api/mailbox/messages/${longId}`,async route=>{
            if(route.request().method()!=='PATCH')return route.continue();
            const response=await route.fetch();assert.equal(response.status(),200);
            await new Promise<void>(done=>{releaseAssociationAck=done;});await route.fulfill({response});
          },{times:1});
        }
        await companySelect.selectOption('');await drawer.getByRole('button',{name:'确认保存',exact:true}).click();
        if(viewport.width===1366&&viewport.height===900){
          await expect.poll(()=>Boolean(releaseAssociationAck)).toBe(true);assert.equal(associationWrites,1);
          const persisted=(await options.admin.query('select company_id,source from mailbox_message_company where user_id=$1 and message_id=$2',[options.userId,longId])).rows[0];assert.deepEqual(persisted,{company_id:null,source:'user-rejected'});
          await drawer.getByRole('button',{name:'关闭窗口'}).click();await expect(drawer).toHaveCount(0);
          await row.getByRole('button',{name:'打开阅读面板'}).click();await expect(drawer).toBeVisible();
          await expect(drawer.getByRole('status')).toContainText('正在保存关联');
          await drawer.getByText('修改公司关联',{exact:true}).click();await expect(drawer.getByRole('button',{name:'确认保存',exact:true})).toBeDisabled();
          assert.equal(associationWrites,1);releaseAssociationAck!();releaseAssociationAck=undefined;
        }
        await expect(association).toContainText('人工选择不关联');
        await companySelect.selectOption(company.externalId);await drawer.getByRole('button',{name:'确认保存',exact:true}).click();
        await expect(association).toContainText(associationName);await expect(association).toContainText('人工关联');
        assert.equal(associationWrites,2);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const associationShot=`tmp/ma24-mail-company-link-${viewport.width}x${viewport.height}-${longId.slice(0,8)}.png`;await page.screenshot({path:associationShot,fullPage:true});associationScreenshots.push(associationShot);
        await expect(row.locator(".mailbox-message-content pre")).toHaveCount(0);
        await expect(inlineAlert).toHaveCount(0);
        const drawerBounds = await drawer.boundingBox();
        assert(drawerBounds && drawerBounds.x >= 0 && drawerBounds.y >= 0
          && drawerBounds.x + drawerBounds.width <= viewport.width + 1
          && drawerBounds.y + drawerBounds.height <= viewport.height + 1);
        assert.equal(await drawer.evaluate(element => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
        const drawerBody = drawer.locator(".workspace-dialog-body");
        const drawerScroll = await drawerBody.evaluate(element => ({ content: element.scrollHeight, viewport: element.clientHeight }));
        assert(drawerScroll.content > drawerScroll.viewport + 1);
        await drawerBody.evaluate(element => element.scrollTop = 0);
        const drawerBodyBounds = await drawerBody.boundingBox();
        assert(drawerBodyBounds);
        await page.mouse.move(drawerBodyBounds.x + drawerBodyBounds.width / 2, drawerBodyBounds.y + Math.min(80, drawerBodyBounds.height / 2));
        await page.mouse.wheel(0, 900);
        await expect.poll(() => drawerBody.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await page.screenshot({ path: `tmp/ma24-mailbox-reader-clone/${viewport.width}x${viewport.height}-drawer.png` });
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        const reopen = row.getByRole("button", { name: "打开阅读面板" });
        await expect(reopen).toBeFocused();
        await reopen.click();
        await expect(drawer).toBeVisible();
        await expect(drawer.locator('p').filter({hasText:/^关联公司：/})).toContainText(associationName);
        assert.equal((await options.admin.query('select count(*)::int n from mailbox_message where user_id=$1 and id=$2',[options.userId,longId])).rows[0].n,1);
        await page.route(`**/api/mailbox/messages/${longId}`,route=>route.fulfill({status:404,json:{error:'synthetic-original-unavailable'}}),{times:1});
        await drawer.getByRole('button',{name:'读取当前关联',exact:true}).click();
        await expect(drawer).toHaveCount(0);await expect(row.getByRole('alert')).toContainText('原邮件当前不可读取');
        await expect(row.locator('.mailbox-message-content pre')).toHaveCount(0);await expect(row.getByRole('button',{name:'打开阅读面板'})).toHaveCount(0);
        await expect(row).not.toContainText('本地邮件已删除');assert.equal(localDeletes,0);assert.equal(associationWrites,2);
        assert.equal((await options.admin.query('select count(*)::int n from mailbox_message where user_id=$1 and id=$2',[options.userId,longId])).rows[0].n,1);
        const unavailableShot=`tmp/ma24-mail-original-unavailable-${viewport.width}x${viewport.height}-${longId.slice(0,8)}.png`;await row.screenshot({path:unavailableShot});unavailableScreenshots.push(unavailableShot);
        await row.getByRole('button',{name:'重试',exact:true}).click();await expect(drawer).toBeVisible();await expect(drawer.locator('pre')).toContainText('Line 80: synthetic mailbox content');
        await drawer.getByRole('button',{name:'读取当前关联',exact:true}).click();await expect(drawer.locator('p').filter({hasText:/^关联公司：/})).toContainText(associationName);assert.equal(associationWrites,2);
        await drawer.getByRole("button", { name: "关闭窗口" }).click();
        await expect(reopen).toBeFocused();
        const shortRow = page.getByRole("tabpanel").locator(".mailbox-row").filter({ hasText: shortSubject });
        await shortRow.locator("summary", { hasText: "查看邮件原文" }).click();
        await expect(shortRow.locator(".mailbox-message-content pre")).toHaveText(shortBody);
        await expect(page.getByRole("dialog", { name: "邮件原文" })).toHaveCount(0);
        if(viewport.width===390){
          page.on('dialog',dialog=>dialog.accept());
          await shortRow.getByRole('button',{name:'删除此本地邮件（保留知识）',exact:true}).click();
          await expect(shortRow).toHaveCount(0);
          assert.equal((await options.admin.query('select count(*)::int n from mailbox_message where user_id=$1 and connection_id=$2 and message_uid=2',[options.userId,connection.rows[0].id])).rows[0].n,0);
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `tmp/ma24-mailbox-reader-clone/${viewport.width}x${viewport.height}.png` });
        results.push({ viewport, listRequests, detailRequests, listRetry: true, detailRetry: true,
          longOriginalDrawer: true, shortOriginalInline: true, inlineOriginalRetry: true,
          refreshFailureClearsStaleBody: viewport.width >= 700,
          currentMailReselection:viewport.width>=700,sentAndInboxReadIdentityVerified:true,
          readingScroll: viewport.height < 500 ? "main-shell" : "reading-area",
          noHorizontalOverflow: true, pageErrors: 0 });
      } finally {
        releaseAssociationAck?.();
        await context.close();
      }
    }
    return { candidatePage: true, syntheticEncryptedMessages: 3,associationScreenshots,unavailableScreenshots,injected404ClearsCachedOriginalAndDrawerWithoutDeleteClaim:true,underlyingGeneratedOriginalPreserved:true,explicitOriginalRetryAndAssociationReadRecover:true,oneGeneratedLocalMessageDeletedAtFinalViewport:true,manualAssociationDisplayMatchesSavedOriginal:true,companyIdentityDistinctFromMarketCandidate:true,unchangedAssociationDoesNotWrite:true,explicitUnlinkAndRelinkThroughUi:true,reopenedDrawerRetainsReadBackAssociation:true,heldCommittedAssociationAckSurvivesDrawerCloseReopen:true, modelCalls: 0, mailSends: 0, results };
  } finally {
    await browser.close();
  }
}
