/** Read-only quality inspection of a held-out PPTX after local upload extraction on a disposable clone. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { evidenceText, type Block } from "../src/lib/knowledge/extracted-tree";
import { getExtractionReview } from "../src/lib/knowledge/extraction-review";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured && ["localhost", "127.0.0.1", "::1"].includes(new URL(configured).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(configured);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();

const sourcePath = "tmp/ma24-independent-quarantine/zbw-2025-open-science.pptx";
const source = await readFile(sourcePath);
const sourceSha256 = createHash("sha256").update(source).digest("hex");
assert.equal(sourceSha256, "595df78e84768ec588a9d638366c69064c63139bdb43fea3445500ac7fd63bde");
const owner = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
const pool = new Pool({ connectionString: url.toString() });
let jobId: string | undefined;

async function runWorker(id: string): Promise<unknown> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
      "scripts/process-knowledge-upload-jobs.ts", `--job-id=${id}`, "--limit=1"], {
      cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: url.toString(), DATABASE_MIGRATION_URL: url.toString(),
        OPENROUTER_API_KEY: "", KIMI_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", EXA_API_KEY: "",
        HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", part => { stdout = `${stdout}${part}`.slice(-2000); });
    child.stderr.on("data", part => { stderr = `${stderr}${part}`.slice(-2000); });
    child.once("error", reject);
    child.once("close", code => {
      if (code !== 0) return reject(new Error(`upload worker ${code}: stdout=${stdout}; stderr=${stderr}`));
      try { accept(JSON.parse(stdout)); } catch { reject(new Error(`upload worker output was not JSON: ${stdout}`)); }
    });
  });
}

try {
  const current = await pool.query<{ db: string; review_table: string | null }>(
    "select current_database() db,to_regclass('public.knowledge_upload_extraction_review')::text review_table");
  assert.equal(current.rows[0]?.db, state.database);
  assert(current.rows[0]?.review_table);
  const pointerBefore = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'ZBW isolated extraction','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "ZBW isolated PPTX extraction",
    originalFilename: "zbw-2025-open-science.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: source, visibility: "private" });
  jobId = job.id;
  const worker = await runWorker(job.id);
  const row = (await pool.query<{ status: string; error_code: string; extraction_artifact_key: string }>(
    "select status,error_code,extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2",
    [job.id, owner])).rows[0];
  assert.equal(row.status, "extracted");
  assert.equal(row.error_code, "extraction-review-required");
  const artifactPath = resolve(row.extraction_artifact_key);
  assert(artifactPath.startsWith(ownerRoot + sep));
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as { documents: Array<{ blocks: Block[] }> };
  assert.equal(artifact.documents.length, 1);
  const blocks = artifact.documents[0].blocks;
  const target = (slide: number) => blocks.filter(block => block.unitIndex === slide && block.quality === "success")
    .map(block => ({ id: block.id, text: evidenceText(block) })).filter(item => item.text);
  const slide25 = target(25), slide28 = target(28);
  const text25 = slide25.map(item => item.text).join(" ");
  const text28 = slide28.map(item => item.text).join(" ");
  assert.match(text25, /mere existence/i);
  assert.match(text28, /machine.readable/i);
  assert.match(text28, /reshare/i);
  const review = await getExtractionReview(owner, job.id);
  const pointerAfter = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  assert.equal(pointerAfter, pointerBefore);
  assert.equal((await pool.query("select count(*)::int n from knowledge_document where owner_id=$1", [owner])).rows[0].n, 0);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256, worker, blocks: blocks.length,
    successfulBlocks: blocks.filter(block => block.quality === "success").length,
    unresolvedVisualObjects: review.total, slide25, slide28,
    documentPublished: false, releasePointerUnchanged: true, productionWrites: 0, goldCreated: 0,
    answerModelCalls: 0 }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("delete from app_user where id=$1", [owner]);
  await pool.end();
  await getPool().end();
  await rm(ownerRoot, { recursive: true, force: true });
}
