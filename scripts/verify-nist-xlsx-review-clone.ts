import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { createKnowledgeUploadJob } from "../src/lib/knowledge/upload";
import { completeExtractionReview, getExtractionReview, getExtractionReviewImage, recordExtractionReview } from "../src/lib/knowledge/extraction-review";
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
const other = randomUUID();
const uploadRoot = resolve("knowledge", "uploads");
const ownerRoot = resolve(uploadRoot, owner);
assert(ownerRoot.startsWith(uploadRoot + sep) && basename(ownerRoot) === owner);
const sourcePath = "tmp/ma24-independent-quarantine/nist-smartmanufacturing-metadata.xlsx";
const artifactPath = "tmp/ma24-independent-quarantine/nist-smartmanufacturing-metadata.layout-v2.0.10.extraction.json";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const judgments: Record<string, { evidenceText: string; note: string }> = {
  "sheet-1-table": {
    evidenceText: "The Title Sheet lists four selected measurement files in rows 32–35. Rows 36–66 have blank filename inputs, so their 62 cached #N/A lookup results are unused placeholders, not measurement observations.",
    note: "Original H29, G32:I35 and G36:I66 checked. The four filenames are preserved only as historical source context; old local Q: paths and external MAT data were not validated.",
  },
  "sheet-1-visual-1": {
    evidenceText: "The Title Sheet contains three photographs of an industrial measurement corridor and equipment, a Gaithersburg route map with checkpoints and transmitter/receiver marks, and Outer Run and Inner Run diagrams with arrows, labelled locations and setup notes. The inner diagram marks shared points with stars and identifies two-minute collections at locations 3 and 6.1.",
    note: "Seven product candidate objects matched the six original embedded-media hashes plus one native title text object. The images do not establish numerical propagation results, distances or a person's identity.",
  },
  "sheet-4-visual-1": {
    evidenceText: "The Data_Physical_Location sheet repeats the Gaithersburg route map showing a north arrow, numbered checkpoints and transmitter/receiver marks. The same original image bytes appear on the Title Sheet.",
    note: "The single image candidate matched xl/media/image4.png; this repeated placement is not an independent source.",
  },
  "sheet-6-visual-1": {
    evidenceText: "The Ray Trace Graph sheet plots four curves with legend labels Free Space, Path Loss at 2.245 GHz, Free Space Loss at 5.4 GHz and Path Loss at 5.4 GHz. The chart has no visible title or axis units; exact values and units must be read from the Ray Tracing Results table.",
    note: "Original native chart was exported by Excel from the read-only workbook and visually checked. The product chart candidate retained its source formulas but reported no cached points, so this caption is limited to the verified original rendering.",
  },
};

