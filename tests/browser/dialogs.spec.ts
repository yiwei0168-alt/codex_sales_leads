import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

// Actual components and production CSS, synthetic data only. All network stays intercepted.
let script:string,css:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/dialog-fixture.tsx"],bundle:true,write:false,
    platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=await readFile("src/app/globals.css","utf8");
});
test.beforeEach(async({page})=>{
  page.on("pageerror",error=>{throw error;});
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname.endsWith("/assessment"))return route.fulfill({json:{assessment:null}});
    if(url.pathname==="/api/tasks/fixture-task")return route.fulfill({json:{kind:"generation",details:{stage:"development-generation",status:"completed",metrics:{inputTokens:null,outputItems:1},body:"Fixture draft"}}});
    return route.abort("blockedbyclient");
  });
  await page.goto("http://ui.test/");
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:script});
});
test("company traps Tab, restores focus and closes only topmost modal",async({page})=>{
  const opener=page.getByRole("button",{name:"打开公司",exact:true}); await opener.click();
  const dialog=page.getByRole("dialog",{name:"Fixture Networks 公司详情"});
  await expect(dialog.getByRole("button",{name:"关闭",exact:true}).first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button",{name:"打开开发助手（不自动生成）"})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button",{name:"关闭",exact:true}).first()).toBeFocused();
  await dialog.getByRole("button",{name:"评分与证据",exact:true}).click();
  const evidence=dialog.getByRole("button",{name:/Synthetic evidence/}); await evidence.click();
  await expect(page.getByRole("dialog",{name:"nested"})).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible(); await expect(evidence).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
});
test("assessment error clears after successful explicit tab retry",async({page})=>{
  let attempts=0;
  await page.route("**/assessment",route=> ++attempts===1?route.fulfill({status:503,json:{}}):route.fulfill({json:{assessment:null}}));
  await page.getByRole("button",{name:"打开公司",exact:true}).click();
  await page.getByRole("button",{name:"评分与证据",exact:true}).click(); await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button",{name:"概览",exact:true}).click(); await page.getByRole("button",{name:"评分与证据",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("没有关联到版本化评分记录；不推算子项分数。")).toBeVisible();
});
test("task details show unknown usage and fit viewport without opening raw content",async({page})=>{
  await page.getByRole("button",{name:"打开任务",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"任务详情",exact:true});
  await expect(dialog.getByRole("heading",{name:"本环节用量"})).toBeVisible();
  await expect(dialog.locator("dd").filter({hasText:"未记录"})).toHaveCount(1);
  await expect(dialog.locator("details[open]")).toHaveCount(0);
  await expect.poll(async()=>{const box=await dialog.boundingBox();return box!.x;}).toBeGreaterThanOrEqual(0);
  await expect.poll(async()=>{const box=await dialog.boundingBox();return Math.round(box!.x+box!.width);}).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape"); await expect(page.getByRole("button",{name:"打开任务",exact:true})).toBeFocused();
});
test("budget shows unknown bills separately and editing needs explicit confirmation",async({page})=>{
  let writes=0;
  await page.route("**/api/budget",async route=>{
    if(route.request().method()==="PUT"){writes++;expect(route.request().postDataJSON()).toEqual({limitUsd:"60",confirmed:true});return route.fulfill({json:{saved:true}});}
    return route.fulfill({json:{budget:{limit_micros:"50000000",occupied_micros:"10000000",remaining_micros:"40000000",frozen:false},configuredRules:0,notice:"Fixture scope",stages:[{stage:"score",calls:1,reserved_micros:"10000000",reported_micros:null,unknown_bills:1}]}});
  });
  await page.getByRole("button",{name:"打开预算",exact:true}).click();
  await expect(page.getByText(/服务商报告 未报告/)).toBeVisible();expect(writes).toBe(0);
  await page.getByLabel("新的累计上限（美元）").fill("60");
  page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("button",{name:"确认修改预算"}).click();expect(writes).toBe(0);
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"确认修改预算"}).click();await expect.poll(()=>writes).toBe(1);
});
