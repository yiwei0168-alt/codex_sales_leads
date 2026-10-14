import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { Client } from "pg";
import { fetch as localFetch, FormData } from "undici";

async function runLocalWorker(script: string, jobId: string, databaseUrl: string, userId?: string): Promise<void> {
  const workerArgs = [process.execPath, "--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
    script, `--job-id=${jobId}`, ...(userId ? [`--user-id=${userId}`] : ["--limit=1"])];
  const command = process.platform === "win32" ? process.env.PYTHON_BINARY?.trim() || "python" : workerArgs[0];
  const args = process.platform === "win32"
    ? ["scripts/windows-owned-process.py", String(process.pid), "180000", "--", ...workerArgs]
    : workerArgs.slice(1);
  const env = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: databaseUrl,
    OPENROUTER_API_KEY: "", KIMI_API_KEY: "", EXA_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" };
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", part => { stdout = `${stdout}${part}`.slice(-1000); });
    child.stderr.on("data", part => { stderr = `${stderr}${part}`.slice(-1000); });
    child.once("error", reject);
    child.once("close", code => {
      if (code !== 0) return reject(new Error(`Local ${script} failed with code ${code}: stdout=${stdout}; stderr=${stderr}`));
      accept();
    });
  });
}

export async function verifyMa24ReviewPageClone(options: {
  admin: Client;
  base: string;
  cookie: string;
  userId: string;
  email: string;
  password: string;
  migrationDatabaseUrl: string;
}): Promise<unknown> {
  const uploadsRoot = resolve("knowledge/uploads");
  const ownerRoot = resolve(uploadsRoot, options.userId);
  assert(ownerRoot.startsWith(`${uploadsRoot}${sep}`), "Synthetic upload path escaped storage root");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const bytes = await readFile("tmp/ma24-public-eval-candidates/itu-satellite-2025.pptx");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), "2223cee26aced9a50d648d933c31b15f2f0659d0ebe30922fca5c31c1cc30465");
    const pointerBefore = JSON.stringify((await options.admin.query(
      "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id",
    )).rows);
    const form = new FormData();
    form.set("collection", "industry");
    form.set("title", "MA24 isolated public PPTX review");
    form.set("file", new File([bytes], "satellite.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }));
    const uploaded = await localFetch(`${options.base}/api/knowledge/uploads`, {
      method: "POST", headers: { cookie: options.cookie }, body: form, signal: AbortSignal.timeout(30_000),
    });
    const uploadBody = await uploaded.json() as { id?: string; error?: string };
    assert.equal(uploaded.status, 202, `Candidate Web did not register the synthetic PPTX upload: ${uploadBody.error ?? "unknown"}`);
    const { id: jobId } = uploadBody;
    assert(jobId && /^[a-f0-9-]{36}$/.test(jobId));
    await runLocalWorker("scripts/process-knowledge-upload-jobs.ts", jobId, options.migrationDatabaseUrl);
    const job = (await options.admin.query<{ status: string; error_code: string; metrics: { unresolvedBlocks: number } }>(
      "select status,error_code,metrics from knowledge_upload_job where id=$1 and user_id=$2", [jobId, options.userId],
    )).rows[0];
    assert.equal(job.status, "extracted");
    assert.equal(job.error_code, "extraction-review-required");
    assert.equal(job.metrics.unresolvedBlocks, 63);
    await runLocalWorker("scripts/prepare-upload-visual-review.ts", jobId, options.migrationDatabaseUrl, options.userId);
    const prepared = (await options.admin.query<{ metrics: { visualReviewKey?: string } }>(
      "select metrics from knowledge_upload_job where id=$1 and user_id=$2", [jobId, options.userId],
    )).rows[0];
    assert(prepared.metrics.visualReviewKey, "Local visual candidate worker did not bind a review package");
    const reviewResponse = await fetch(`${options.base}/api/knowledge/uploads/review?jobId=${jobId}&offset=0`, {
      headers: { cookie: options.cookie }, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(reviewResponse.status, 200);
    const review = await reviewResponse.json() as {
      artifactSha256: string; total: number; blocks: Array<{ block: { id: string }; candidate?: { diagram?: unknown; connector?: unknown } }>;
    };
    assert.equal(review.total, 63);
    assert.equal(review.blocks.length, 20);
    const firstBlockId = review.blocks[0].block.id;
    assert.equal(review.blocks[2].block.id, "slide-2-visual-3");
    const diagram = review.blocks[2].candidate?.diagram;
    assert(diagram, "PPTX SmartArt candidate missing from review API");
    const connectorResponse = await fetch(`${options.base}/api/knowledge/uploads/review?jobId=${jobId}&offset=20`, {
      headers: { cookie: options.cookie }, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(connectorResponse.status, 200);
    const connectorPage = await connectorResponse.json() as { blocks: Array<{ block: { id: string }; candidate?: { connector?: unknown } }> };
    assert.equal(connectorPage.blocks[12].block.id, "slide-36-visual-5");
    const connector = connectorPage.blocks[12].candidate?.connector;
    assert(connector, "PPTX connector candidate missing from review API");

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.base });
    await page.goto(options.base);
    await page.getByLabel("登录邮箱").fill(options.email);
    await page.getByLabel("密码", { exact: true }).fill(options.password);
    const browserLogin = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login"
      && response.request().method() === "POST");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    assert.equal((await browserLogin).status(), 200, "Browser synthetic login failed");
    const session = await page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).json()) as { authenticated?: boolean };
    assert.equal(session.authenticated, true, "Browser did not retain synthetic login cookie");
    await page.goto(`${options.base}/knowledge`);
    await expect(page.getByRole("button", { name: "上传资料", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "上传资料", exact: true }).click();
    await page.getByRole("button", { name: "审核抽取内容" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("对象 1 / 63", { exact: true })).toBeVisible();
    for(let i=0;i<2;i++)await page.getByRole("button", { name: "下一对象" }).click();
    await expect(page.getByText("对象 3 / 63", { exact: true })).toBeVisible();
    const diagramDetails = page.locator(".raw-json-details").filter({ hasText: "SmartArt 原生数据（未经审核）" });
    await expect(diagramDetails).not.toHaveAttribute("open");
    await diagramDetails.locator("summary").click();
    await diagramDetails.getByRole("button", { name: "复制 JSON" }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), diagram);
    for(let i=0;i<30;i++)await page.getByRole("button", { name: "下一对象" }).click();
    await expect(page.getByText("对象 33 / 63", { exact: true })).toBeVisible();
    const connectorDetails = page.locator(".raw-json-details").filter({ hasText: "连接线原生数据（未经审核）" });
    await expect(connectorDetails).not.toHaveAttribute("open");
    await connectorDetails.locator("summary").click();
    await connectorDetails.getByRole("button", { name: "复制 JSON" }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), connector);
    await page.setViewportSize({ width: 390, height: 800 });
    assert(await connectorDetails.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await connectorDetails.getByRole("button", { name: "复制 JSON" }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), connector);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByRole("button", { name: "复核成功抽取文字" }).click();
    await expect(page.getByText("对象 1 / 216", { exact: true })).toBeVisible();
    for(let i=0;i<3;i++)await page.getByRole("button", { name: "下一对象" }).click();
    await expect(page.getByText("对象 4 / 216", { exact: true })).toBeVisible();
    await expect(page.locator("fieldset pre")).toHaveText("2");
    await page.screenshot({ path: "tmp/ma24-success-review-clone-desktop.png" });
    await page.setViewportSize({ width: 390, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "tmp/ma24-success-review-clone-mobile.png" });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByLabel("核对结论").selectOption("decoration");
    await page.getByLabel("核对依据 / 备注").fill("Synthetic page-number exclusion in an isolated clone; no document will be published.");
    await page.getByRole("button", { name: "保存本条审核" }).click();
    await expect(page.getByText("已保存修订 1。", { exact: true })).toBeVisible();
    const successDecision=(await options.admin.query<{revision:number;decision:string;evidence_text:string}>(
      "select revision,decision,evidence_text from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and block_id='slide-2-text-2'",
      [options.userId,jobId])).rows[0];
    assert.deepEqual(successDecision,{revision:1,decision:"decoration",evidence_text:""});
    await page.getByRole("button", { name: "待审核对象" }).click();
    await expect(page.getByText("对象 1 / 63", { exact: true })).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载本次原件进行对照" }).click();
    const downloaded = await downloadEvent;
    assert.equal(createHash("sha256").update(await readFile(await downloaded.path())).digest("hex"),
      createHash("sha256").update(bytes).digest("hex"), "Review original download differs from uploaded PPTX");
    const note = "Synthetic isolated page-to-database verification; content remains unresolved";
    await page.getByLabel("核对依据 / 备注").fill(note);
    await page.getByRole("button", { name: "保存本条审核" }).click();
    await expect(page.getByText("已保存修订 1。", { exact: true })).toBeVisible();
    const rows = await options.admin.query<{ revision: number; decision: string; note: string }>(
      "select revision,decision,note from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 and block_id=$3",
      [options.userId, jobId, firstBlockId],
    );
    assert.deepEqual(rows.rows, [{ revision: 1, decision: "unresolved", note }]);
    const stale = await fetch(`${options.base}/api/knowledge/uploads/review`, {
      method: "POST", headers: { cookie: options.cookie, "content-type": "application/json" },
      body: JSON.stringify({ jobId, artifactSha256: review.artifactSha256, blockId: firstBlockId,
        expectedRevision: 0, decision: "unresolved", evidenceText: "", note: "stale synthetic edit" }),
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(stale.status, 409);
    await stale.body?.cancel();
    assert.equal((await options.admin.query("select count(*)::int as n from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2", [options.userId, jobId])).rows[0].n, 2);
    const storage = (await options.admin.query<{ storage_key: string }>(
      "select storage_key from knowledge_upload_job where id=$1 and user_id=$2", [jobId, options.userId],
    )).rows[0].storage_key;
    const originalPath = resolve(storage);
    assert(originalPath.startsWith(`${ownerRoot}${sep}`), "Synthetic original escaped owner storage");
    await writeFile(originalPath, Buffer.concat([bytes, Buffer.from("changed")]));
    try {
      const staleSource = await fetch(`${options.base}/api/knowledge/uploads/review?jobId=${jobId}&offset=0`, {
        headers: { cookie: options.cookie }, signal: AbortSignal.timeout(15_000),
      });
      assert.equal(staleSource.status, 409, "Changed original was not rejected");
      await staleSource.body?.cancel();
    } finally {
      await writeFile(originalPath, bytes);
    }
    const secondPage = await fetch(`${options.base}/api/knowledge/uploads/review?jobId=${jobId}&offset=20`, {
      headers: { cookie: options.cookie }, signal: AbortSignal.timeout(15_000),
    });
    assert.equal(secondPage.status, 200);
    assert.equal(((await secondPage.json()) as { blocks: unknown[] }).blocks.length, 20);
    await page.reload();
    await page.getByRole("button", { name: "上传资料", exact: true }).click();
    await page.getByRole("button", { name: "审核抽取内容" }).click();
    await expect(page.getByLabel("核对依据 / 备注")).toHaveValue(note);
    await expect(page.getByRole("button", { name: "完成审核并提交后续处理" })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole("dialog")).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: "tmp/ma24-review-page-clone-mobile.png" });
    assert.equal((await options.admin.query("select count(*)::int as n from knowledge_document where owner_id=$1", [options.userId])).rows[0].n, 0);
    assert.equal((await options.admin.query("select count(*)::int as n from knowledge_upload_review_completion where owner_id=$1", [options.userId])).rows[0].n, 0);
    assert.equal(JSON.stringify((await options.admin.query("select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows), pointerBefore);
    return { uploadStatus: uploaded.status, localExtractionExitCode: 0,
      visualObjects: review.total, pageOpened: true, originalDownloadMatched: true,
      smartArtCopiedFromApi: true, connectorCopiedFromApi: true, connectorMobileNoOverflow: true,
      savedRevision: rows.rows[0].revision,
      databaseDecision: rows.rows[0].decision, successfulTextPageNumberExcluded: true,
      successfulTextDesktopAndMobileRendered: true, staleWriteStatus: stale.status,
      secondPageObjects: 20, refreshRestoredNote: true, mobileNoHorizontalOverflow: true,
      changedOriginalRejected: true, releasePointerUnchanged: true,
      completedReview: false, publishedDocuments: 0, cloudCredentialsClearedInWorker: true,
      workerUsageCountersCaptured: false };
  } finally {
    await browser?.close();
    await rm(ownerRoot, { recursive: true, force: true });
  }
}
