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
import { browseTree, readEvidence, searchDocuments } from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured && ["localhost", "127.0.0.1", "::1"].includes(new URL(configured).hostname));
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as { database: string };
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url = new URL(configured);
url.pathname = `/${state.database}`;
process.env.DATABASE_URL = url.toString();

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "tmp/ma24-independent-quarantine/ieee-gepof-tutorial-v14.pptx";
const packagePath = "tmp/ma24-independent-quarantine/ieee-gepof-visual-candidates/review.json";
const offlinePath = "tmp/ma24-independent-quarantine/ieee-product-extraction.json";
const names = [
  "ma24-g05-ieee-gepof-object-review-early-2026-10-14.json",
  "ma24-g05-ieee-gepof-slide16-chart-resolution-2026-10-14.json",
  "ma24-g05-ieee-gepof-formula-curve-resolution-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-24-29-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-34-43-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-45-49-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-52-54-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-58-60-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-62-64-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-68-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-70-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-71-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-72-2026-10-14.json",
  "ma24-g05-ieee-gepof-object-review-77-82-2026-10-14.json",
];
type Decision = "evidence" | "decoration" | "unresolved";
type Proposed = { blockId: string; proposedDecision: Decision; evidenceText?: string; reason: string };
const [source, candidateBytes, offlineBytes, ...reviewBytes] = await Promise.all([
  readFile(sourcePath), readFile(packagePath), readFile(offlinePath), ...names.map(name => readFile(`docs/evidence/${name}`)),
]);
const candidate = JSON.parse(candidateBytes.toString("utf8")) as {
  sourceSha256: string; extractionArtifactSha256: string; records: Array<{ blockId: string }>;
};
const reviews = reviewBytes.map(bytes => JSON.parse(bytes.toString("utf8")) as Record<string, unknown>);
assert.equal(sha256(source), candidate.sourceSha256);
assert.equal(sha256(offlineBytes), candidate.extractionArtifactSha256);
for (const review of reviews) {
  assert.equal(review.sourceSha256, candidate.sourceSha256);
  assert.equal(review.candidatePackageSha256, sha256(candidateBytes));
  if (review.extractionArtifactSha256) assert.equal(review.extractionArtifactSha256, candidate.extractionArtifactSha256);
}
const proposals = new Map<string, Proposed>();
for (const item of reviews[0].objects as Proposed[]) {
  assert(!proposals.has(item.blockId));
  proposals.set(item.blockId, item);
}
const chart = reviews[1] as { blockId: string; revisedProposal: { decision: Decision; evidenceText: string; scopeGuard: string } };
assert.equal(proposals.get(chart.blockId)?.proposedDecision, "unresolved");
proposals.set(chart.blockId, { blockId: chart.blockId, proposedDecision: chart.revisedProposal.decision,
  evidenceText: chart.revisedProposal.evidenceText, reason: chart.revisedProposal.scopeGuard });
