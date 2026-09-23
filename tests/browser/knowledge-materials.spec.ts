import { test,expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let script:string,css:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/knowledge-materials-fixture.tsx"],bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(["src/app/globals.css","src/app/conversation-theme.css"].map(path=>readFile(path,"utf8")))).join("\n");
});

test("materials remain in a fixed workspace with pages and aligned navigation",async({page},testInfo)=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==="/api/knowledge/library"){
      const offset=Number(url.searchParams.get("offset"));
      return route.fulfill({json:{items:Array.from({length:12},(_,index)=>({id:`item-${offset+index+1}`,title:`资料 ${offset+index+1}`,updatedAt:"2026-09-23",status:"active",scope:"private",excerpt:"内容摘要"})),hasMore:offset===0}});
    }
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await expect(page.getByText("资料 1",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);
  await page.getByRole("button",{name:"下一页"}).click();
  await expect(page.getByText("资料 13",{exact:true})).toBeVisible();
  await page.getByLabel("知识范围").selectOption("all");
  await expect(page.getByLabel("知识范围")).toHaveValue("all");
  if(testInfo.project.name==="desktop"){
    const positions=await page.locator(".nav-item").evaluateAll(nodes=>nodes.map(node=>{
      const icon=node.querySelector("svg")!.getBoundingClientRect(),label=node.querySelector("span")!.getBoundingClientRect();
      return Math.abs((icon.top+icon.height/2)-(label.top+label.height/2));
    }));
    expect(positions.every(delta=>delta<=2)).toBe(true);
  }
});
