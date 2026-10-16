import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, getExtractionReviewImage, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";
import { readEvidence, searchDocuments } from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured && ["localhost", "127.0.0.1", "::1"].includes(new URL(configured).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(configured);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "tmp/ma24-independent-quarantine/fcc-mba-thirteenth-report.pdf";
const offlineArtifactPath = "tmp/ma24-independent-quarantine/fcc-mba-thirteenth.layout-v2.0.10.extraction.json";
const originalCandidatePath = "tmp/ma24-independent-quarantine/fcc-mba-thirteenth-visual-review/review.json";
const manifestPath = "tmp/ma24-independent-quarantine/fcc-mba-thirteenth-page-decisions-v1.json";
const [source, offlineArtifactBytes, originalCandidateBytes, manifestBytes] = await Promise.all(
  [sourcePath, offlineArtifactPath, originalCandidatePath, manifestPath].map(path => readFile(path)));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  sourceSha256: string; extractionArtifactSha256: string; renderPackageSha256: string;
  judgments: Array<{ blockId: string; decision: "evidence" | "decoration"; evidenceText: string; note: string }>;
};
assert.equal(sha(source), manifest.sourceSha256);
assert.equal(sha(originalCandidateBytes), manifest.renderPackageSha256);
assert.equal(sha(offlineArtifactBytes), manifest.extractionArtifactSha256);
assert.equal(manifest.judgments.length, 62);
assert.deepEqual(Object.fromEntries(manifest.judgments.reduce((counts, item) =>
  counts.set(item.decision, (counts.get(item.decision) || 0) + 1), new Map<string, number>())),
  { evidence: 46, decoration: 16 });
assert.equal(manifest.judgments.find(item => item.blockId === "page-20-visual-review")?.decision, "evidence");
const oldBlocks = (JSON.parse(offlineArtifactBytes.toString("utf8")) as { documents: Array<{ blocks: unknown[] }> }).documents[0].blocks;
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID(), other = randomUUID();
const ownerRoot = resolve("knowledge", "uploads", owner);
assert(ownerRoot.startsWith(resolve("knowledge", "uploads") + sep));
let jobId: string | null = null;