for (const item of reviews[2].objects as Array<{ blockId: string; revisedProposal: Decision; evidenceText: string; reason: string }>) {
  assert.equal(proposals.get(item.blockId)?.proposedDecision, "unresolved");
  proposals.set(item.blockId, { blockId: item.blockId, proposedDecision: item.revisedProposal,
    evidenceText: item.evidenceText, reason: item.reason });
}
for (const item of reviews[3].objects as Proposed[]) {
  assert(!proposals.has(item.blockId));
  proposals.set(item.blockId, item);
}
for (const item of reviews[4].objects as Proposed[]) {
  assert(!proposals.has(item.blockId));
  proposals.set(item.blockId, item);
}
for (const review of reviews.slice(5)) for (const item of review.objects as Proposed[]) {
  assert(!proposals.has(item.blockId));
  proposals.set(item.blockId, item);
}
assert.equal(proposals.size, 129);
const candidateIds = new Set(candidate.records.map(record => record.blockId));
assert.equal(candidateIds.size, 129);
for (const item of proposals.values()) {
  assert(candidateIds.has(item.blockId));
  assert(item.reason.trim());
  if (item.proposedDecision === "evidence") assert(item.evidenceText?.trim());
}
assert.deepEqual(Object.fromEntries(["evidence", "decoration", "unresolved"].map(decision =>
  [decision, [...proposals.values()].filter(item => item.proposedDecision === decision).length])),
{ evidence: 107, decoration: 22, unresolved: 0 });
const nativeLineTables: Proposed[] = [
  { blockId: "slide-54-table-3", proposedDecision: "evidence", evidenceText: "The 2014 tutorial's projected schedule spans 2014–2023 and separates Automotive, O-GEAR (Japan), and IEEE 802.3 Ethernet for Automotive rows. The milestones and connecting lines require their separate slide evidence; this table alone does not establish completed events.", reason: "The original slide shows these row and year labels; the native table omits timeline connectors." },
  { blockId: "slide-58-table-2", proposedDecision: "evidence", evidenceText: "The tutorial compares POF, PCF, GOF-MM and GOF-SM. Its core diameter row reads 980, 200, 50/62.5 and 9 μm, respectively; these are values presented by the 2014 tutorial.", reason: "Headers, row alignment and units were checked against the original slide." },
  { blockId: "slide-59-table-26", proposedDecision: "decoration", reason: "The extracted table associates ControlNet with the Fieldbus header, but that association is not visible in the original slide rendering. The visible logos and their row placement are covered by separately reviewed visual blocks." },
  { blockId: "slide-60-table-5", proposedDecision: "evidence", evidenceText: "The tutorial's MICE table labels 1 as commercial, 2 as light industrial and 3 as heavy industrial. Mechanical, Ingress, Chemical and EMC rows use the corresponding M1–M3, I1–I3, C1–C3 and E1–E3 labels.", reason: "The four rows and three environment columns were checked against the original slide; this does not certify a particular installation." },
];
for (const item of nativeLineTables) { assert(!proposals.has(item.blockId)); proposals.set(item.blockId, item); }

