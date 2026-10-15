/** Read-only cross-document candidate through a single isolated upload/review/search/read chain. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
import { readEvidence, searchDocuments } from "../src/lib/knowledge/vectorless";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";
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
const ownerRoot = resolve("knowledge/uploads", owner);
assert(ownerRoot.startsWith(resolve("knowledge/uploads") + sep) && basename(ownerRoot) === owner);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const runWorker = async (jobId: string) => runBoundedLocalProcess(process.execPath,
  ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
    "scripts/process-knowledge-upload-jobs.ts", `--job-id=${jobId}`, "--limit=1"], 300_000);
const uploads: string[] = [];

try {
  assert.equal((await pool.query<{ database: string }>("select current_database() database")).rows[0]?.database,
    state.database);
  const bpi = await readFile("tmp/ma24-independent-quarantine/bpi-march-2018.xlsx");
  const taking = await readFile("tmp/ma24-independent-quarantine/taking-part-internet-2019-20.xlsx");
  assert.equal(sha(bpi), "7d178716b667ebe66537154b0bb96f87348ccb782368b2f43920b45db9f7f5c1");
  assert.equal(sha(taking), "90eb0ed392efc2db8ab6681bcf4b9634c41f891d3df7a95bba3bf6f9457ff614");
  for (const id of [owner, other]) await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'G14 two-source clone','!','member','active')",
    [id, `${id}@example.invalid`]);
  const pointers = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);

  const bpiJob = await createKnowledgeUploadJob(owner, {
    collection: "industry", title: "BDUK March 2018 cross-document candidate",
    originalFilename: "bpi-march-2018.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: bpi, visibility: "private",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/5b053e8ee5274a2b17b217fd/Broadband_Performance_Indicator_March_2018_spreadsheet_version.xlsx",
  });
  uploads.push(bpiJob.id);
  await runWorker(bpiJob.id);
  const bpiStored = (await pool.query<{ status: string; published_document_id: string }>(
    "select status,published_document_id from knowledge_upload_job where id=$1 and user_id=$2",
    [bpiJob.id, owner])).rows[0];
  assert.equal(bpiStored.status, "registered");
  assert(bpiStored.published_document_id);
  const bpiNode = (await pool.query<{ id: string; source_location: Record<string, unknown> }>(`
    select n.id,n.source_location from knowledge_tree_node n
    join knowledge_document d on d.current_tree_version_id=n.version_id
    where d.id=$1 and n.title='sheet-1-table' and n.node_kind='evidence'`,
    [bpiStored.published_document_id])).rows[0];
  assert(bpiNode);

  const takingJob = await createKnowledgeUploadJob(owner, {
    collection: "industry", title: "Taking Part 2019/20 cross-document candidate",
    originalFilename: "taking-part-internet-2019-20.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: taking, visibility: "private",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/5f59dab4e90e071465674094/Internet.xlsx",
  });
  uploads.push(takingJob.id);
  await runWorker(takingJob.id);
  const takingStored = (await pool.query<{ status: string }>(
    "select status from knowledge_upload_job where id=$1 and user_id=$2", [takingJob.id, owner])).rows[0];
  assert.equal(takingStored.status, "extracted");
  const review = await getExtractionReview(owner, takingJob.id);
  assert.equal(review.total, 1);
  assert.equal(review.blocks[0].block.id, "sheet-1-visual-1");
  await recordExtractionReview(owner, {
    jobId: takingJob.id, artifactSha256: review.artifactSha256,
    blockId: "sheet-1-visual-1", expectedRevision: 0,
    decision: "decoration", evidenceText: "",
    note: "Original OOXML image1.png (SHA-256 ea4233d16dca3fac948730a2fd9ffe7cd7e993a0e29b2a3691b7e487995762cb) at Contents!B2 was previously visually checked: department emblem/name only, no survey data.",
  });
  const resolved = await getExtractionReview(owner, takingJob.id);
  assert.equal(resolved.resolved, 1);
  const completed = await completeExtractionReview(owner, takingJob.id,
    resolved.artifactSha256, resolved.decisionSha256);
  assert.equal(completed.readyForRegistration, true);
  const takingRegistered = await registerVectorlessUpload(owner, takingJob.id, {
    language: "en", authorityLevel: 2, expectedSourceSha256: sha(taking),
  });
  assert.equal(takingRegistered.treeStatus, "searchable");
  const takingNode = (await pool.query<{ id: string; source_location: Record<string, unknown> }>(`
    select id,source_location from knowledge_tree_node
    where version_id=$1 and node_kind='evidence' and title='sheet-3-table'`,
    [takingRegistered.versionId])).rows[0];
  assert(takingNode);

  const bpiFound = await searchDocuments(owner, "BDUK March 2018", { collections: ["industry"] });
  const takingFound = await searchDocuments(owner, "Taking Part 2019/20", { collections: ["industry"] });
  assert(bpiFound.some(row => row.documentId === bpiStored.published_document_id));
  assert(takingFound.some(row => row.documentId === takingRegistered.documentId));
  const bpiEvidence = await readEvidence(owner, bpiNode.id, ["industry"]);
  const takingEvidence = await readEvidence(owner, takingNode.id, ["industry"]);
  assert(bpiEvidence && takingEvidence);
  assert.equal(bpiEvidence.source_sha256, sha(bpi));
  assert.equal(takingEvidence.source_sha256, sha(taking));
  assert.equal(bpiEvidence.source_location.sheetName, "Sheet1");
  assert.equal(takingEvidence.source_location.sheetName, "Table 2");
  for (const value of ["B26: 4852808", "D26: 7934", "A28:"])
    assert(bpiEvidence.content.includes(value), value);
  for (const value of ["B2:", "B7:", "B22: North East", "C22: 74", "B28: London", "C28: 80.3",
    "B33: Rural", "C33: 75.6"])
    assert(takingEvidence.content.includes(value), value);
  assert.equal(await readEvidence(other, bpiNode.id, ["industry"]), null);
  assert.equal(await readEvidence(other, takingNode.id, ["industry"]), null);
  assert(!(await searchDocuments(other, "BDUK March 2018", { collections: ["industry"] }))
    .some(row => row.documentId === bpiStored.published_document_id));
  assert(!(await searchDocuments(other, "Taking Part 2019/20", { collections: ["industry"] }))
    .some(row => row.documentId === takingRegistered.documentId));
  assert.equal(JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows), pointers);
  console.log(JSON.stringify({ cloneOnly: true, bothOriginalHashesMatched: true,
    actualUploadWorkerJobs: 2, registeredDocuments: 2, takingPartDecorationReviewSaved: true,
    sameAccountFoundBoth: true, sameAccountReadBoth: true,
    bpiEvidenceRange: bpiEvidence.source_location.cellRange,
    takingPartEvidenceRange: takingEvidence.source_location.cellRange,
    crossAccountSearchAndReadDenied: true, v3PointersUnchanged: true,
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
