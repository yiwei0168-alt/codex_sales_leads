import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
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
const pool = new Pool({ connectionString: url.toString() });
const owner = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
const sourcePath = "tmp/ma24-independent-quarantine/eu-connectivity-kpis-2026.xlsx";
const artifactPath = "tmp/ma24-independent-quarantine/eu-connectivity-layout-v2.0.7.json";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function run(script: string, id: string, timeoutMs: number) {
  return await new Promise<Record<string, unknown>>((done, reject) => {
    const child = spawn(process.execPath, ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
      script, `--job-id=${id}`, "--limit=1"],
    { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_URL: url.toString() } });
    let output = "", error = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", part => { output += String(part); });
    child.stderr.on("data", part => { error = (error + String(part)).slice(-2000); });
    child.once("error", cause => { clearTimeout(timer); reject(cause); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(error || `${script}: exit ${code}`));
      try { done(JSON.parse(output)); } catch { reject(new Error(`${script}: invalid JSON ${output.slice(-300)}`)); }
    });
  });
}

const judgments: Record<string, { evidenceText: string; note: string }> = {
  "sheet-1-visual-1": {
    evidenceText: "The Instructions sheet identifies this as the Digital Decade 2026 Connectivity KPIs interactive report. It defines VHCN as FTTP and DOCSIS 3.1 household coverage and provides Overall and Rural breakdowns. The report requires Member State and reporting-level selections before interpreting its dynamic table and chart.",
    note: "Checked against the original Instructions sheet render and native drawing text; the trailing regional-zero note is excluded because it was not visible in the fitted render.",
  },
  "sheet-2-table": {
    evidenceText: "The original Report sheet has no Member State or reporting level selected. Its cached output has formula errors, so this unselected view provides no regional household coverage figures. Use the Data source sheet for literal regional values.",
    note: "Verified the blank selectors and four cached errors at K12:N12 against the original workbook. The raw cached table is replaced by this limited statement and its numeric output is excluded.",
  },
  "sheet-2-visual-1": {
    evidenceText: "The Report sheet includes an illustrative NUTS-1, NUTS-2 and NUTS-3 hierarchy image. The chart has blank selectors and zero placeholders; it does not show regional household coverage observations.",
    note: "Checked the original Report sheet render and all five embedded visual objects. The chart and images contain no usable regional coverage numbers in this unselected state.",
  },
  "sheet-5-visual-1": {
    evidenceText: "The Notes on the data and reuse sheet says the European Commission prepared this workbook using Connectivity Coverage in Europe 2025 data. The data may later be validated or revised. Reuse is generally permitted under CC BY 4.0 with attribution and changes indicated; third-party elements may require separate permission.",
    note: "Checked the legal-notice text and logo against the rendered original sheet and native drawing text; preserves the source's reuse and revision limits.",
  },
};

