/** Exercise the actual candidate Web review page for the line-bearing Thoth PPTX table. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import { Client } from "pg";
import { fetch as localFetch, FormData } from "undici";

const sourceSha256 = "a3fa61e4fb6218994c2a8ca8f9063056ae61dfc406534956b13c09e8424b9798";
const reviewedGraph = [
  "Publisher graphic, slide 1: FORMAT -> SPECIFICATION -> PLATFORM connections; these are diagram links, not adjacent table rows.",
  "MARC21 (Record, Markup, XML) -> LMS & union catalogues (e.g. Jisc NBK), directly.",
  "CSV and BibTeX -> Thoth; that Thoth node -> BibDesk/Zotero and Zenodo.",
  "ONIX 2.1 -> EBSCOHost; that EBSCOHost node -> EBSCOHost and RNIB.",
  "ONIX 3.0 -> Project MUSE, OAPEN, Google Books and JSTOR. Project MUSE -> Project MUSE; OAPEN -> OAPEN and DOAB; Google Books -> Google Books; JSTOR -> JSTOR.",
  "ONIX 3.1 -> Thoth; that Thoth node -> SciELO Livros and Amazon.",
  "KBART -> OCLC; that OCLC node -> OCLC, ProQuest KB + ExLibris and EBSCO KB.",
  "XML for DOI Deposit -> Crossref; that Crossref node -> Crossref.",
].join("\n");

async function runLocalWorker(script: string, jobId: string, databaseUrl: string): Promise<void> {
  const workerArgs = [process.execPath, "--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
    script, `--job-id=${jobId}`, "--limit=1"];
  const command = process.platform === "win32" ? process.env.PYTHON_BINARY?.trim() || "python" : workerArgs[0];
  const args = process.platform === "win32"
    ? ["scripts/windows-owned-process.py", String(process.pid), "300000", "--", ...workerArgs]
    : workerArgs.slice(1);
  const env = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: databaseUrl,
    OPENROUTER_API_KEY: "", KIMI_API_KEY: "", EXA_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" };
  await new Promise<void>((accept, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", part => { output = `${output}${part}`.slice(-2000); });
    child.once("error", reject);
    child.once("close", code => code === 0 ? accept() : reject(new Error(`${script} exited ${code}: ${output}`)));
  });
}

export async function verifyMa24ThothReviewPageClone(options: {
  admin: Client; base: string; cookie: string; userId: string; email: string; password: string;
  migrationDatabaseUrl: string;
}): Promise<unknown> {
  const uploadsRoot = resolve("knowledge/uploads");
  const ownerRoot = resolve(uploadsRoot, options.userId);
  assert(ownerRoot.startsWith(`${uploadsRoot}${sep}`));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const bytes = await readFile("tmp/ma24-independent-quarantine/thoth-metadata-overview-2026.pptx");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sourceSha256);
    const pointerBefore = JSON.stringify((await options.admin.query(
      "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
    const form = new FormData();
    form.set("collection", "industry");
    form.set("title", "Thoth native-line table browser review");
    form.set("file", new File([bytes], "thoth-metadata-overview-2026.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
    const uploaded = await localFetch(`${options.base}/api/knowledge/uploads`, {
      method: "POST", headers: { cookie: options.cookie }, body: form, signal: AbortSignal.timeout(30_000),
    });
    const uploadBody = await uploaded.json() as { id?: string; error?: string };
    assert.equal(uploaded.status, 202, uploadBody.error);
    const jobId = uploadBody.id;
    assert(jobId && /^[a-f0-9-]{36}$/.test(jobId));
    await runLocalWorker("scripts/process-knowledge-upload-jobs.ts", jobId, options.migrationDatabaseUrl);
    const job = (await options.admin.query<{ status: string; error_code: string }>(
      "select status,error_code from knowledge_upload_job where id=$1 and user_id=$2", [jobId, options.userId])).rows[0];
    assert.equal(job.status, "extracted");
    assert.equal(job.error_code, "extraction-review-required");
    await runLocalWorker("scripts/process-upload-visual-queue.ts", jobId, options.migrationDatabaseUrl);
    const api = await fetch(`${options.base}/api/knowledge/uploads/review?jobId=${jobId}`, {
      headers: { cookie: options.cookie }, signal: AbortSignal.timeout(20_000) });
    assert.equal(api.status, 200);
    const review = await api.json() as { total: number; blocks: Array<{ block: { id: string }; candidate?: { imageFile?: string } }> };
    assert.equal(review.total, 1);
    assert.equal(review.blocks[0].block.id, "slide-1-table-1");
    assert(review.blocks[0].candidate);
    assert.equal(review.blocks[0].candidate.imageFile, undefined);

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    await page.goto(options.base);
    await page.getByLabel("登录邮箱").fill(options.email);
    await page.getByLabel("密码", { exact: true }).fill(options.password);
    const browserLogin = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login"
      && response.request().method() === "POST");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    assert.equal((await browserLogin).status(), 200);
    await page.goto(`${options.base}/knowledge`);
    await page.getByRole("button", { name: "上传资料", exact: true }).click();
    await page.getByRole("button", { name: "审核抽取内容" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("对象 1 / 1", { exact: true })).toBeVisible();
    await expect(page.getByText("本地工具未生成此对象的可用预览，请下载原件核对。")).toBeVisible();
    await expect(page.getByRole("button", { name: "完成审核并提交后续处理" })).toBeDisabled();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载本次原件进行对照" }).click();
    const downloaded = await downloadEvent;
    assert.equal(createHash("sha256").update(await readFile(await downloaded.path())).digest("hex"), sourceSha256);
    await page.setViewportSize({ width: 390, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByLabel("核对结论").selectOption("evidence");
    await page.getByLabel("对照原件确认的内容").fill(reviewedGraph);
    await page.getByLabel("核对依据 / 备注").fill(
      "Checked original PPTX against publisher graphic; table adjacency omits 26 native lines.");
    await page.getByRole("button", { name: "保存本条审核" }).click();
    await expect(page.getByText("已保存修订 1。", { exact: true })).toBeVisible();
    const judgment = (await options.admin.query<{ revision: number; decision: string; evidence_text: string }>(
      "select revision,decision,evidence_text from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and block_id='slide-1-table-1'",
      [options.userId, jobId])).rows[0];
    assert.deepEqual(judgment, { revision: 1, decision: "evidence", evidence_text: reviewedGraph });
    await expect(page.getByRole("button", { name: "完成审核并提交后续处理" })).toBeEnabled();
    await page.getByRole("button", { name: "完成审核并提交后续处理" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    assert.equal((await options.admin.query(
      "select count(*)::int as n from knowledge_upload_review_completion where owner_id=$1 and job_id=$2",
      [options.userId, jobId])).rows[0].n, 1);
    assert.equal(JSON.stringify((await options.admin.query(
      "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows), pointerBefore);
    return { sourceSha256, visualObjects: 1, originalDownloadMatched: true,
      fallbackRendered: true, mobileNoHorizontalOverflow: true, browserSavedRevision: 1,
      browserCompletedReview: true, correctedGraphMatched: true, releasePointerUnchanged: true,
      independentGoldCreated: 0, modelCalls: 0 };
  } finally {
    await browser?.close();
    await rm(ownerRoot, { recursive: true, force: true });
  }
}
