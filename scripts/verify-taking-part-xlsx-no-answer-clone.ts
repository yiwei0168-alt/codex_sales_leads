/** Isolated upload and review of a cross-sheet no-answer candidate. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";
import { readEvidence } from "../src/lib/knowledge/vectorless";
import { runBoundedLocalProcess } from "./lib/run-bounded-local-process";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured && ["localhost", "127.0.0.1", "::1"].includes(new URL(configured).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(configured);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID(), other = randomUUID();
const uploadRoot = resolve("knowledge/uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
const sourcePath = "tmp/ma24-independent-quarantine/taking-part-internet-2019-20.xlsx";
const offlinePath = "tmp/ma24-independent-quarantine/taking-part-extract.json";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

try {
  const current = await pool.query<{ database: string }>("select current_database() database");
  assert.equal(current.rows[0]?.database, state.database);
  const original = await readFile(sourcePath);
  const originalHash = sha(original);
  assert.equal(originalHash, "90eb0ed392efc2db8ab6681bcf4b9634c41f891d3df7a95bba3bf6f9457ff614");
  const offline = JSON.parse(await readFile(offlinePath, "utf8"));
  assert.equal(offline.documents[0].sourceSha256, originalHash);
  assert.equal(offline.extractorVersion, "layout-v2.0.10");
  assert.deepEqual(offline.documents[0].blocks.map((block: { id: string; quality: string }) =>
    [block.id, block.quality]), [
    ["sheet-1-table", "success"], ["sheet-1-visual-1", "pending-ocr"],
    ["sheet-2-table", "success"], ["sheet-3-table", "success"], ["sheet-4-table", "success"],
  ]);
  for (const id of [owner, other]) await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Taking Part clone','!','member','active')",
    [id, `${id}@example.invalid`]);
  const pointers = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  const job = await createKnowledgeUploadJob(owner, {
    collection: "industry", title: "Taking Part internet 2019/20 isolated candidate",
    originalFilename: "taking-part-internet-2019-20.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: original, visibility: "private",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/5f59dab4e90e071465674094/Internet.xlsx",
  });
  await runBoundedLocalProcess(process.execPath, ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
    "scripts/process-knowledge-upload-jobs.ts", `--job-id=${job.id}`, "--limit=1"], 300_000);
  const stored = (await pool.query<{ status: string; extraction_artifact_key: string }>(
    "select status,extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2",
    [job.id, owner])).rows[0];
  assert.equal(stored.status, "extracted");
  const livePath = resolve(stored.extraction_artifact_key);
  assert(livePath.startsWith(ownerRoot + sep));
  const live = JSON.parse(await readFile(livePath, "utf8"));
  const normalized = structuredClone(offline);
  normalized.documents[0].storageKey = live.documents[0].storageKey;
  assert.deepEqual(live, normalized);
  await assert.rejects(() => registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2 }),
    /Unresolved extraction/);
  const review = await getExtractionReview(owner, job.id);
  assert.equal(review.total, 1);
  assert.equal(review.blocks[0].block.id, "sheet-1-visual-1");
  await recordExtractionReview(owner, {
    jobId: job.id, artifactSha256: review.artifactSha256, blockId: "sheet-1-visual-1",
    expectedRevision: 0, decision: "decoration", evidenceText: "",
    note: "Original OOXML image1.png (SHA-256 ea4233d16dca3fac948730a2fd9ffe7cd7e993a0e29b2a3691b7e487995762cb) at Contents!B2 was visually checked: it contains only the department emblem/name and no survey data.",
  });
  const resolved = await getExtractionReview(owner, job.id);
  assert.equal(resolved.resolved, 1);
  const completion = await completeExtractionReview(owner, job.id, resolved.artifactSha256,
    resolved.decisionSha256);
  assert.equal(completion.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, {
    language: "en", authorityLevel: 2, expectedSourceSha256: originalHash,
  });
  assert.equal(registered.treeStatus, "searchable");
  const blocks = (await pool.query<{ id: string; title: string; source_location: Record<string, unknown> }>(`
    select n.id,n.title,n.source_location from knowledge_tree_node n
    where n.version_id=$1 and n.node_kind='evidence' and n.title in ('sheet-3-table','sheet-4-table')
    order by n.title`, [registered.versionId])).rows;
  assert.deepEqual(blocks.map(row => row.title), ["sheet-3-table", "sheet-4-table"]);
  const rural = await readEvidence(owner, blocks[0].id, ["industry"]);
  const age = await readEvidence(owner, blocks[1].id, ["industry"]);
  assert(rural && age);
  assert.equal(rural.source_sha256, originalHash);
  assert.equal(age.source_sha256, originalHash);
  assert.equal(rural.source_location.sheetName, "Table 2");
  assert.equal(age.source_location.sheetName, "Table 3");
  assert.equal(rural.source_location.cellRange, "A1:M47");
  assert.equal(age.source_location.cellRange, "A1:R56");
  for (const value of ["B33: Rural", "C33: 75.6", "F33: 1357"])
    assert(rural.content.includes(value), value);
  for (const value of ["B15: 75+", "C15: 33.1", "F15: 557"])
    assert(age.content.includes(value), value);
  assert.equal(await readEvidence(other, blocks[0].id, ["industry"]), null);
  assert.equal(await readEvidence(other, blocks[1].id, ["industry"]), null);
  assert.equal(JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows), pointers);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: originalHash,
    extractorVersion: live.extractorVersion, decorationDecisionSaved: true,
    reviewCompleted: true, registered: true,
    citedSheets: [rural.source_location.sheetName, age.source_location.sheetName],
    citedRanges: [rural.source_location.cellRange, age.source_location.cellRange],
    targetCellsRead: 6, crossAccountDenied: true, v3PointersUnchanged: true,
    modelCalls: 0, independentGoldCreated: 0, productionKnowledgeWrites: 0 }));
} finally {
  await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=any($1::uuid[])", [[owner, other]]);
  const residue = (await pool.query<{ users: number; jobs: number; reviews: number; documents: number }>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`,
    [owner, [owner, other]])).rows[0];
  assert.deepEqual(residue, { users: 0, jobs: 0, reviews: 0, documents: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep));
    await rm(file, { recursive: true, force: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
}