try {
  const current = await pool.query<{ db: string; review_table: string | null }>(
    "select current_database() db,to_regclass('public.knowledge_upload_extraction_review')::text review_table");
  assert.equal(current.rows[0]?.db, state.database);
  assert(current.rows[0]?.review_table);
  const source = await readFile(sourcePath);
  const offline = JSON.parse((await readFile(artifactPath)).toString("utf8"));
  assert.equal(sha(source), "2ba1b1af51b4d27a703e4e5495ec89724d26bd6584a6b56244d8ecb7f54e079a");
  assert.equal(offline.extractorVersion, "layout-v2.0.7");
  assert.equal(offline.documents[0].sourceSha256, sha(source));
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'EU XLSX reviewed clone','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "EU connectivity reviewed clone",
    originalFilename: "eu-connectivity-kpis-2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: source, visibility: "private" });
  const worker = await run("scripts/process-knowledge-upload-jobs.ts", job.id, 240_000);
  assert.equal(worker.awaitingReview, 1);
  assert.equal(worker.failed, 0);
  const stored = await pool.query<{ extraction_artifact_key: string }>(
    "select extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2", [job.id, owner]);
  const livePath = resolve(stored.rows[0].extraction_artifact_key);
  assert(livePath.startsWith(ownerRoot + sep));
  const live = JSON.parse((await readFile(livePath)).toString("utf8"));
  const normalized = structuredClone(offline);
  normalized.documents[0].storageKey = live.documents[0].storageKey;
  assert.deepEqual(live, normalized);
  const visual = await run("scripts/process-upload-visual-queue.ts", job.id, 240_000);
  assert.equal(visual.claimed, 1);
  assert.equal(visual.success, true);
  const initial = await getExtractionReview(owner, job.id);
  assert.equal(initial.total, 4);
  assert.deepEqual(initial.blocks.map(item => item.block.id), Object.keys(judgments));
  const table = initial.blocks.find(item => item.block.id === "sheet-2-table");
  assert.deepEqual(table?.candidate?.cachedErrorCells, ["K12", "L12", "M12", "N12"].map(cell => ({ cell, value: "#VALUE!" })));
  await assert.rejects(() => registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2 }), /Unresolved extraction/);
  for (const item of initial.blocks) {
    const proposed = judgments[item.block.id];
    await recordExtractionReview(owner, { jobId: job.id, artifactSha256: initial.artifactSha256,
      blockId: item.block.id, expectedRevision: 0, decision: "evidence",
      evidenceText: proposed.evidenceText, note: proposed.note });
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, 4);
  const receipt = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: sha(source) });
  assert.equal(registered.treeStatus, "searchable");
  const compound = await searchDocuments(owner, "Burgenland VHCN", { collections: ["industry"] });
  const found = await searchDocuments(owner, "Burgenland", { collections: ["industry"] });
  if (!found.some(item => item.documentId === registered.documentId)) {
    const diagnostic = await pool.query<{ fulltext: boolean; burgenland: boolean; vhcn: boolean; snippet: string }>(`
      select search_vector @@ websearch_to_tsquery('simple','Burgenland VHCN') fulltext,
        search_vector @@ websearch_to_tsquery('simple','Burgenland') burgenland,
        search_vector @@ websearch_to_tsquery('simple','VHCN') vhcn,
        left(content,120) snippet from knowledge_tree_node
      where version_id=$1 and node_kind='evidence' and title='sheet-3-table'`, [registered.versionId]);
    console.error(JSON.stringify({ found, compound, documentId: registered.documentId, diagnostic: diagnostic.rows }));
  }
  assert(found.some(item => item.documentId === registered.documentId));
  const units = await browseTree(owner, registered.documentId, null, 0, 20, ["industry"]);
  const sourceUnit = units.find(item => item.title === "Data source");
  assert(sourceUnit);
  const children = await browseTree(owner, registered.documentId, sourceUnit.id, 0, 20, ["industry"]);
  const sourceNode = children.find(item => item.source_location.blockId === "sheet-3-table");
  assert(sourceNode);
  const evidence = await readEvidence(owner, sourceNode.id, ["industry"]);
  assert(evidence);
  assert.equal(evidence.source_sha256, sha(source));
  assert.deepEqual(evidence.source_location, {
    unitType: "sheet", unitIndex: 3, blockId: "sheet-3-table", bbox: null, startRow: 2,
    sheetName: "Data source", cellRange: "A1:S489", headerRow: 1, startColumn: 1,
  });
  for (const line of ["O2: 107115", "S2: 133302", "O3: 5648", "R3: 8494", "S3: 14284"])
    assert(evidence.content.includes(line), `Missing exact cell ${line}`);
  const all = await pool.query<{ errors: number; published: number; evidence_nodes: number }>(`
    select (select count(*)::int from knowledge_tree_node where version_id=$1 and content like '%#VALUE!%') errors,
      (select count(*)::int from knowledge_document where owner_id=$2) published,
      (select count(*)::int from knowledge_tree_node where version_id=$1 and node_kind='evidence') evidence_nodes`,
    [registered.versionId, owner]);
  assert.equal(all.rows[0].errors, 0);
  assert.equal(all.rows[0].published, 1);
  console.log(JSON.stringify({ cloneOnly: true, extractorVersion: live.extractorVersion, sourceSha256: sha(source),
    pendingReviewUnits: initial.total, cachedErrorCells: table.candidate.cachedErrorCells.map(item => item.cell),
    reviewResolved: reviewed.resolved, completionReceipt: true, treeStatus: registered.treeStatus,
    searchFound: true, compoundQueryFound: compound.some(item => item.documentId === registered.documentId),
    citedSheet: evidence.source_location.sheetName, citedRange: evidence.source_location.cellRange,
    exactCellsChecked: 5, indexedCachedErrors: all.rows[0].errors, evidenceNodes: all.rows[0].evidence_nodes,
    syntheticPublishedDocuments: all.rows[0].published, externalCalls: 0, modelCalls: 0, qualityAccepted: false }));
} finally {
  await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=$1", [owner]);
  const residue = await pool.query<{ users: number; jobs: number; reviews: number; documents: number }>(`
    select (select count(*)::int from app_user where id=$1) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`, [owner]);
  assert.deepEqual(residue.rows[0], { users: 0, jobs: 0, reviews: 0, documents: 0 });
  await pool.end();
  await getPool().end();
  for (const name of await readdir(ownerRoot).catch(() => [])) {
    const file = resolve(ownerRoot, name);
    assert(file.startsWith(ownerRoot + sep));
    await rm(file, { recursive: true, force: true });
  }
  await rmdir(ownerRoot).catch(() => undefined);
  await assert.rejects(() => stat(ownerRoot), { code: "ENOENT" });
}