const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID();
const other = randomUUID();
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
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'IEEE GEPOF clone review','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'GEPOF unauthorized reader','!','admin','active')",
    [other, `${other}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "IEEE GEPOF isolated partial review",
    originalFilename: "ieee-gepof-tutorial-v14.pptx",
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
    const live = JSON.parse((await readFile(livePath)).toString("utf8"));
    const old = JSON.parse(offlineBytes.toString("utf8"));
    const normalized = structuredClone(live);
    normalized.documents[0].storageKey = old.documents[0].storageKey;
    if (live.extractorVersion !== old.extractorVersion) {
      assert.equal(old.extractorVersion, "layout-v2.0.6");
      assert.equal(live.extractorVersion, "layout-v2.0.10");
      normalized.extractorVersion = old.extractorVersion;
      normalized.documents[0].extractorVersion = old.documents[0].extractorVersion;
      for (const block of normalized.documents[0].blocks) block.extractorVersion = old.extractorVersion;
    }
    for (const item of nativeLineTables) {
      const liveBlock = normalized.documents[0].blocks.find((block: { id: string }) => block.id === item.blockId);
      const oldBlock = old.documents[0].blocks.find((block: { id: string }) => block.id === item.blockId);
      assert(liveBlock && oldBlock);
      assert.equal(liveBlock.quality, "pending-ocr");
      assert.equal(liveBlock.metadata?.reviewReason, "table-with-native-lines");
      assert.equal(oldBlock.quality, "success");
      liveBlock.quality = oldBlock.quality;
      delete liveBlock.metadata;
    }
    assert.deepEqual(normalized, old);
    assert.equal(old.documents[0].blocks.length, 563);
    artifactParity = "identical-blocks-after-version-storage-key-and-four-reviewed-table-status-normalization";
  }
  assert.equal(first.total, 133);
  const ids: string[] = [];
  for (let offset = 0; offset < first.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    ids.push(...page.blocks.map(item => item.block.id));
  }
  assert.equal(ids.length, 133);
  assert.deepEqual(new Set(ids), new Set([...candidateIds, ...nativeLineTables.map(item => item.blockId)]));
  for (const id of ids) {
    const proposal = proposals.get(id);
    if (!proposal) continue;
    await recordExtractionReview(owner, { jobId: job.id, artifactSha256: first.artifactSha256,
      blockId: id, expectedRevision: 0, decision: proposal.proposedDecision,
      evidenceText: proposal.proposedDecision === "evidence" ? proposal.evidenceText : "", note: proposal.reason });
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, 133);
  let saved = 0;
  for (let offset = 0; offset < reviewed.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    for (const item of page.blocks) {
      const proposal = proposals.get(item.block.id);
      if (!proposal) { assert.equal(item.judgment, null); continue; }
      assert.equal(item.judgment?.decision, proposal.proposedDecision);
      assert.equal(item.judgment?.evidence_text ?? "", proposal.proposedDecision === "evidence" ? proposal.evidenceText : "");
      assert.equal(item.judgment?.revision, 1);
      saved++;
    }
  }
  assert.equal(saved, 133);
  const rows = await pool.query<{ decision: string; count: number }>(
    "select decision,count(*)::int count from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 group by decision", [owner, job.id]);
  assert.deepEqual(Object.fromEntries(rows.rows.map(row => [row.decision, row.count])), { evidence: 110, decoration: 23 });
  const receipt = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: sha256(source) });
  assert.equal(registered.treeStatus, "searchable");
  const checked: Array<{ slide: number; blockId: string; phrase: string }> = [];
  for (const target of [
    { slide: 5, blockId: "slide-5-text-2", phrase: "Specify operation over at least 15m of POF with 4 POF connections" },
    { slide: 22, blockId: "slide-22-text-2", phrase: "SG has not adopted technical proposals" },
  ]) {
    const rows: QueryResult<{ id: string; parent_id: string | null }> = await pool.query(`
      select id,parent_id from knowledge_tree_node where version_id=$1 and node_kind='evidence'
        and source_location->>'blockId'=$2`, [registered.versionId, target.blockId]);
    assert.equal(rows.rowCount, 1);
    const node = rows.rows[0];
    const siblings = await browseTree(owner, registered.documentId, node.parent_id, 0, 200, ["industry"]);
    assert(siblings.some(item => item.id === node.id));
    const evidence = await readEvidence(owner, node.id, ["industry"]);
    assert(evidence);
    assert.equal(evidence.source_sha256, candidate.sourceSha256);
    assert.equal(evidence.source_location.unitType, "slide");
    assert.equal(evidence.source_location.unitIndex, target.slide);
    assert.equal(evidence.source_location.blockId, target.blockId);
    assert(evidence.content.includes(target.phrase));
    assert.equal(await readEvidence(other, node.id, ["industry"]), null);
    assert.equal(await readEvidence(owner, node.id, ["product"]), null);
    checked.push(target);
  }
  const search5 = await searchDocuments(owner, "15m of POF with 4 POF connections", { collections: ["industry"] });
  const search22 = await searchDocuments(owner, "SG has not adopted technical proposals", { collections: ["industry"] });
  assert(search5.some(item => item.documentId === registered.documentId));
  assert(search22.some(item => item.documentId === registered.documentId));
  assert.equal((await searchDocuments(other, "SG has not adopted technical proposals", { collections: ["industry"] })).length, 0);
  const after = await pool.query<{ reviews: number; completions: number; documents: number; evidence_nodes: number }>(`
    select (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1 and job_id=$2) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents,
      (select count(*)::int from knowledge_tree_node where version_id=$3 and node_kind='evidence') evidence_nodes`,
    [owner, job.id, registered.versionId]);
  assert.equal(after.rows[0].reviews, 133);
  assert.equal(after.rows[0].completions, 1);
  assert.equal(after.rows[0].documents, 1);
  assert(after.rows[0].evidence_nodes > 0);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: first.sourceSha256, artifactSha256: first.artifactSha256,
    artifactParity, reviewTotal: first.total, reviewSavedAndReadBack: saved, reviewResolved: reviewed.resolved,
    remainingUnreviewed: 0, decisions: { evidence: 110, decoration: 23 },
    completionReceipt: true, treeStatus: registered.treeStatus, syntheticPublishedDocuments: 1,
    citedSlides: checked.map(item => item.slide), citedBlockIds: checked.map(item => item.blockId),
    exactPhrasesChecked: checked.length, nativeLineTableReviewIds: nativeLineTables.map(item => item.blockId),
    searchFound: true, otherAccountDenied: true,
    wrongCollectionDenied: true, evidenceNodes: after.rows[0].evidence_nodes,
    externalCalls: 0, modelCalls: 0, qualityAccepted: false, goldCreated: 0 }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=any($1::uuid[])", [[owner, other]]);
  const residue = await pool.query<{ users: number; jobs: number; reviews: number; completions: number; documents: number }>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`, [owner, [owner, other]]);
  assert.deepEqual(residue.rows[0], { users: 0, jobs: 0, reviews: 0, completions: 0, documents: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep), "Refusing cleanup outside synthetic upload root");
    await rm(file, { force: true, recursive: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
}