async function runWorker(script: string, id: string, timeoutMs: number) {
  return await new Promise<Record<string, unknown>>((done, reject) => {
    const child = spawn(process.execPath, ["--require", "./scripts/patch-node-user.cjs", "--import", "tsx",
      script, `--job-id=${id}`, "--limit=1"],
    { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: url.toString(), OPENROUTER_API_KEY: "" } });
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

try {
  const current = await pool.query<{ db: string; review_table: string | null }>(
    "select current_database() db,to_regclass('public.knowledge_upload_extraction_review')::text review_table");
  assert.equal(current.rows[0]?.db, state.database);
  assert(current.rows[0]?.review_table);
  const source = await readFile(sourcePath);
  const offline = JSON.parse((await readFile(artifactPath)).toString("utf8"));
  assert.equal(sha(source), "0132c779ab57132ae5b5718b1b1440b52ed66bd48bc62d953336c90f7f2cb814");
  assert.equal(offline.documents[0].sourceSha256, sha(source));
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'NIST XLSX review clone','!','admin','active')",
    [owner, `${owner}@example.invalid`]);
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'NIST XLSX other clone','!','member','active')",
    [other, `${other}@example.invalid`]);
  const job = await createKnowledgeUploadJob(owner, { collection: "industry", title: "NIST industrial wireless review clone",
    originalFilename: "nist-smartmanufacturing-metadata.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: source, visibility: "private" });
  const extraction = await runWorker("scripts/process-knowledge-upload-jobs.ts", job.id, 240_000);
  assert.equal(extraction.awaitingReview, 1);
  assert.equal(extraction.failed, 0);
  const stored = await pool.query<{ extraction_artifact_key: string }>(
    "select extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2", [job.id, owner]);
  const livePath = resolve(stored.rows[0].extraction_artifact_key);
  assert(livePath.startsWith(ownerRoot + sep));
  const live = JSON.parse((await readFile(livePath)).toString("utf8"));
  const normalized = structuredClone(offline);
  normalized.documents[0].storageKey = live.documents[0].storageKey;
  assert.deepEqual(live, normalized);
  const visual = await runWorker("scripts/process-upload-visual-queue.ts", job.id, 240_000);
  assert.equal(visual.claimed, 1);
  assert.equal(visual.success, true);
  const initial = await getExtractionReview(owner, job.id);
  assert.equal(initial.total, 4);
  assert.deepEqual(initial.blocks.map(item => item.block.id),
    ["sheet-1-table", "sheet-1-visual-1", "sheet-4-visual-1", "sheet-6-visual-1"]);
  assert.equal(initial.visualState, "ready");
  const titleObjects = initial.blocks[1].candidate?.sheetObjects ?? [];
  assert.equal(titleObjects.length, 7);
  const mediaHashes = [
    "cf2cf323aa6a59fb5ca7da1eeee2f244b71c8a9be632571c412fdecfef2fe5ee",
    "26152e672a715aee1771a0cdf624c993abb1a0f418e76e92e17029be7667dec8",
    "0136b054eadb7d9a1d3d978112d45bb69a79f72a175b90ee7b3f0575dfb02c97",
    "16cf80f2b8d21be1ad98393f56936f5444ec26f9739954264f3f54607791e103",
    "f986fd40e6de8015334d5ac0d2ed126c322afafe1b96fa5e59b4ca35deeed759",
    "5f343a49eec55f8a2279e44b17703c01a4ae902f91c15b0e9a620411864d4ac3",
  ];
  for (const hash of mediaHashes) {
    const object = titleObjects.find(candidate => candidate.text?.includes(hash));
    assert(object, `Title media hash absent from candidate: ${hash}`);
    assert.equal(object.images?.length, 1);
    const preview = await getExtractionReviewImage(owner, job.id, initial.artifactSha256,
      "sheet-1-visual-1", object.objectIndex, object.images[0].imageIndex);
    assert.equal(sha(preview), object.images[0].reviewImageSha256);
  }
  assert(initial.blocks[2].candidate?.sheetObjects?.[0]?.text?.includes(mediaHashes[3]));
  const chart = initial.blocks[3].candidate?.sheetObjects?.[0];
  assert.equal(chart?.kind, "chart");
  assert(chart.text?.includes("xl/charts/chart1.xml"));
  const cachedErrors = initial.blocks[0].candidate?.cachedErrorCells ?? [];
  assert.equal(cachedErrors.length, 32);
  await assert.rejects(() => registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2 }), /Unresolved extraction/);
  for (const item of initial.blocks) {
    const proposal = judgments[item.block.id];
    assert(proposal);
    const saved = await recordExtractionReview(owner, { jobId: job.id,
      artifactSha256: initial.artifactSha256, blockId: item.block.id, expectedRevision: 0,
      decision: "evidence", evidenceText: proposal.evidenceText, note: proposal.note });
    assert.equal(saved.revision, 1);
  }
  const reviewed = await getExtractionReview(owner, job.id);
  assert.equal(reviewed.resolved, 4);
  for (const item of reviewed.blocks) {
    assert.equal(item.judgment?.decision, "evidence");
    assert.equal(item.judgment?.evidence_text, judgments[item.block.id].evidenceText);
  }
  const receipt = await completeExtractionReview(owner, job.id, reviewed.artifactSha256, reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration, true);
  const registered = await registerVectorlessUpload(owner, job.id, { language: "en", authorityLevel: 2,
    expectedSourceSha256: sha(source) });
  assert.equal(registered.treeStatus, "searchable");
  const found = await searchDocuments(owner, "Ray Tracing Results", { collections: ["industry"] });
  assert(found.some(item => item.documentId === registered.documentId));
  assert.deepEqual(await searchDocuments(other, "Ray Tracing Results", { collections: ["industry"] }), []);
  const units = await browseTree(owner, registered.documentId, null, 0, 20, ["industry"]);
  const targetUnit = units.find(item => item.title === "Ray Tracing Results");
  assert(targetUnit);
  const children = await browseTree(owner, registered.documentId, targetUnit.id, 0, 20, ["industry"]);
  const sourceNode = children.find(item => item.source_location.blockId === "sheet-5-table");
  assert(sourceNode);
  const evidence = await readEvidence(owner, sourceNode.id, ["industry"]);
  assert(evidence);
  assert.equal(evidence.source_sha256, sha(source));
  assert.equal(evidence.source_location.sheetName, "Ray Tracing Results");
  assert.equal(evidence.source_location.cellRange, "A1:X3242");
  for (const line of ["B7: 1", "F7: -26.36", "G7: -42.85", "K7: -30.85", "L7: -47.339999999999996"])
    assert(evidence.content.includes(line), `Missing exact cell ${line}`);
  assert.equal(await readEvidence(other, sourceNode.id, ["industry"]), null);
  const formatUnit = units.find(item => item.title === "Measurements Mat Files Format");
  assert(formatUnit);
  const formatChildren = await browseTree(owner, registered.documentId, formatUnit.id, 0, 20, ["industry"]);
  const formatNode = formatChildren.find(item => item.source_location.blockId === "sheet-7-table");
  assert(formatNode);
  const formatEvidence = await readEvidence(owner, formatNode.id, ["industry"]);
  assert(formatEvidence);
  assert.equal(formatEvidence.source_sha256, sha(source));
  assert.equal(formatEvidence.source_location.sheetName, "Measurements Mat Files Format");
  assert.equal(formatEvidence.source_location.cellRange, "A1:K54");
  for (const line of [
    "B13: AllthePdps{:,3}", "D13: The Acquisition date and time",
    "B14: AllthePdps{:,4}", "D14: The record time",
    "B15: AllthePdps{:,5}", "D15: The Absolute Time and Date",
    "B16: AllthePdps{:,6}", "D16: The Impulse Response (I,Q) data",
    "B25: AllthePdps{5,7}", "C25: Carrier Freq",
    "B26: AllthePdps{5,8}", "D26: Carrier Frequency in Hz",
  ]) assert(formatEvidence.content.includes(line), `Missing MAT format cell ${line}`);
  assert.equal(await readEvidence(other, formatNode.id, ["industry"]), null);
  const indexedErrors = await pool.query<{ total: number }>(
    "select count(*)::int as total from knowledge_tree_node where version_id=$1 and content like '%#N/A%'", [registered.versionId]);
  assert.equal(indexedErrors.rows[0].total, 1, "Only the review explanation should mention #N/A");
  console.log(JSON.stringify({ cloneOnly: true, sourceSha256: sha(source),
    sourceAndUploadedBlocksEqual: true, visualState: initial.visualState,
    pendingReviewBlocks: initial.total, titleMediaHashesMatched: mediaHashes.length,
    titlePreviewImagesRead: mediaHashes.length, titleCachedErrorCandidateCount: cachedErrors.length,
    originalCachedErrorCount: 62, reviewDecisionsSaved: reviewed.resolved,
    registrationReady: receipt.readyForRegistration, treeStatus: registered.treeStatus,
    sourceCoordinate: evidence.source_location, exactCellsChecked: 5,
    matFormatSourceCoordinate: formatEvidence.source_location, matFormatExactCellsChecked: 12,
    otherAccountReadDenied: true, indexedCachedErrorTables: 0,
    modelCalls: 0, productionWrites: 0, qualityAccepted: false }));
} finally {
  await pool.query("delete from knowledge_upload_review_completion where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_extraction_review where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_upload_job where user_id=$1", [owner]);
  await pool.query("update knowledge_document set current_tree_version_id=null where owner_id=$1", [owner]);
  await pool.query("delete from knowledge_document where owner_id=$1", [owner]);
  await pool.query("delete from app_user where id=any($1::uuid[])", [[owner, other]]);
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
