import {test,expect} from "@playwright/test";
import {build} from "esbuild";
import {readFile} from "node:fs/promises";

let script:string,css:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:["tests/browser/gold-review-fixture.tsx"],bundle:true,write:false,
    platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(["src/app/globals.css","src/app/intelligence-theme.css"].map(path=>readFile(path,"utf8")))).join("\n");
});

test("human Gold editor preserves precise excerpts and permits documented no-answer cases",async({page})=>{
  const saved:Array<Record<string,unknown>>=[];
  const items=[
    {id:"base-01-open",split:"development",language:"zh-CN",query:"打开样本资料",expectedAction:"open-document",expectedOutcome:"route",
      expectedEntities:["WR3000"],sourceGroup:"product-pair-01",sourceSuggestions:[{assetId:"asset",assetSha256:"a".repeat(64),title:"WR3000 Datasheet",version:"V2",url:"/asset"}],
      expectedAnswer:"",expectedSources:[],reviewNote:"",reviewed:false,precisionComplete:false,reviewedAt:null,revision:0,locked:false,caseSha256:"b".repeat(64)},
    {id:"boundary-1-09",split:"development",language:"zh-CN",query:"不存在的型号",expectedAction:"open-document",expectedOutcome:"insufficient-evidence",
      expectedEntities:[],sourceGroup:"boundary-09",sourceSuggestions:[],expectedAnswer:"",expectedSources:[],reviewNote:"",reviewed:false,
      precisionComplete:false,reviewedAt:null,revision:0,locked:false,caseSha256:"c".repeat(64)},
  ];
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==="/api/knowledge/evaluation-reviews"){
      if(route.request().method()==="PATCH"){
        saved.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});
      }
      return route.fulfill({json:{items,total:2,offset:0,limit:25,reviewed:11,
        counts:{development:{total:190,reviewed:11,precise:0},validation:{total:60,reviewed:0,precise:0},holdout:{total:50,reviewed:0,precise:0}},
        holdoutUnlocked:false,retrievalProfileKey:"rag-v3-rrf-v1.0.0",retrievalProfileSha256:"d".repeat(64)}});
    }
    if(url.pathname==="/api/knowledge/evaluation-reviews/source"){
      expect(url.searchParams.get("assetSha256")).toBe("a".repeat(64));
      expect(url.searchParams.get("unitIndex")).toBe("2");
      return route.fulfill({json:{blocks:[{blockId:"page-2-block-1",content:"WR3000 original specification",unitIndex:2}],truncated:false}});
    }
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await page.getByRole("button",{name:"进入复核中心"}).click();
  await page.getByRole("tab",{name:"Gold 审核"}).click();
  await expect(page.getByText("11/300 已保存")).toBeVisible();
  await expect(page.getByText("0/190")).toBeVisible();
  await page.getByRole("button",{name:/base-01-open/}).click();
  await page.getByLabel("正确答案").fill("WR3000 source opened");
  await page.getByRole("button",{name:/WR3000 Datasheet/}).click();
  await page.getByLabel("页/slide/sheet").fill("2");
  await page.getByRole("button",{name:"读取该页原文"}).click();
  await page.getByRole("button",{name:/page-2-block-1/}).click();
  await expect(page.getByLabel("原文块 ID（可选）")).toHaveValue("page-2-block-1");
  await expect(page.getByLabel("原文短引")).toHaveValue("WR3000 original specification");
  await page.getByRole("button",{name:"保存此条 Gold"}).click();
  await expect.poll(()=>saved.length).toBe(1);
  expect(saved[0].expectedSources).toEqual([{assetSha256:"a".repeat(64),unitIndex:2,version:"V2",blockId:"page-2-block-1",excerpt:"WR3000 original specification"}]);
  await page.getByRole("button",{name:/boundary-1-09/}).click();
  await page.getByLabel("正确答案").fill("No registered source supports that model.");
  await page.getByLabel("审核备注").fill("Checked all active registered datasheets.");
  await page.getByRole("button",{name:"保存此条 Gold"}).click();
  await expect.poll(()=>saved.length).toBe(2);
  expect(saved[1].expectedSources).toEqual([]);
  await expect(page.getByRole("button",{name:"保存此条 Gold"})).toBeVisible();
});
