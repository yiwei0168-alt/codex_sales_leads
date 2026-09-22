import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const conversationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
let script: string, css: string;
test.beforeAll(async () => {
  const bundle = await build({entryPoints:["tests/browser/conversation-history-fixture.tsx"],bundle:true,write:false,
    platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"}});
  script = bundle.outputFiles[0].text;
  css = (await Promise.all(["src/app/globals.css","src/app/ipados.css","src/app/conversation-theme.css"].map(path => readFile(path,"utf8")))).join("\n");
});
test("history menu shows trace and removes a finished conversation", async ({page}) => {
  let deleted = false;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if (url.pathname === "/api/assistant/conversations" && route.request().method() === "GET") return route.fulfill({json:{conversations:deleted?[]:[{id:conversationId,title:"德国渠道计划",status:"active",updatedAt:"2026-09-22",messageCount:2}]}});
    if (url.pathname === `/api/assistant/conversations/${conversationId}` && route.request().method() === "DELETE") { deleted = true; return route.fulfill({json:{deleted:true,taskHistoryRetained:true}}); }
    if (url.pathname === "/api/assistant/runs") return route.fulfill({json:{runs:[{id:runId,conversation_id:conversationId,status:"completed"}]}});
    if (url.pathname === `/api/assistant/runs/${runId}/events`) return route.fulfill({contentType:"text/event-stream",body:"id: 1\nevent: tool_result\ndata: {\"tool\":\"knowledge_search\",\"status\":\"success\"}\n\n"});
    return route.abort("blockedbyclient");
  });
  await page.goto("https://ui.test/");
  await page.evaluate(() => document.body.classList.add("conversation-theme"));
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:script});
  const current = page.getByRole("button",{name:/德国渠道计划/}).first();
  await expect(current).toHaveAttribute("aria-current","page");
  const item = page.locator(".conversation-history-item.active");
  await expect(item).toHaveCSS("background-color","rgba(226, 214, 255, 0.72)");
  const more = page.getByRole("button",{name:"德国渠道计划 更多操作"});
  await more.click();
  const menu = page.getByRole("menu",{name:"德国渠道计划 操作"});
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await more.click();
  await menu.getByRole("menuitem",{name:"查看技术流水"}).click();
  const trace = page.getByRole("dialog",{name:"德国渠道计划 技术流水"});
  await expect(trace).toBeVisible();
  await expect(trace.getByText("knowledge_search · 完成")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trace).toHaveCount(0);
  await more.click();
  page.once("dialog",dialog => dialog.accept());
  await menu.getByRole("menuitem",{name:"删除对话"}).click();
  await expect(page.getByText("还没有已保存的对话")).toBeVisible();
  expect(deleted).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
