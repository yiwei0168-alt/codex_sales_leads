import { test,expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let script:string,css:string;
const makeMessage=(index:number)=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`,subject:`客户邮件 ${index}`,excerpt:"这是一封用于排版检查的客户邮件。",direction:"inbound",learning_status:"pending",learning_error:null,screening_bucket:"recommended",screening_score:90,screening_reasons:[],thread_key:null});
const makeCandidate=(index:number)=>({id:`10000000-0000-4000-8000-${String(index).padStart(12,"0")}`,message_id:makeMessage(index).id,kind:"customer-signal",title:`客户信号 ${index}`,excerpt:"等待审核的私有内容。",content:"可核对的完整内容",contentHash:"a".repeat(64),created_at:"2026-09-23",confidence:0.9,rationale:null,model:"kimi-k3"});
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/mailbox-workspace-fixture.tsx"],bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(["src/app/globals.css","src/app/conversation-theme.css"].map(path=>readFile(path,"utf8")))).join("\n");
});

test("mailbox uses a fixed, paginated work area and top account manager",async({page},testInfo)=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==="/api/mailbox/connections")return route.fulfill({json:{connections:[{id:"22222222-2222-4222-8222-222222222222",email:"sales@example.com",displayName:"欧洲销售",accessMode:"read-only",imapHost:"imap.example.com",imapPort:993,smtpHost:null,smtpPort:465,status:"active"}]}});
    if(url.pathname==="/api/mailbox/status")return route.fulfill({json:{configured:true,kimiConfigured:true,messages:100,pendingCandidates:16,screening:{recommended:12,review:0,ignored:0,unscreened:0},latestRun:null}});
    if(url.pathname==="/api/mailbox/learning-queue"){const start=(Number(url.searchParams.get("page"))-1)*8;return route.fulfill({json:{messages:Array.from({length:8},(_,index)=>makeMessage(start+index+1)),total:16,pageSize:8}});}
    if(url.pathname==="/api/mailbox/candidates"){const start=(Number(url.searchParams.get("page"))-1)*8;return route.fulfill({json:{candidates:Array.from({length:8},(_,index)=>makeCandidate(start+index+1)),pageSize:8}});}
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await expect(page.getByText("邮箱工作台")).toBeVisible();
  const viewport=page.viewportSize()!;
  const main=await page.locator(".mailbox-workspace").boundingBox();
  expect(main!.x).toBeLessThan(viewport.width*0.08);
  expect(main!.width).toBeGreaterThan(viewport.width*0.84);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await page.getByRole("button",{name:"管理 / 连接邮箱"}).click();
  await expect(page.getByRole("region",{name:"邮箱管理"})).toBeVisible();
  await expect(page.getByText("欧洲销售").first()).toBeVisible();
  await page.getByLabel("邮箱类型").selectOption("custom");
  await expect(page.getByLabel("IMAP 服务器")).toHaveValue("");
  await page.getByRole("button",{name:"收起邮箱管理"}).click();
  await page.getByRole("button",{name:"下一页"}).click();
  await expect(page.getByText("客户邮件 9")).toBeVisible();
  await page.getByRole("tab",{name:/待审核内容/}).click();
  await expect(page.getByText("客户信号 1")).toBeVisible();
  await page.locator(".mailbox-review-list .mailbox-review-card").first().locator('input[type="checkbox"]').check();
  await expect(page.getByRole("button",{name:"批量批准（1）"})).toBeEnabled();
  if(testInfo.project.name==="desktop")expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
