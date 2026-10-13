import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MailboxWorkspace}from'./src/components/mailbox-workspace';
const accounts=Array.from({length:4},(_,i)=>({id:'account-'+i,email:'person'+i+'@example.com',displayName:'邮箱 '+(i+1),accessMode:'read-only',imapHost:'imap.example.com',imapPort:993,smtpHost:null,smtpPort:465,status:'active'}));
window.fetch=async(input)=>{const path=String(input);let body={};if(path.includes('/api/mailbox/connections'))body={connections:accounts};else if(path.includes('/api/mailbox/status'))body={configured:true,kimiConfigured:true,messages:24,pendingCandidates:0,screening:{recommended:0,review:0,ignored:0,unscreened:0},latestRun:null};else if(path.includes('/api/mailbox/learning-queue'))body={messages:[],total:0};else if(path.includes('/api/mailbox/candidates'))body={candidates:[]};else if(path.includes('/api/mailbox/jobs'))body={jobs:[],counts:[]};else if(path.includes('/api/mailbox/messages'))body={messages:[],hasMore:false};return {ok:true,json:async()=>body}};
createRoot(document.getElementById('root')).render(<MailboxWorkspace/>);`,
    resolveDir: process.cwd(), loader: 'tsx'
  },
  bundle: true, write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }
});
const css = (await Promise.all([
  'src/app/globals.css', 'src/app/ipados.css', 'src/app/conversation-theme.css',
  'src/app/intelligence-theme.css', 'src/app/agent-mode-picker.css'
].map(path => readFile(path, 'utf8')))).join('\n');
const server = createServer((req, res) => {
  if (req.url === '/component.js') { res.setHeader('content-type', 'application/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); res.end(css); }
  else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme intelligence-theme"><div id="root"></div><script src="/component.js"></script></body></html>'); }
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); assert(address && typeof address !== 'string');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  await mkdir('tmp/mailbox-manager-ui', { recursive: true });
  for (const viewport of [{ width: 1366, height: 900 }, { width: 1366, height: 360 }, { width: 390, height: 760 }, { width: 320, height: 480 }]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForTimeout(500);
    if (errors.length) throw new Error(`Mailbox fixture failed: ${errors.join('; ')}`);
    if (await page.getByRole('button', { name: '管理 / 连接邮箱' }).count() === 0) throw new Error(`Mailbox fixture did not render: ${(await page.locator('body').innerText()).slice(0, 500)}`);
    await page.getByRole('button', { name: '管理 / 连接邮箱' }).click();
    const dialog = page.getByRole('dialog', { name: '管理 / 连接邮箱' });
    const body = dialog.locator('.workspace-dialog-body');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: '名称' }).nth(3)).toHaveValue('邮箱 4');
    await dialog.getByText('添加邮箱', { exact: true }).click();
    await expect(dialog.getByRole('button', { name: '验证并连接' })).toBeVisible();
    const background = await dialog.evaluate(el => getComputedStyle(el).backgroundColor);
    assert(!['transparent', 'rgba(0, 0, 0, 0)'].includes(background), `transparent dialog at ${viewport.width}x${viewport.height}`);
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
    await body.evaluate(el => el.scrollTop = 0);
    const region = await body.boundingBox(); assert(region);
    await page.mouse.move(region.x + region.width / 2, region.y + Math.min(60, region.height / 2));
    await page.mouse.wheel(0, 900);
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: '验证并连接' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '验证并连接' })).toBeInViewport();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `tmp/mailbox-manager-ui/${viewport.width}-${viewport.height}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(errors, []);
    results.push({ ...viewport, accounts: 4, addFormExpanded: true, opaque: true, scrollToSubmit: true, noHorizontalOverflow: true });
    await page.close();
  }
  await writeFile('tmp/mailbox-manager-ui/result.json', JSON.stringify({ actualMailboxComponent: true, productionStyles: true, mockedAccountMetadata: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser.close();
  await new Promise<void>(done => server.close(() => done()));
}
