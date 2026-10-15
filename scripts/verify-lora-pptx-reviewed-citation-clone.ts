/** Apply reviewed LoRa PPTX visual proposals on an existing local clone and check source reads. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool, type QueryResult } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
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
const source = await readFile("tmp/ma24-independent-quarantine/zenodo-lora-cansat-2026.pptx");
const offlineBytes = await readFile("tmp/ma24-independent-quarantine/zenodo-lora-cansat-2026.layout-v2.0.10.extraction.json");
const review = JSON.parse(await readFile(
  "docs/evidence/ma24-g14-zenodo-lora-visual-object-review-2026-10-15.json", "utf8")) as {
  sourceSha256: string; extractionSha256: string; pendingBlockCount: number;
  proposedEvidenceCount: number; proposedDecorationCount: number;
  decisionGroups: Array<{ blockIds: string[]; proposedDecision: "evidence" | "decoration";
    reviewText?: string; reason: string }>;
};
assert.equal(sha(source), review.sourceSha256);
assert.equal(sha(offlineBytes), review.extractionSha256);
const offline = JSON.parse(offlineBytes.toString("utf8")) as {
  extractorVersion: string; documents: Array<{ blocks: Array<{ id: string; quality: string }> }>;
};
const proposals = new Map(review.decisionGroups.flatMap(group => group.blockIds.map(blockId => [blockId, group] as const)));
assert.equal(proposals.size, review.pendingBlockCount);
assert.deepEqual(new Set(offline.documents[0].blocks.filter(block => block.quality === "pending-ocr").map(block => block.id)),
  new Set(proposals.keys()));
assert.equal([...proposals.values()].filter(group => group.proposedDecision === "evidence").length,
  review.proposedEvidenceCount);
assert.equal([...proposals.values()].filter(group => group.proposedDecision === "decoration").length,
  review.proposedDecorationCount);

const owner = randomUUID();
const other = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
const pool = new Pool({ connectionString: url.toString() });
let jobId: string | undefined;
let ownerCreated = false;
let otherCreated = false;

async function runWorker(id: string) {
  return new Promise<unknown>((accept, reject) => {
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
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'LoRa review clone','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  ownerCreated = true;
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'LoRa other clone','!','member','active')",
    [other, `${other}@example.invalid`]);
  otherCreated = true;
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "CanSat LoRa reviewed PPTX clone",
    originalFilename: "zenodo-lora-cansat-2026.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: source, visibility: "private" });
  jobId = job.id;
  const worker = await runWorker(job.id);
  const jobRow = (await pool.query<{ status: string; error_code: string; extraction_artifact_key: string }>(
    "select status,error_code,extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2",
    [job.id, owner])).rows[0];
  assert.equal(jobRow.status, "extracted");
  assert.equal(jobRow.error_code, "extraction-review-required");
  const livePath = resolve(jobRow.extraction_artifact_key);
  assert(livePath.startsWith(ownerRoot + sep));
  const live = JSON.parse(await readFile(livePath, "utf8"));
  assert.equal(live.extractorVersion, offline.extractorVersion);
  assert.deepEqual(live.documents[0].blocks, offline.documents[0].blocks);
  const first = await getExtractionReview(owner, job.id);
  assert.equal(first.total, review.pendingBlockCount);
  const ids: string[] = [];
  for (let offset = 0; offset < first.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    ids.push(...page.blocks.map(item => item.block.id));
  }
  assert.deepEqual(new Set(ids), new Set(proposals.keys()));
  for (const id of ids) {
    const proposal = proposals.get(id)!;
    await recordExtractionReview(owner, { jobId: job.id, artifactSha256: first.artifactSha256,
      blockId: id, expectedRevision: 0, decision: proposal.proposedDecision,
      evidenceText: proposal.reviewText ?? "", note: proposal.reason });
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, review.pendingBlockCount);
  const decisions = (await pool.query<{ decision: string; count: number }>(
    "select decision,count(*)::int count from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 group by decision",
    [owner, job.id])).rows;
  assert.deepEqual(Object.fromEntries(decisions.map(item => [item.decision, item.count])),
    { evidence: review.proposedEvidenceCount, decoration: review.proposedDecorationCount });
  const completion = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(completion.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: review.sourceSha256 });
  assert.equal(registered.treeStatus, "searchable");
  const targets = [
    { id: "slide-13-text-6", slide: 13, phrase: "Sensors" },
    { id: "slide-13-text-3", slide: 13, phrase: "Microcontroller" },
    { id: "slide-13-text-2", slide: 13, phrase: "LoRa Radio" },
    { id: "slide-13-text-1", slide: 13, phrase: "Ground Station" },
    { id: "slide-13-visual-7", slide: 13, phrase: "Sensors GPS/BMP180" },
    { id: "slide-15-text-7", slide: 15, phrase: "Build Packet + CRC" },
    { id: "slide-15-text-13", slide: 15, phrase: "Decode + Deliver Payload" },
    { id: "slide-15-text-16", slide: 15, phrase: "Display + Store" },
    { id: "slide-15-visual-3", slide: 15, phrase: "Read Sensors" },
  ];
  const cited: string[] = [];
  for (const target of targets) {
    const nodes: QueryResult<{ id: string }> = await pool.query<{ id: string }>(
      "select id from knowledge_tree_node where version_id=$1 and node_kind='evidence' and source_location->>'blockId'=$2",
      [registered.versionId, target.id]);
    assert.equal(nodes.rowCount, 1, target.id);
    const evidence = await readEvidence(owner, nodes.rows[0].id, ["industry"]);
    assert(evidence, target.id);
    assert.equal(evidence.source_sha256, review.sourceSha256);
    assert.equal(evidence.source_location.unitIndex, target.slide);
    assert.equal(evidence.source_location.blockId, target.id);
    assert(evidence.content.toLowerCase().includes(target.phrase.toLowerCase()), target.id);
    assert.equal(await readEvidence(other, nodes.rows[0].id, ["industry"]), null);
    cited.push(target.id);
  }
  const hits = await searchDocuments(owner, "CanSat LoRa telemetry", { collections: ["industry"] });
  assert(hits.some(item => item.documentId === registered.documentId));
  const pointerAfter = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  assert.equal(pointerAfter, pointerBefore);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: review.sourceSha256,
    offlineExtractionSha256: review.extractionSha256, liveArtifactBlockParity: true, worker,
    reviewSaved: ids.length, reviewComplete: true, evidence: review.proposedEvidenceCount,
    decoration: review.proposedDecorationCount, treeStatus: registered.treeStatus, citedBlockIds: cited,
    crossAccountDenied: true, searchFound: true, v3ReleasePointerUnchanged: true,
    productionWrites: 0, goldCreated: 0, answerModelCalls: 0, userVisibleAnswerAccepted: false }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  if (otherCreated) await pool.query("delete from app_user where id=$1", [other]);
  if (ownerCreated) await pool.query("delete from app_user where id=$1", [owner]);
  const residue = await pool.query<{ users: number; jobs: number; reviews: number; completions: number; documents: number }>(`
    select (select count(*)::int from app_user where id=any($1::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$2) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$2) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$2) completions,
      (select count(*)::int from knowledge_document where owner_id=$2) documents`, [[owner, other], owner]);
  assert.deepEqual(residue.rows[0], { users: 0, jobs: 0, reviews: 0, completions: 0, documents: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep));
    await rm(file, { recursive: true, force: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
}
