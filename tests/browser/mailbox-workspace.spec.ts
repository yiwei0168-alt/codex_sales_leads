import { test,expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let script:string,css:string;
const viewportHeight=(page:import("@playwright/test").Page)=>page.viewportSize()!.height;
const makeMessage=(index:number)=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`,subject:`客户邮件 ${index}`,excerpt:"这是一封用于排版检查的客户邮件。",direction:"inbound",learning_status:"pending",learning_error:null,screening_bucket:"recommended",screening_score:90,screening_reasons:[],thread_key:null});
const makeCandidate=(index:number)=>({id:`10000000-0000-4000-8000-${String(index).padStart(12,"0")}`,message_id:makeMessage(index).id,kind:"customer-signal",title:`客户信号 ${index}`,excerpt:"等待审核的私有内容。",content:"可核对的完整内容",contentHash:"a".repeat(64),created_at:"2026-09-23",confidence:0.9,rationale:null,model:"kimi-k3"});
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/mailbox-workspace-fixture.tsx"],bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(["src/app/globals.css","src/app/ipados.css","src/app/conversation-theme.css","src/app/intelligence-theme.css"].map(path=>readFile(path,"utf8")))).join("\n");
});

test('customer timeline keeps company notes, participants and recoverable removal',async({page},testInfo)=>{
 let customer={id:'33333333-3333-4333-8333-333333333333',name:'Example GmbH',domain:'example.com',country:'DE',customer_type:'inquiry',notes:'Prefer written quotations',confirmed:false,archived:false,revision:1};
 const event={id:'44444444-4444-4444-8444-444444444444',time:'2026-10-01T09:00:00Z',subject:'Quotation discussion',excerpt:'Please quote 20 units.',thread:'thread1',threadEvidence:'headers',sender:[{address:'buyer@example.com'}],recipients:[{address:'sales@cudy.com',role:'To'}],source:'suggested',summary:{important:true,kind:'inquiry',summary:'询问 20 台设备报价',quote:'Please quote 20 units.',companyName:'Example GmbH',country:'DE'}};
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
  if(url.pathname==='/api/mailbox/customers'){
   if(request.method()==='POST'){const body=request.postDataJSON();if(body.action==='save'){customer={...customer,...body.customer,revision:customer.revision+1};return route.fulfill({json:{customer}});}return route.fulfill({json:{queued:1}});}
   if(url.searchParams.has('id'))return route.fulfill({json:{customer,events:[event],hasMore:false}});
   return route.fulfill({json:{items:customer.archived===(url.searchParams.get('archived')==='true')?[customer]:[],countries:[{country:'DE',count:1}],hasMore:false}});
  }
  if(url.pathname==='/api/mailbox/connections')return route.fulfill({json:{connections:[]}});
  if(url.pathname==='/api/mailbox/status')return route.fulfill({json:{configured:true,kimiConfigured:true,messages:1,pendingCandidates:0,screening:{},latestRun:null}});
  if(url.pathname==='/api/mailbox/learning-queue')return route.fulfill({json:{messages:[],total:0}});
  if(url.pathname==='/api/mailbox/candidates')return route.fulfill({json:{candidates:[]}});
  if(url.pathname==='/api/mailbox/jobs')return route.fulfill({json:{jobs:[],counts:[]}});
  if(url.pathname==='/api/mailbox/messages')return route.fulfill({json:{messages:[],hasMore:false}});
  return route.abort('blockedbyclient');
 });
 await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await page.getByRole('tab',{name:'客户与时间线'}).click();
 await page.locator('.customer-list').getByRole('button',{name:/Example GmbH/}).click();
 await expect(page.getByRole('heading',{name:'Quotation discussion'})).toBeVisible();
 await expect(page.getByText('buyer@example.com',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'确认 / 编辑 / 备注'}).click();
 await page.getByRole('textbox',{name:'备注',exact:true}).fill('Ask about sample feedback first');
 await page.getByLabel('客户类型').selectOption('negotiating');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByText('公司备注与来源说明',{exact:true}).click();
 await expect(page.getByText('备注：Ask about sample feedback first')).toBeVisible();
 await page.getByText('公司备注与来源说明',{exact:true}).click();
 await page.screenshot({path:`tmp/mailcrm-${testInfo.project.name}.png`});
 await page.getByRole('button',{name:'移除公司',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('原始邮箱邮件保留');
 await page.getByRole('dialog').getByRole('button',{name:'移除公司',exact:true}).click();
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'返回公司列表'}).click();
 await page.getByLabel('查看已移除公司').check();
 await expect(page.locator('.customer-list').getByRole('button',{name:/Example GmbH/})).toBeVisible();
});

test("mailbox uses a fixed, paginated work area and top account manager",async({page},testInfo)=>{
  const sampleMail={id:'sample-mail',subject:'Sample quotation',bodyText:'Quotation details\n'.repeat(80),sender:[{address:'buyer@example.com'}],recipients:[{address:'sales@example.com'}],sentAt:'2026-10-01T09:00:00Z'};
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==="/api/mailbox/connections")return route.fulfill({json:{connections:[{id:"22222222-2222-4222-8222-222222222222",email:"sales@example.com",displayName:"欧洲销售",accessMode:"read-only",imapHost:"imap.example.com",imapPort:993,smtpHost:null,smtpPort:465,status:"active"}]}});
    if(url.pathname==="/api/mailbox/status")return route.fulfill({json:{configured:true,kimiConfigured:true,messages:100,pendingCandidates:16,screening:{recommended:12,review:0,ignored:0,unscreened:0},latestRun:null}});
    if(url.pathname==='/api/mailbox/jobs')return route.fulfill({json:{jobs:[],counts:[]}});
    if(url.pathname==='/api/mailbox/messages')return route.fulfill({json:{messages:[sampleMail],hasMore:false}});
    if(url.pathname==='/api/mailbox/messages/sample-mail')return route.fulfill({json:{message:sampleMail}});
    if(url.pathname==="/api/mailbox/learning-queue"){const start=(Number(url.searchParams.get("page"))-1)*8;return route.fulfill({json:{messages:Array.from({length:8},(_,index)=>makeMessage(start+index+1)),total:16,pageSize:8}});}
    if(url.pathname==="/api/mailbox/candidates"){const start=(Number(url.searchParams.get("page"))-1)*8;return route.fulfill({json:{candidates:Array.from({length:8},(_,index)=>makeCandidate(start+index+1)),pageSize:8}});}
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await expect(page.getByRole("tab",{name:"收件箱",exact:true})).toBeVisible();
  const reading=await page.locator('.mail-reader').boundingBox();
  expect(reading!.height).toBeGreaterThan(viewportHeight(page)*0.7);
  const viewport=page.viewportSize()!;
  const main=await page.locator(".mailbox-workspace").boundingBox();
  expect(main!.x).toBeLessThan(viewport.width*0.08);
  expect(main!.width).toBeGreaterThan(viewport.width*0.84);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await page.getByRole('button',{name:/Sample quotation/}).click();
  await expect(page.getByRole('heading',{name:'Sample quotation'})).toBeVisible();
  const reader=page.getByRole('region',{name:'邮件阅读区'});
  expect((await reader.boundingBox())!.height).toBeGreaterThan(viewport.height*0.7);
  await reader.hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>reader.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await reader.evaluate(node=>node.scrollTop=0);
  await page.screenshot({path:`tmp/mail-reading-${testInfo.project.name}.png`});
  console.log(`${testInfo.project.name}: reading height ${(await reader.boundingBox())!.height}/${viewport.height}`);
  if(testInfo.project.name==='mobile'){
    await page.getByRole('button',{name:'返回邮件列表'}).click();
    await expect(page.getByRole('button',{name:/Sample quotation/})).toBeVisible();
  }
  await page.setViewportSize({width:viewport.width,height:600});
  expect((await page.locator('.mail-reader').boundingBox())!.height).toBeGreaterThan(340);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await page.setViewportSize(viewport);
  await page.getByRole("button",{name:"管理 / 连接邮箱"}).click();
  await expect(page.getByRole("dialog",{name:"管理 / 连接邮箱"})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.setViewportSize({width:viewport.width,height:480});
  await page.getByText('添加邮箱',{exact:true}).click();
  const scroll=page.locator('.workspace-dialog-body');
  await scroll.hover();await page.mouse.wheel(0,800);
  await expect.poll(()=>scroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await page.setViewportSize(viewport);
  await expect(page.locator('.mailbox-managed-fields input')).toHaveValue("欧洲销售");
  await page.getByLabel("邮箱类型").selectOption("custom");
  await expect(page.getByLabel("IMAP 服务器")).toHaveValue("");
  await page.getByRole("dialog").getByRole("button",{name:"关闭窗口"}).click();
  await page.getByRole('tab',{name:/私有学习候选/}).click();
  await page.getByLabel('选择当前页').check();
  await expect(page.getByRole('button',{name:'授权所选 8'})).toBeEnabled();
  await page.getByRole("button",{name:"下一页"}).click();
  await expect(page.getByText("客户邮件 9")).toBeVisible();
  await expect(page.getByRole('button',{name:'授权所选 8'})).toBeEnabled();
  await page.getByRole("tab",{name:/待审核内容/}).click();
  await expect(page.getByText("客户信号 1")).toBeVisible();
  await page.locator(".mailbox-review-list .mailbox-review-card").first().locator('input[type="checkbox"]').check();
  await expect(page.getByRole("button",{name:"批量批准（1）"})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
