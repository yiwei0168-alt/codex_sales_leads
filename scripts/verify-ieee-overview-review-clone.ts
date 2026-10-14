import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured && ["localhost", "127.0.0.1", "::1"].includes(new URL(configured).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(configured);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "tmp/ma24-independent-quarantine/ieee-80211-overview-under-development-2025.pptx";
const packagePath = "tmp/ma24-independent-quarantine/ieee-80211-overview-visual-candidates/review.json";
const reviewFiles = [
  "ma24-g14-ieee-80211-overview-object-review-2026-10-14.json",
  "ma24-g14-ieee-80211-overview-object-review-completion-2026-10-14.json",
  "ma24-g14-ieee-80211-overview-connector-resolution-2026-10-14.json",
  "ma24-g14-ieee-80211-overview-final-image-scope-2026-10-14.json",
];
type Proposed = { blockId: string; proposedDecision: "evidence" | "decoration" | "unresolved"; evidenceText?: string; reason: string };
const [source, candidateBytes, ...reviewBytes] = await Promise.all([
  readFile(sourcePath), readFile(packagePath), ...reviewFiles.map(name => readFile(`docs/evidence/${name}`)),
]);
const candidate = JSON.parse(candidateBytes.toString("utf8")) as { sourceSha256: string; extractionArtifactSha256: string; records: Array<{ blockId: string }> };
const reviews = reviewBytes.map(bytes => JSON.parse(bytes.toString("utf8")) as { sourceSha256: string; candidatePackageSha256: string; objects: Proposed[] });
assert(reviews.every(review => review.sourceSha256 === candidate.sourceSha256 && review.candidatePackageSha256 === sha256(candidateBytes)));
assert.equal(sha256(source), candidate.sourceSha256);
const proposals = new Map<string, Proposed>();
for (const review of reviews) for (const item of review.objects) proposals.set(item.blockId, item);
assert.equal(proposals.size, 39);
assert.deepEqual(new Set(proposals.keys()), new Set(candidate.records.map(record => record.blockId)));
assert.deepEqual([...proposals.values()].filter(item => item.proposedDecision === "unresolved").map(item => item.blockId), ["slide-12-visual-3"]);

const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
let jobId: string | null = null;

async function runWorker(id: string) {
  return new Promise<{ awaitingReview: number; completed: number; failed: number }>((done, reject) => {
    const child = spawn(process.execPath, ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
      "scripts/process-knowledge-upload-jobs.ts", `--job-id=${id}`, "--limit=1"],
    { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_URL: url.toString() } });
    let output = "", error = "";
    const timer = setTimeout(() => child.kill(), 240_000);
    child.stdout.on("data", part => { output += String(part); });
    child.stderr.on("data", part => { error = (error + String(part)).slice(-2000); });
    child.once("error", cause => { clearTimeout(timer); reject(cause); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(error || `worker-exit-${code}`));
      try { done(JSON.parse(output)); } catch { reject(new Error(`worker-invalid-json: ${output.slice(-300)}`)); }
    });
  });
}