function runWorker(id: string) {
  return new Promise<{ awaitingReview: number; failed: number }>((done, reject) => {
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
  assert.equal((await pool.query("select current_database() name")).rows[0].name, state.database);
  for (const id of [owner, other]) await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'FCC MBA isolated review','!','member','active')",
    [id, `${id}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "FCC Thirteenth Measuring Broadband America report isolated review",
    originalFilename: "fcc-mba-thirteenth-report.pdf", mimeType: "application/pdf", bytes: source,
    visibility: "private" });
  jobId = job.id;
  const worker = await runWorker(job.id);
  assert.equal(worker.awaitingReview, 1);
  assert.equal(worker.failed, 0);
  const stored = (await pool.query<{ extraction_artifact_key: string; error_code: string }>(
    "select extraction_artifact_key,error_code from knowledge_upload_job where id=$1", [job.id])).rows[0];
  assert.equal(stored.error_code, "extraction-review-required");
  const liveArtifactBytes = await readFile(resolve(stored.extraction_artifact_key));
  const liveArtifact = JSON.parse(liveArtifactBytes.toString("utf8")) as { documents: Array<{ blocks: unknown[] }> };
  assert.deepEqual(liveArtifact.documents[0].blocks, oldBlocks);
  const first = await getExtractionReview(owner, job.id);
  assert.equal(first.total, 62);
  assert.equal(first.artifactSha256, sha(liveArtifactBytes));
  const candidate = JSON.parse(originalCandidateBytes.toString("utf8")) as {
    extractionArtifactSha256: string; records: Array<{ blockId: string; imageFile: string }>;
  };
  candidate.extractionArtifactSha256 = first.artifactSha256;
  const candidateDir = resolve(ownerRoot, `${job.id}.visual-source-bound`);
  assert(candidateDir.startsWith(ownerRoot + sep));
  await mkdir(candidateDir, { recursive: true });
  const imageNames = new Set(candidate.records.map(record => record.imageFile));
  assert.equal(imageNames.size, 62);
  for (const name of imageNames) {
    assert(/^[a-f0-9]{64}\.png$/.test(name));
    await copyFile(resolve("tmp/ma24-independent-quarantine/fcc-mba-thirteenth-visual-review", name), resolve(candidateDir, name));
  }
  const candidateKey = `knowledge/uploads/${owner}/${job.id}.visual-source-bound/review.json`;
  const candidateBytes = Buffer.from(JSON.stringify(candidate));
  await writeFile(resolve(candidateKey), candidateBytes, { flag: "wx" });
  await pool.query("update knowledge_upload_job set metrics=metrics||$2::jsonb where id=$1", [job.id,
    JSON.stringify({ visualReviewKey: candidateKey, visualReviewSha256: sha(candidateBytes) })]);
  const ready = await getExtractionReview(owner, job.id);
  assert.equal(ready.visualState, "ready");
  const ids: string[] = [];
  for (let offset = 0; offset < ready.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    ids.push(...page.blocks.map(item => item.block.id));
  }
  assert.deepEqual(new Set(ids), new Set(manifest.judgments.map(item => item.blockId)));
  for (const item of manifest.judgments) await recordExtractionReview(owner, {
    jobId: job.id, artifactSha256: first.artifactSha256, blockId: item.blockId, expectedRevision: 0,
    decision: item.decision, evidenceText: item.evidenceText, note: item.note,
  });
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.pendingResolved, 62);
  const decisions = (await pool.query<{ decision: string; count: number }>(
    "select decision,count(*)::int count from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 group by decision",
    [owner, job.id])).rows;
  assert.deepEqual(Object.fromEntries(decisions.map(row => [row.decision, row.count])), { evidence: 46, decoration: 16 });
  const image = await getExtractionReviewImage(owner, job.id, first.artifactSha256, "page-20-visual-review");
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const receipt = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: manifest.sourceSha256 });
  assert.equal(registered.treeStatus, "searchable");
  const targetBlocks = [
    { blockId: "page-8-block-4", page: 8, excerpt: "September and October 2022" },
    { blockId: "page-18-block-4", page: 18, excerpt: "10 packets/second" },
    { blockId: "page-19-block-2", page: 19, excerpt: "Chart 6: Idle Latency by ISP" },
    { blockId: "page-19-block-6", page: 19, excerpt: "shown anonymized" },
    { blockId: "page-19-block-8", page: 19, excerpt: "first year we report latency under load" },
    { blockId: "page-20-visual-review", page: 20, excerpt: "Chart 7 visual comparison of idle latency" },
  ];
  for (const target of targetBlocks) {
    const nodes: Array<{ id: string }> = (await pool.query<{ id: string }>(`select id from knowledge_tree_node where version_id=$1
      and node_kind='evidence' and source_location->>'blockId'=$2`,
    [registered.versionId, target.blockId])).rows;
    assert.equal(nodes.length, 1, `expected one evidence node for ${target.blockId}`);
    const evidence = await readEvidence(owner, nodes[0].id, ["industry"]);
    assert(evidence?.content.includes(target.excerpt), `missing source excerpt for ${target.blockId}`);
    assert.equal(evidence.source_location.unitIndex, target.page);
    assert.equal(await readEvidence(other, nodes[0].id, ["industry"]), null);
  }
  const search = await searchDocuments(owner, "idle latency under load packets", { collections: ["industry"] });
  assert(search.some(item => item.documentId === registered.documentId));
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: manifest.sourceSha256,
    extractorVersion: first.extractorVersion, artifactSha256: first.artifactSha256,
    originalCandidateImagesRebound: imageNames.size, reviewSavedAndReadBack: 62,
    decisions: { evidence: 46, decoration: 16 }, page20Evidence: true, completionReceipt: true,
    treeStatus: registered.treeStatus, citedPages: [8, 18, 19, 20], targetEvidenceBlocks: targetBlocks.length,
    searchFound: true,
    otherAccountDenied: true, modelCalls: 0, externalCalls: 0, qualityAccepted: false, goldCreated: 0 }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=any($1::uuid[])", [[owner, other]]);
  const residue = (await pool.query<{ users: number; jobs: number; reviews: number; documents: number }>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`, [owner, [owner, other]])).rows[0];
  assert.deepEqual(residue, { users: 0, jobs: 0, reviews: 0, documents: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const path = resolve(ownerRoot, name);
    assert(path.startsWith(ownerRoot + sep));
    await rm(path, { recursive: true, force: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
}
