import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ConversationHistory}from'./src/components/conversation-history';function App(){const[key,setKey]=React.useState(0);return <ConversationHistory refreshKey={key} onSelect={()=>{}} onNew={()=>setKey(value=>value+1)}/>};createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: process.cwd(), loader: "tsx",
  }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
});
const css = (await Promise.all(["src/app/globals.css", "src/app/conversation-theme.css"].map(path => readFile(path, "utf8")))).join("\n");
const server = createServer((request, response) => {
  if (request.url === "/component.js") { response.setHeader("content-type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
  else if (request.url === "/styles.css") { response.setHeader("content-type", "text/css"); response.end(css); }
  else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>'); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 760 }, { width: 320, height: 480 }]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let deleteCalls = 0;
    await page.route("**/api/assistant/conversations", route => route.fulfill({ json: { conversations: [{ id: "conversation-1", title: "测试对话", status: "active", updatedAt: "2026-10-15T00:00:00Z", messageCount: 1 }] } }));
    await page.route("**/api/assistant/conversations/conversation-1", async route => {
      if (route.request().method() !== "DELETE") return route.fulfill({ status: 405 });
      deleteCalls += 1;
      if (deleteCalls === 1) return route.fulfill({ status: 409, json: { error: "对话仍有未结束的任务或操作，请先完成或取消" } });
      return route.fulfill({ json: { deleted: true } });
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    const trigger = page.getByRole("button", { name: "测试对话 更多操作" });
    const openDialog = async () => {
      await trigger.click();
      await page.getByRole("menuitem", { name: "删除对话" }).click();
      const dialog = page.getByRole("dialog", { name: "删除对话" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
      await expect(dialog.getByText(/等待确认或暂停的任务/)).toBeVisible();
      return dialog;
    };
    let dialog = await openDialog();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    dialog = await openDialog();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    dialog = await openDialog();
    await dialog.getByRole("button", { name: "删除对话" }).click();
    await expect(dialog.getByRole("alert")).toContainText("未结束的任务或操作");
    await expect(dialog).toBeVisible();
    assert.equal(deleteCalls, 1);
    await dialog.getByRole("button", { name: "删除对话" }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(deleteCalls, 2);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Conversation delete dialog: desktop/mobile/short focus, cancellation, 409, retry: PASS");
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