try {
  const current = await pool.query<{ db: string; review_table: string | null }>(
    "select current_database() db,to_regclass('public.knowledge_upload_extraction_review')::text review_table");
  assert.equal(current.rows[0]?.db, state.database);
  assert(current.rows[0]?.review_table);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'IEEE overview clone review','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "IEEE 802.11 overview isolated review",
    originalFilename: "ieee-80211-overview-under-development-2025.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: source, visibility: "private" });
  jobId = job.id;
  const worker = await runWorker(job.id);
  assert.equal(worker.awaitingReview, 1);
  assert.equal(worker.failed, 0);
  const first = await getExtractionReview(owner, job.id);
  assert.equal(first.sourceSha256, candidate.sourceSha256);
  let artifactParity = "exact-artifact-hash";
  if (first.artifactSha256 !== candidate.extractionArtifactSha256) {
    const stored = await pool.query<{ extraction_artifact_key: string }>(
      "select extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2", [job.id, owner]);
    const livePath = resolve(stored.rows[0].extraction_artifact_key);
    assert(livePath.startsWith(ownerRoot + sep));
    const [offline, live] = await Promise.all([
      readFile("tmp/ma24-independent-quarantine/ieee-80211-overview-product-extraction.json"), readFile(livePath),
    ]);
    assert.equal(sha256(offline), candidate.extractionArtifactSha256);
    const oldJson = JSON.parse(offline.toString("utf8"));
    const newJson = JSON.parse(live.toString("utf8"));
    const oldBlocks = oldJson.documents[0].blocks;
    const newBlocks = newJson.documents[0].blocks;
    const differingTopLevel = [...new Set([...Object.keys(oldJson), ...Object.keys(newJson)])]
      .filter(key => JSON.stringify(oldJson[key]) !== JSON.stringify(newJson[key]));
    const differingDocumentFields = [...new Set([...Object.keys(oldJson.documents[0]), ...Object.keys(newJson.documents[0])])]
      .filter(key => JSON.stringify(oldJson.documents[0][key]) !== JSON.stringify(newJson.documents[0][key]));
    assert.deepEqual(differingTopLevel, ["documents"]);
    assert.deepEqual(differingDocumentFields, ["storageKey"]);
    assert.equal(oldJson.extractorVersion, newJson.extractorVersion);
    assert.equal(oldBlocks.length, 268);
    assert.equal(sha256(Buffer.from(JSON.stringify(oldBlocks))), sha256(Buffer.from(JSON.stringify(newBlocks))));
    artifactParity = "identical-blocks-storage-key-only-difference";
  }
  assert.equal(first.total, 39);
  const ids: string[] = [];
  for (let offset = 0; offset < first.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    ids.push(...page.blocks.map(item => item.block.id));
  }
  assert.deepEqual(new Set(ids), new Set(proposals.keys()));
  assert.equal(ids.length, proposals.size);
  for (const id of ids) {
    const proposal = proposals.get(id)!;
    await recordExtractionReview(owner, { jobId: job.id, artifactSha256: first.artifactSha256,
      blockId: id, expectedRevision: 0, decision: proposal.proposedDecision,
      evidenceText: proposal.proposedDecision === "evidence" ? proposal.evidenceText : "", note: proposal.reason });
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, 38);
  const rows = await pool.query<{ decision: string; count: number }>(
    "select decision,count(*)::int count from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 group by decision", [owner, job.id]);
  assert.deepEqual(Object.fromEntries(rows.rows.map(row => [row.decision, row.count])),
    { evidence: 16, decoration: 22, unresolved: 1 });
  await assert.rejects(() => completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256), /未解决/);
  await assert.rejects(() => registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2 }), /Unresolved extraction/);
  const after = await pool.query<{ reviews: number; completions: number; documents: number; status: string; error_code: string }>(`
    select (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1 and job_id=$2) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents,
      status,error_code from knowledge_upload_job where id=$2`, [owner, job.id]);
  assert.deepEqual(after.rows[0], { reviews: 39, completions: 0, documents: 0, status: "extracted", error_code: "extraction-review-required" });
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: first.sourceSha256, artifactSha256: first.artifactSha256,
    artifactParity,
    reviewTotal: first.total, reviewResolved: reviewed.resolved, decisions: { evidence: 16, decoration: 22, unresolved: 1 },
    completionRejected: true, registrationRejected: true, completionReceipts: 0, documents: 0,
    externalCalls: 0, modelCalls: 0, qualityAccepted: false }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("delete from app_user where id=$1", [owner]);
  const residue = await pool.query<{ users: number; jobs: number; reviews: number }>(`
    select (select count(*)::int from app_user where id=$1) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews`, [owner]);
  assert.deepEqual(residue.rows[0], { users: 0, jobs: 0, reviews: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep), "Refusing cleanup outside synthetic upload root");
    await rm(file, { force: true, recursive: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
}
