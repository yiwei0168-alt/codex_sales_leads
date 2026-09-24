import { test,expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let script:string,css:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/knowledge-base-fixture.tsx"],bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",alias:{"next/navigation":"./tests/browser/next-navigation-stub.ts"},define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(["src/app/globals.css","src/app/conversation-theme.css"].map(path=>readFile(path,"utf8")))).join("\n");
});

test("materials switch between list, mailbox knowledge, memory, and upload without stacking",async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==="/api/auth/session")return route.fulfill({json:{user:{role:"member"}}});
    if(url.pathname==="/api/knowledge/status")return route.fulfill({json:{configured:true,provider:"PostgreSQL",collections:[]}});
    if(url.pathname==="/api/knowledge/uploads")return route.fulfill({json:{jobs:[{id:"fixture",collection:"industry",status:"registered",treeStatus:"searchable",currentVersionId:"12345678-0000-4000-8000-000000000000",sourceSha256:"a".repeat(64),title:"本地资料",originalFilename:"fixture.pdf",documentType:"PDF",byteSize:"1024",errorCode:null,createdAt:"2026-09-24",updatedAt:"2026-09-24"}]}});
    if(url.pathname==="/api/knowledge/mailbox")return route.fulfill({json:{items:[{id:"one",message_id:"mail",kind:"company-policy",title:"邮箱知识一",content:"私有知识",confidence:null,rationale:null,model:null,reviewed_at:"2026-09-23"}],hasMore:false}});
    if(url.pathname==="/api/knowledge/library")return route.fulfill({json:{items:[{id:"doc",title:"资料一",updatedAt:"2026-09-23",status:"active",scope:"private",excerpt:"摘要"}],hasMore:false}});
    if(url.pathname==="/api/knowledge/library/doc")return route.fulfill({json:{item:{content:"旧检索正文"}}});
    if(url.pathname==="/api/knowledge/tree"){
      const location={unitType:"page",unitIndex:2,blockId:"page-2-block-1"};
      if(url.searchParams.has("nodeId"))return route.fulfill({json:{evidence:{id:"node",documentId:"doc",content:"精确原文",source_location:location,source_sha256:"a".repeat(64)}}});
      return route.fulfill({json:{nodes:url.searchParams.has("parentId")?[{id:"node",title:"原文块 1",node_kind:"evidence",unit_type:"page",unit_index:2,source_location:location}]:
        [{id:"page",title:"第 2 页",node_kind:"unit",unit_type:"page",unit_index:2,source_location:location}],hasMore:false}});
    }
    if(url.pathname==="/api/knowledge/memories")return route.fulfill({json:{items:[],hasMore:false}});
    if(url.pathname==="/api/knowledge/observations")return route.fulfill({json:{items:[],hasMore:false}});
    if(url.pathname==="/api/assistant/skills"){
      if(url.searchParams.has("id"))return route.fulfill({json:{versions:[{version:2,source:"Account instruction editor",created_at:"2026-09-24"},{version:1,source:"Account instruction editor",created_at:"2026-09-23"}]}});
      const offset=Number(url.searchParams.get("offset")??0);
      return route.fulfill({json:{items:offset===0?Array.from({length:12},(_,index)=>({id:`skill-${index}`,name:`Method ${index+1}`,scope:"account",current_version:2,enabled:true,published:false,owned:true,source:"Account instruction editor",validation:{scripts:"none"},created_at:"2026-09-24"})):
        [{id:"skill-13",name:"Method 13",scope:"account",current_version:1,enabled:false,published:false,owned:true,source:"Account instruction editor",validation:{scripts:"none"},created_at:"2026-09-24"}],hasMore:offset===0}});
    }
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await expect(page.getByText("资料一",{exact:true})).toBeVisible();
  await page.locator(".library-title").first().click();
  await page.getByRole("button",{name:/第 2 页/}).click();
  await page.getByRole("button",{name:/原文块 1/}).click();
  await expect(page.getByText("精确原文",{exact:true})).toBeVisible();
  await expect(page.getByText(/page-2-block-1/).first()).toBeVisible();
  await page.getByRole("button",{name:"返回资料列表"}).click();
  await expect(page.getByText("邮箱知识一")).toHaveCount(0);
  await page.getByRole("button",{name:"邮箱知识"}).click();
  await expect(page.getByText("邮箱知识一")).toBeVisible();
  await expect(page.getByText("资料一",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"个人记忆"}).click();
  await expect(page.getByRole("heading",{name:"学习记忆"})).toBeVisible();
  await page.getByRole("button",{name:"Skill",exact:true}).click();
  await expect(page.getByText("Method 1",{exact:true})).toBeVisible();
  await page.locator(".memory-skills").getByRole("button",{name:"下一页"}).click();
  await expect(page.getByText("Method 13",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await page.getByRole("button",{name:"原有记忆"}).click();
  await expect(page.getByRole("heading",{name:"个人长期记忆"})).toBeVisible();
  await page.getByRole("button",{name:"上传资料"}).click();
  await expect(page.getByRole("heading",{name:"上传你的知识资料"})).toBeVisible();
  await expect(page.getByText("可检索",{exact:true})).toBeVisible();
  await expect(page.getByText(/版本 12345678/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
});
