import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob, listKnowledgeUploadJobs } from "../src/lib/knowledge/upload";
import { getExtractionReview } from "../src/lib/knowledge/extraction-review";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";

nextEnv.loadEnvConfig(process.cwd());
const configuredUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configuredUrl, "Local database URL required");
const url = new URL(configuredUrl);
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Local PostgreSQL required");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database), "Unexpected clone database name");
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
let jobId: string | null = null;

async function runWorker(id: string): Promise<{ awaitingReview: number; completed: number; failed: number }> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [
      "--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
      "scripts/process-knowledge-upload-jobs.ts", `--job-id=${id}`, "--limit=1",
    ], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: url.toString() } });
    let output = "", error = "";
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdout.on("data", chunk => { output += String(chunk); });
    child.stderr.on("data", chunk => { error = (error + String(chunk)).slice(-2000); });
    child.once("error", cause => { clearTimeout(timer); reject(cause); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(error || `worker-exit-${code}`));
      try { resolveResult(JSON.parse(output) as { awaitingReview: number; completed: number; failed: number }); }
      catch { reject(new Error(`worker-invalid-json: ${output.slice(-300)}`)); }
    });
  });
}

try {
  const database = await pool.query<{ name: string }>("select current_database() as name");
  assert.equal(database.rows[0]?.name, state.database);
  const schema = await pool.query<{ review: string | null }>("select to_regclass('knowledge_upload_extraction_review')::text as review");
  assert(schema.rows[0]?.review, "Clone review schema unavailable");
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'EU XLSX clone check','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  const bytes = await readFile("tmp/ma24-independent-quarantine/eu-connectivity-kpis-2026.xlsx");
  const job = await createKnowledgeUploadJob(owner, {
    collection: "industry", title: "EU XLSX local review check",
    originalFilename: "eu-connectivity-kpis-2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes, visibility: "private",
  });
  jobId = job.id;
  const worker = await runWorker(job.id);
  assert.equal(worker.awaitingReview, 1);
  assert.equal(worker.completed, 0);
  assert.equal(worker.failed, 0);
  const stored = await pool.query<{ status: string; error_code: string; published_document_id: string | null;
    source_sha256: string; metrics: { unresolvedBlocks?: number; qualitySummary?: Record<string, number> } }>(
      "select status,error_code,published_document_id,source_sha256,metrics from knowledge_upload_job where id=$1", [job.id]);
  const row = stored.rows[0];
  assert.equal(row.status, "extracted");
  assert.equal(row.error_code, "extraction-review-required");
  assert.equal(row.published_document_id, null);
  assert.equal(row.source_sha256, "2ba1b1af51b4d27a703e4e5495ec89724d26bd6584a6b56244d8ecb7f54e079a");
  assert.equal(row.metrics.unresolvedBlocks, 4);
  assert.deepEqual(row.metrics.qualitySummary, { blank: 0, failed: 0, success: 3, "pending-ocr": 3 });
  assert.equal((await listKnowledgeUploadJobs(owner)).find(item => item.id === job.id)?.treeStatus, "review-required");
  const review = await getExtractionReview(owner, job.id);
  assert.equal(review.total, 4);
  assert.equal(review.resolved, 0);
  await assert.rejects(() => registerVectorlessUpload(owner, job.id, { language: "und", authorityLevel: 2 }),
    /Unresolved extraction/);
  const documents = await pool.query<{ count: number }>("select count(*)::int as count from knowledge_document where owner_id=$1", [owner]);
  assert.equal(documents.rows[0]?.count, 0);
  console.log(JSON.stringify({ cloneOnly: true, candidate: "EU connectivity XLSX", sourceSha256: row.source_sha256,
    worker, qualitySummary: row.metrics.qualitySummary, unresolvedBlocks: row.metrics.unresolvedBlocks,
    reviewTotal: review.total, reviewResolved: review.resolved, treeStatus: "review-required",
    registrationRejected: true, publishedDocuments: 0, externalCalls: 0, modelCalls: 0 }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("delete from app_user where id=$1", [owner]);
  const remaining = await pool.query<{ users: number; jobs: number; reviews: number }>(`select
    (select count(*)::int from app_user where id=$1) as users,
    (select count(*)::int from knowledge_upload_job where user_id=$1) as jobs,
    (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) as reviews`, [owner]);
  assert.deepEqual(remaining.rows[0], { users: 0, jobs: 0, reviews: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep), "Refusing cleanup outside synthetic upload root");
    await rm(file, { force: true, recursive: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
  await assert.rejects(() => stat(ownerRoot), { code: "ENOENT" });
}
