/** Verify the line-bearing PPTX table waits for source review and indexes only the reviewed graph. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm, rmdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, getExtractionReviewOriginal,
  recordExtractionReview } from "../src/lib/knowledge/extraction-review";
import { readEvidence, searchDocuments } from "../src/lib/knowledge/vectorless";
import { registerVectorlessUpload } from "../src/lib/knowledge/vectorless-registration";
import { runBoundedLocalProcess } from "./lib/run-bounded-local-process";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(base && ["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(base);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID(), other = randomUUID();
const ownerRoot = resolve("knowledge/uploads", owner);
assert(ownerRoot.startsWith(resolve("knowledge/uploads") + sep) && basename(ownerRoot) === owner);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = (script: string, jobId: string) => runBoundedLocalProcess(process.execPath,
  ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx", script,
    `--job-id=${jobId}`, "--limit=1"], 300_000);
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

try {
  assert.equal((await pool.query<{ database: string }>("select current_database() database")).rows[0]?.database,
    state.database);
  const original = await readFile("tmp/ma24-independent-quarantine/thoth-metadata-overview-2026.pptx");
  const publisherPng = await readFile("tmp/ma24-independent-quarantine/thoth-metadata-overview-2026-publisher.png");
  assert.equal(sha(original), "a3fa61e4fb6218994c2a8ca8f9063056ae61dfc406534956b13c09e8424b9798");
  assert.equal(sha(publisherPng), "52e3c8f8e3ec12b616658f6f8cb51ab2045ddfae340ef63d2478e2853682d514");
  const offline = JSON.parse(await readFile(
    "tmp/ma24-independent-quarantine/thoth-metadata-overview-2026.layout-v2.0.10.extraction.json", "utf8"));
  assert.equal(offline.documents[0].sourceSha256, sha(original));
  assert.equal(offline.documents[0].blocks[0].id, "slide-1-table-1");
  assert.equal(offline.documents[0].blocks[0].quality, "pending-ocr");
  assert.equal(offline.documents[0].blocks[0].metadata.reviewReason, "table-with-native-lines");
  for (const id of [owner, other]) await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Thoth PPTX clone','!','member','active')",
    [id, `${id}@example.invalid`]);
  const pointers = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  const job = await createKnowledgeUploadJob(owner, {
    collection: "industry", title: "Thoth native-line table development review",
    originalFilename: "thoth-metadata-overview-2026.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: original, visibility: "private",
    sourceUrl: "https://zenodo.org/records/18173982",
  });
  await run("scripts/process-knowledge-upload-jobs.ts", job.id);
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
  await run("scripts/process-upload-visual-queue.ts", job.id);
  const review = await getExtractionReview(owner, job.id);
  assert.equal(review.total, 1);
  const block = review.blocks[0];
  assert.equal(block.block.id, "slide-1-table-1");
  assert.equal(block.block.quality, "pending-ocr");
  assert(block.candidate);
  assert.equal(block.candidate.imageFile, undefined);
  const downloadable = await getExtractionReviewOriginal(owner, job.id, review.artifactSha256);
  assert.equal(sha(downloadable.bytes), sha(original));
  await assert.rejects(() => getExtractionReviewOriginal(other, job.id, review.artifactSha256));
  await recordExtractionReview(owner, {
    jobId: job.id, artifactSha256: review.artifactSha256, blockId: block.block.id,
    expectedRevision: 0, decision: "evidence", evidenceText: reviewedGraph,
    note: "Verified the original one-slide PPTX and the publisher-matching PNG. The raw three-column table joins unrelated adjacent nodes because it omits 26 native lines; preserve only the drawn connections.",
  });
  const resolved = await getExtractionReview(owner, job.id);
  assert.equal(resolved.resolved, 1);
  const completed = await completeExtractionReview(owner, job.id,
    resolved.artifactSha256, resolved.decisionSha256);
  assert.equal(completed.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, {
    language: "en", authorityLevel: 2, expectedSourceSha256: sha(original),
  });
  assert.equal(registered.treeStatus, "searchable");
  const node = (await pool.query<{ id: string; title: string; content: string; source_location: Record<string, unknown> }>(`
    select id,title,content,source_location from knowledge_tree_node
    where version_id=$1 and node_kind='evidence' and title='slide-1-table-1'`,
    [registered.versionId])).rows[0];
  assert(node);
  assert.equal(node.source_location.unitIndex, 1);
  const found = await readEvidence(owner, node.id, ["industry"]);
  assert(found);
  assert.equal(found.source_sha256, sha(original));
  for (const expected of ["CSV and BibTeX -> Thoth", "ONIX 2.1 -> EBSCOHost",
    "ONIX 3.0 -> Project MUSE", "KBART -> OCLC", "XML for DOI Deposit -> Crossref"])
    assert(found.content.includes(expected), expected);
  assert(!found.content.includes("BibTeX -> EBSCOHost"));
  assert(!found.content.includes("BibTeX | EBSCOHost"));
  assert((await searchDocuments(owner, "Thoth native-line table", { collections: ["industry"] }))
    .some(row => row.documentId === registered.documentId));
  assert.equal(await readEvidence(other, node.id, ["industry"]), null);
  assert(!(await searchDocuments(other, "Thoth native-line table", { collections: ["industry"] }))
    .some(row => row.documentId === registered.documentId));
  assert.equal(JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows), pointers);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: sha(original),
    pendingTableReviewed: true, originalDownloadRead: true, sourceGraphTranscribed: true,
    falseAdjacentRowOmitted: true, registered: true, slideNumber: 1,
    ownerReadAndSearch: true, otherAccountDenied: true, v3PointersUnchanged: true,
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
