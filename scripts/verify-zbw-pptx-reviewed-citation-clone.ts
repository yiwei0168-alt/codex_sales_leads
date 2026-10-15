/** Apply audited ZBW PPTX visual proposals on a local clone, then verify exact citations. */
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
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const source = await readFile("tmp/ma24-independent-quarantine/zbw-2025-open-science.pptx");
const offlineArtifactBytes = await readFile("tmp/ma24-independent-quarantine/zbw-product-extraction.json");
const packageBytes = await readFile("tmp/ma24-independent-quarantine/zbw-visual-candidates/review.json");
const reviewBytes = await readFile("docs/evidence/ma24-g14-zbw-visual-object-review-2026-10-15.json");
const review = JSON.parse(reviewBytes.toString("utf8")) as { sourceSha256: string; artifactSha256: string;
  candidatePackageSha256: string; objects: Array<{ blockId: string; proposedDecision: "evidence" | "decoration";
    evidenceText?: string; reason: string }> };
assert.equal(hash(source), review.sourceSha256);
assert.equal(hash(offlineArtifactBytes), review.artifactSha256);
assert.equal(hash(packageBytes), review.candidatePackageSha256);
const offlineArtifact = JSON.parse(offlineArtifactBytes.toString("utf8"));
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
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'ZBW reviewed clone','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "ZBW reviewed PPTX clone",
    originalFilename: "zbw-2025-open-science.pptx",
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
  const liveArtifact = JSON.parse(await readFile(livePath, "utf8"));
  assert.equal(liveArtifact.extractorVersion, "layout-v2.0.10");
  assert.equal(offlineArtifact.extractorVersion, "layout-v2.0.9");
  const withoutExtractorVersion = (blocks: Array<Record<string, unknown>>) => blocks.map(block => {
    const content = { ...block };
    delete content.extractorVersion;
    return content;
  });
  assert.deepEqual(withoutExtractorVersion(liveArtifact.documents[0].blocks),
    withoutExtractorVersion(offlineArtifact.documents[0].blocks));
  assert.deepEqual(liveArtifact.documents[0].qualitySummary, offlineArtifact.documents[0].qualitySummary);
  const first = await getExtractionReview(owner, job.id);
  assert.equal(first.total, 145);
  const ids: string[] = [];
  for (let offset = 0; offset < first.total; offset += 20) {
    const page = await getExtractionReview(owner, job.id, offset);
    ids.push(...page.blocks.map(item => item.block.id));
  }
  assert.deepEqual(new Set(ids), new Set(review.objects.map(item => item.blockId)));
  const proposals = new Map(review.objects.map(item => [item.blockId, item]));
  for (const id of ids) {
    const proposal = proposals.get(id)!;
    await recordExtractionReview(owner, { jobId: job.id, artifactSha256: first.artifactSha256,
      blockId: id, expectedRevision: 0, decision: proposal.proposedDecision,
      evidenceText: proposal.evidenceText ?? "", note: proposal.reason });
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, 145);
  const decisions = (await pool.query<{ decision: string; count: number }>(
    "select decision,count(*)::int count from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2 group by decision",
    [owner, job.id])).rows;
  assert.deepEqual(Object.fromEntries(decisions.map(item => [item.decision, item.count])),
    { evidence: 4, decoration: 141 });
  const receipt = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: review.sourceSha256 });
  assert.equal(registered.treeStatus, "searchable");
  const targets = [
    { id: "slide-25-text-6", slide: 25, phrase: "mere existence" },
    { id: "slide-28-text-5", slide: 28, phrase: "machine-readable" },
    { id: "slide-28-text-6", slide: 28, phrase: "reshare" },
    { id: "slide-11-visual-2", slide: 11, phrase: "greater visibility" },
    { id: "slide-30-text-2", slide: 30, phrase: "is ideally created during the project planning and continued during the entire project period" },
    { id: "slide-22-visual-2", slide: 22, phrase: "Open Access only" },
    { id: "slide-22-visual-10", slide: 22, phrase: "freely available" },
    { id: "slide-30-visual-5", slide: 30, phrase: "who may use" },
  ];
  const cited: string[] = [];
  for (const target of targets) {
    const nodes: QueryResult<{ id: string }> = await pool.query<{ id: string }>(
      "select id from knowledge_tree_node where version_id=$1 and node_kind='evidence' and source_location->>'blockId'=$2",
      [registered.versionId, target.id]);
    assert.equal(nodes.rowCount, 1);
    const evidence = await readEvidence(owner, nodes.rows[0].id, ["industry"]);
    assert(evidence);
    assert.equal(evidence.source_sha256, review.sourceSha256);
    assert.equal(evidence.source_location.unitIndex, target.slide);
    assert.equal(evidence.source_location.blockId, target.id);
    assert(evidence.content.toLowerCase().includes(target.phrase.toLowerCase()));
    assert.equal(await readEvidence(randomUUID(), nodes.rows[0].id, ["industry"]), null);
    cited.push(target.id);
  }
  const hits = await searchDocuments(owner, "open data machine-readable licence", { collections: ["industry"] });
  assert(hits.some(item => item.documentId === registered.documentId));
  const pointerAfter = JSON.stringify((await pool.query(
    "select * from knowledge_release_pointer_v3 order by scope_kind,owner_id")).rows);
  assert.equal(pointerAfter, pointerBefore);
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: review.sourceSha256,
    offlineArtifactSha256: review.artifactSha256, liveArtifactBlockParity: true, worker,
    reviewSaved: ids.length, reviewComplete: true, proposedEvidence: 4, proposedDecoration: 141,
    treeStatus: registered.treeStatus, citedBlockIds: cited, crossAccountDenied: true,
    searchFound: true, v3ReleasePointerUnchanged: true, productionWrites: 0, goldCreated: 0,
    answerModelCalls: 0, userVisibleAnswerAccepted: false }));
} finally {
  if (jobId) {
    await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
    await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  }
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=$1", [owner]);
  const residue = await pool.query<{ users: number; jobs: number; reviews: number; completions: number; documents: number }>(`
    select (select count(*)::int from app_user where id=$1) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`, [owner]);
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
