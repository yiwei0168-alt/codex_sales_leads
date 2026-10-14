import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const jobId = "00000000-0000-4000-8000-000000000002";
const artifact = JSON.parse(await readFile("tmp/ma24-independent-quarantine/eu-connectivity-layout-v2.0.7.json", "utf8"));
const candidates = JSON.parse(await readFile("tmp/ma24-independent-quarantine/eu-connectivity-visual-review-v2/review.json", "utf8"));
const block = artifact.documents[0].blocks.find((item: { id: string }) => item.id === "sheet-2-table");
const candidate = candidates.records.find((item: { blockId: string }) => item.blockId === block.id);
assert(block && candidate);
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{KnowledgeExtractionReview}from'./src/components/knowledge-extraction-review';createRoot(document.getElementById('root')).render(<KnowledgeExtractionReview jobId="${jobId}" onClose={()=>{}}/>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const css = await readFile("src/app/globals.css", "utf8");
const server = createServer((request, response) => {
  if (request.url === "/component.js") { response.setHeader("content-type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
  else if (request.url === "/styles.css") { response.setHeader("content-type", "text/css"); response.end(css); }
  else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>'); }
});
await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert(address && typeof address !== "string");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [1366, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 760 } });
    await page.route("**/api/knowledge/uploads/review**", async route => {
      assert.equal(route.request().method(), "GET");
      await route.fulfill({ json: { jobId, title: "EU cached-error table review", artifactSha256: "a".repeat(64),
        sourceSha256: artifact.documents[0].sourceSha256, decisionSha256: "b".repeat(64), visualState: "ready",
        total: 1, resolved: 0, offset: 0, blocks: [{ block, candidate, judgment: null }] } });
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("region", { name: "工作表缓存错误" })).toBeVisible();
    await expect(page.getByText(/此表含 4 个缓存公式错误/)).toBeVisible();
    for (const cell of ["K12", "L12", "M12", "N12"])
      await expect(page.getByRole("region", { name: "工作表缓存错误" })).toContainText(`${cell}: #VALUE!`);
    await expect(page.getByRole("link", { name: "下载本次原件进行对照" })).toBeVisible();
    await expect(page.getByRole("button", { name: "完成审核并提交后续处理" })).toBeDisabled();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width === 390) await page.screenshot({ path: "tmp/ma24-independent-quarantine/eu-cached-error-review-390.png", fullPage: true });
    results.push({ width, fourErrorCellsVisible: true, completionBlocked: true, noHorizontalOverflow: true });
    await page.close();
  }
  await writeFile("tmp/ma24-independent-quarantine/eu-cached-error-ui-result.json", JSON.stringify({ syntheticApi: true, results }, null, 2));
  console.log(JSON.stringify({ syntheticApi: true, results }));
} finally {
  await browser.close();
  await new Promise<void>(done => server.close(() => done()));
}
