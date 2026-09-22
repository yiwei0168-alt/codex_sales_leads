import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const conversationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
let script: string, css: string;
test.beforeAll(async () => {
  const bundle = await build({entryPoints:["tests/browser/assistant-flow-fixture.tsx"],bundle:true,write:false,
    platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script = bundle.outputFiles[0].text;
  css = (await Promise.all(["src/app/globals.css","src/app/ipados.css","src/app/conversation-theme.css"].map(path => readFile(path,"utf8")))).join("\n");
});
test.beforeEach(async ({page}) => {
  const conversation = {id:conversationId,title:"测试对话",status:"active",actions:[],messages:[
    {id:"message-user",role:"user",intent:"general",content:"帮我发送这封邮件",metadata:{runId},createdAt:"2026-09-22T10:00:00Z"},
    {id:"message-agent",role:"assistant",intent:"general",content:"请核对待发送内容。",metadata:{runId,status:"waiting_user"},createdAt:"2026-09-22T10:00:01Z"},
  ]};
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if (url.pathname === `/api/assistant/conversations/${conversationId}`) return route.fulfill({json:{conversation}});
    if (url.pathname === "/api/assistant/runs") return route.fulfill({json:{runs:[{id:runId,conversation_id:conversationId,status:"waiting_user",result:{reply:"请核对待发送内容。"},approvals:[{id:"approval",run_id:runId,tool_id:"mail_send",tool_version:"1",parameter_hash:"hash",status:"pending",payload:{to:"user@example.test",subject:"测试",body:"邮件正文"}}]}]}});
    if (url.pathname === `/api/assistant/runs/${runId}/events`) return route.fulfill({body:"",contentType:"text/event-stream"});
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");
  await page.evaluate(() => document.body.classList.add("conversation-theme"));
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:script});
});
test("places the pending approval below its user message in the conversation", async ({page}) => {
  const user = page.getByText("帮我发送这封邮件");
  const task = page.getByRole("region",{name:"当前任务"});
  const answer = page.getByText("请核对待发送内容。");
  await expect(task).toBeVisible();
  await expect(task.getByText("user@example.test")).toBeVisible();
  const userBox = await user.boundingBox(), taskBox = await task.boundingBox(), answerBox = await answer.boundingBox();
  expect(userBox && taskBox && answerBox).toBeTruthy();
  expect(taskBox!.y).toBeGreaterThan(userBox!.y);
  expect(answerBox!.y).toBeGreaterThan(taskBox!.y);
  await expect(page.getByText("执行记录",{exact:false})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({path:`tmp/assistant-flow-${page.viewportSize()!.width}.png`,fullPage:true});
});
