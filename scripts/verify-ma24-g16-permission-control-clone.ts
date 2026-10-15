/** Two-account private-source proof in an isolated local database; no model calls. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import type { Ma24FrozenManifest, Ma24GoldSnapshot } from
  "../src/lib/knowledge/evaluation/ma24-independent-comparison";

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_ADMISSION_USE_CLONE, "1", "Isolated local clone required");
const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
  database: string; cleaned?: boolean;
};
assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database),
  "Active isolated clone required");
const cloneUrl = (value: string | undefined) => {
  assert(value, "Local database URL required");
  const url = new URL(value);
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local database required");
  url.pathname = `/${state.database}`;
  return url.toString();
};
const adminUrl = cloneUrl(process.env.DATABASE_MIGRATION_URL);
process.env.DATABASE_URL = cloneUrl(process.env.DATABASE_URL);
const { readMa24LiveCorpusAccount, assertMa24CorpusSnapshotShape,
  assertMa24PermissionGoldControl, verifyMa24LiveCorpusAccount,
  verifyMa24LivePermissionControl, verifyMa24LivePermissionGoldEvidence } = await import(
  "../src/lib/knowledge/evaluation/ma24-corpus-snapshot");
const { ma24CaseQuerySha256 } = await import(
  "../src/lib/knowledge/evaluation/ma24-independent-comparison");
const admin = new Pool({ connectionString: adminUrl });
const ownerId = randomUUID(), outsiderId = randomUUID();
const documentId = randomUUID(), assetId = randomUUID(), treeVersionId = randomUUID();
const unitId = randomUUID(), evidenceId = randomUUID();
const assetSha256 = "a".repeat(64), question = "Read the private synthetic review code";
const ownerCaseId = "ma24-permission-owner-fixture";
const denyCaseId = "ma24-permission-deny-fixture";
try {
  for (const userId of [ownerId, outsiderId]) await admin.query(
    `insert into app_user(id,email,display_name,role,status)
     values($1,$2,'MA24 permission control fixture','member','active')`,
    [userId, `${userId}@example.invalid`]);
  await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,
      source_type,content_sha256,owner_id,visibility,status)
    select $1,c.id,$2,'MA24 private permission source','synthetic',$3,$4,'private','active'
      from knowledge_collection c where c.slug='industry'`,
  [documentId, `ma24-permission-${documentId}`, assetSha256, ownerId]);
  await admin.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,
      mime_type,byte_size,document_type,source_nature,registration_status)
    values($1,$2,$3,$4,'application/pdf',1,'pdf','synthetic','registered')`,
  [assetId, documentId, `ma24-permission/${assetId}.pdf`, assetSha256]);
  await admin.query(`insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,
      extractor_version,artifact_sha256,status)
    values($1,$2,$3,$4,'ma24-permission-fixture',$5,'ready')`,
  [treeVersionId, documentId, assetId, assetSha256, "b".repeat(64)]);
  await admin.query(`insert into knowledge_tree_node(id,version_id,ordinal,node_kind,title,
      unit_type,unit_index,source_location)
    values($1,$2,1,'unit','Synthetic page','page',1,'{}')`, [unitId, treeVersionId]);
  await admin.query(`insert into knowledge_tree_node(id,version_id,parent_id,ordinal,node_kind,
      title,unit_type,unit_index,source_location,content,content_sha256)
    values($1,$2,$3,1,'evidence','Synthetic block','page',1,$4,$5,$6)`,
  [evidenceId, treeVersionId, unitId, JSON.stringify({ blockId: "synthetic-block" }),
    "Synthetic source", createHash("sha256").update("Synthetic source").digest("hex")]);
  await admin.query("update knowledge_document set current_tree_version_id=$2 where id=$1",
    [documentId, treeVersionId]);

  const snapshot = { schema: "ma24-g16-corpus-snapshot-v2" as const,
    accounts: [await readMa24LiveCorpusAccount(ownerId, ["industry"]),
      await readMa24LiveCorpusAccount(outsiderId, ["industry"])],
    permissionProofs: [{ denyCaseId, ownerCaseId, targetAssetSha256: assetSha256 }] };
  const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v4",
    sourceSetSha256: "1".repeat(64), goldSnapshotSha256: "2".repeat(64),
    codeAndConfigSha256: "3".repeat(64), corpusSnapshotSha256: "4".repeat(64),
    requiredImprovementTags: [], protectedNoRegressionTags: [], cases: [
      { caseId: ownerCaseId, caseSha256: ma24CaseQuerySha256(question), group: "security",
        tags: ["permission"], expectedOutcome: "route", userId: ownerId,
        knowledgeScope: ["industry"] },
      { caseId: denyCaseId, caseSha256: ma24CaseQuerySha256(question), group: "security",
        tags: ["permission"], expectedOutcome: "deny", userId: outsiderId,
        knowledgeScope: ["industry"] },
    ] };
  const gold: Ma24GoldSnapshot = { schema: "ma24-g16-gold-snapshot-v1", cases: [
    { caseId: ownerCaseId, caseSha256: ma24CaseQuerySha256(question),
      expectedAnswer: "Synthetic owner answer", expectedSources: [
        { assetSha256, unitIndex: 1, excerpt: "Synthetic source" }],
      reviewer: "fixture", reviewedAt: "2026-10-15T00:00:00Z", note: "fixture" },
    { caseId: denyCaseId, caseSha256: ma24CaseQuerySha256(question),
      expectedAnswer: "Private source unavailable", expectedSources: [],
      reviewer: "fixture", reviewedAt: "2026-10-15T00:00:00Z", note: "fixture" },
  ] };
  assertMa24CorpusSnapshotShape(manifest, snapshot);
  assertMa24PermissionGoldControl(manifest, snapshot, gold);
  assert(snapshot.accounts[0].documents.some(row => row.assetSha256 === assetSha256));
  assert(!snapshot.accounts[1].documents.some(row => row.assetSha256 === assetSha256));
  await verifyMa24LiveCorpusAccount(snapshot, outsiderId, ["industry"]);
  await verifyMa24LivePermissionControl(manifest, snapshot, denyCaseId);
  await verifyMa24LivePermissionGoldEvidence(manifest, snapshot, gold, denyCaseId);
  await admin.query("update knowledge_tree_node set content=$2,content_sha256=$3 where id=$1",
    [evidenceId, "Altered content", createHash("sha256").update("Altered content").digest("hex")]);
  await assert.rejects(verifyMa24LivePermissionGoldEvidence(manifest, snapshot, gold, denyCaseId),
    /route Gold evidence coordinate unavailable/);
  await admin.query("update knowledge_tree_node set content=$2,content_sha256=$3 where id=$1",
    [evidenceId, "Synthetic source", createHash("sha256").update("Synthetic source").digest("hex")]);

  await admin.query("update knowledge_document set visibility='shared' where id=$1", [documentId]);
  await assert.rejects(verifyMa24LiveCorpusAccount(snapshot, outsiderId, ["industry"]),
    /live corpus or ACL differs/);
  await admin.query("update knowledge_document set visibility='private' where id=$1", [documentId]);
  await admin.query("update knowledge_document set status='archived' where id=$1", [documentId]);
  await assert.rejects(verifyMa24LivePermissionControl(manifest, snapshot, denyCaseId),
    /live corpus or ACL differs/);
  await admin.query("update knowledge_document set status='active' where id=$1", [documentId]);
  assert.throws(() => assertMa24PermissionGoldControl(manifest, snapshot, { ...gold,
    cases: [{ ...gold.cases[0], expectedSources: [] }, gold.cases[1]] }),
  /permission Gold source mismatch/);
} finally {
  await admin.query("update knowledge_document set current_tree_version_id=null where id=$1",
    [documentId]);
  await admin.query("delete from knowledge_tree_node where id=$1", [evidenceId]);
  await admin.query("delete from knowledge_tree_node where id=$1", [unitId]);
  await admin.query("delete from knowledge_tree_version where id=$1", [treeVersionId]);
  await admin.query("delete from knowledge_asset where id=$1", [assetId]);
  await admin.query("delete from knowledge_document where id=$1", [documentId]);
  for (const userId of [ownerId, outsiderId]) await admin.query(
    "delete from app_user where id=$1 and display_name='MA24 permission control fixture'",
    [userId]);
  const residual = (await admin.query<{ users: string; documents: string; assets: string;
    trees: string; nodes: string }>(`
      select (select count(*)::text from app_user where id=any($1::uuid[])) as users,
        (select count(*)::text from knowledge_document where id=$2) as documents,
        (select count(*)::text from knowledge_asset where id=$3) as assets,
        (select count(*)::text from knowledge_tree_version where id=$4) as trees,
        (select count(*)::text from knowledge_tree_node where id=any($5::uuid[])) as nodes`,
  [[ownerId, outsiderId], documentId, assetId, treeVersionId, [unitId, evidenceId]])).rows[0];
  assert.deepEqual(residual, { users: "0", documents: "0", assets: "0", trees: "0", nodes: "0" });
  await admin.end();
}
console.log(JSON.stringify({ schema: "ma24-g16-permission-control-clone-v1",
  checks: ["owner-private-target-present", "outsider-target-hidden",
    "identical-question-positive-negative-pair", "owner-Gold-cites-target",
    "owner-Gold-evidence-drift-rejected-during-denial",
    "shared-ACL-drift-rejected", "missing-owner-target-rejected",
    "wrong-owner-Gold-source-rejected", "synthetic-rows-cleaned"], providerCalls: 0 }));
