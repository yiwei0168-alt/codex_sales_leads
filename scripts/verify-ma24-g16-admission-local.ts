/** Local synthetic database acceptance for MA24 task admission; no model calls. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { modeModelConfig } from "../src/lib/assistant/main/mode-config";
import { verifyMa24EvaluationTaskBinding } from "../src/lib/knowledge/evaluation/ma24-evaluation-task-binding";
import { readMa24LiveCorpusAccount } from "../src/lib/knowledge/evaluation/ma24-corpus-snapshot";
import type { Ma24G15Preview } from "../src/lib/knowledge/evaluation/ma24-g15-runtime-binding";
import { ma24CaseQuerySha256, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24GoldSnapshot,
  type Ma24SourceSetSnapshot } from "../src/lib/knowledge/evaluation/ma24-independent-comparison";

nextEnv.loadEnvConfig(process.cwd());
let migrationUrl = process.env.DATABASE_MIGRATION_URL;
let appUrl = process.env.DATABASE_URL;
assert(migrationUrl && appUrl, "Local database URLs required");
if (process.env.MA24_ADMISSION_USE_CLONE === "1") {
  const state = JSON.parse(await readFile("tmp/ma11-replay-state.json", "utf8")) as {
    database: string; cleaned?: boolean;
  };
  assert(!state.cleaned && /^ma11_replay_[a-f0-9]{12}$/.test(state.database),
    "Active isolated clone required");
  const migrationClone = new URL(migrationUrl);
  const appClone = new URL(appUrl);
  assert(["localhost", "127.0.0.1"].includes(migrationClone.hostname) &&
    ["localhost", "127.0.0.1"].includes(appClone.hostname), "Local database required");
  migrationClone.pathname = `/${state.database}`;
  appClone.pathname = `/${state.database}`;
  migrationUrl = migrationClone.toString();
  appUrl = appClone.toString();
  process.env.DATABASE_MIGRATION_URL = migrationUrl;
  process.env.DATABASE_URL = appUrl;
}
const migration = new URL(migrationUrl), app = new URL(appUrl);
assert(["localhost", "127.0.0.1"].includes(migration.hostname), "Local database required");
assert.equal(`${app.hostname}:${app.port || "5432"}${app.pathname}`,
  `${migration.hostname}:${migration.port || "5432"}${migration.pathname}`,
  "Application and migration URLs must identify the same local database");
globalThis.fetch = async () => { throw new Error("External HTTP disabled for MA24 admission acceptance"); };

const admin = new Pool({ connectionString: migrationUrl });
const userId = randomUUID(), otherUserId = randomUUID(), conversationId = randomUUID();
const runId = randomUUID(), leaseToken = randomUUID(), caseId = "ma24-admission-synthetic";
const query = "What does this synthetic local source say?";
const sourceSet: Ma24SourceSetSnapshot = { schema: "ma24-g16-source-set-v1",
  cases: [{ caseId, query }] };
const sourceSetBytes = new TextEncoder().encode(JSON.stringify(sourceSet));
const gold: Ma24GoldSnapshot = { schema: "ma24-g16-gold-snapshot-v1", cases: [{
  caseId, caseSha256: ma24CaseQuerySha256(query), expectedAnswer: "Synthetic answer",
  expectedSources: [{ assetSha256: "c".repeat(64), unitIndex: 1, excerpt: "Synthetic evidence" }],
  reviewer: "Synthetic reviewer", reviewedAt: "2026-10-15T00:00:00Z", note: "Fixture only",
}] };
const goldBytes = new TextEncoder().encode(JSON.stringify(gold));
const model = modeModelConfig("standard");
const loadedCodeAndConfig: Ma24G15Preview = { schema: "ma24-g15-config-preview-v1",
  productPromptDateUtc: "2026-10-15", requiredRunPromptDateUtc: "2026-10-15",
  mode: "standard", modePromptVersion: "fixture", modePromptSha256: "prompt",
  productVersion: "fixture", modelProfile: model.profile, modelFunctionsSha256: "functions",
  arms: [{ knowledgeScope: ["industry"], baseline: { prompt: "baseline" },
    candidate: { prompt: "candidate" }, addedTools: ["vectorless_read"] }],
  sourceHashes: { "src/graph.ts": "fixture" },
  sourceClosureMethod: "recursive-local-static-imports-v1", sourceClosureFileCount: 1,
  intendedLocalBgeFlagForBothArms: "flag=1", currentLocalBgeFlagEnabled: false,
  sourceSetFrozen: false, goldFrozen: false, runtimeBuildVerified: false,
  transitiveCodeClosureVerified: false, providerTariffsVerified: false,
  paidCallAuthorizationConfirmed: false, readyForPaidEvaluation: false };
const codeAndConfigBytes = new TextEncoder().encode(JSON.stringify(loadedCodeAndConfig));
const corpusSnapshotBytes = new TextEncoder().encode(JSON.stringify({
  schema: "ma24-g16-corpus-snapshot-v2",
  accounts: [await readMa24LiveCorpusAccount(userId, ["industry"])],
  permissionProofs: [],
}));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v4",
  sourceSetSha256: sha(sourceSetBytes),
  goldSnapshotSha256: sha(goldBytes), codeAndConfigSha256: sha(codeAndConfigBytes),
  corpusSnapshotSha256: sha(corpusSnapshotBytes),
  requiredImprovementTags: [], protectedNoRegressionTags: [],
  cases: [{ caseId, caseSha256: ma24CaseQuerySha256(query), group: "synthetic",
    tags: [], expectedOutcome: "route", userId, knowledgeScope: ["industry"] }] };
const taskInput = { content: query, requestKey: `ma24-admission-${runId}`, attachments: [],
  knowledgeScope: ["industry"], mode: "standard" };
const verify = () => verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes, goldBytes,
  codeAndConfigBytes, corpusSnapshotBytes, loadedCodeAndConfig, nowUtcDate: "2026-10-15", runId,
  leaseToken, caseId, arm: "baseline", loadedModelConfig: model });
let created = false;
try {
  const kindConstraint = (await admin.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname='agent_run_execution_kind_check'`
  )).rows[0]?.definition;
  assert(kindConstraint?.includes("main-agent-evaluation"),
    "Local database requires migration 136 before MA24 admission acceptance");
  const client = await admin.connect();
  try {
    await client.query("begin");
    for (const id of [userId, otherUserId]) await client.query(
      `insert into app_user(id,email,display_name,role,status)
       values($1,$2,'MA24 admission synthetic fixture','member','active')`,
      [id, `${id}@example.invalid`]);
    await client.query(
      `insert into assistant_conversation(id,user_id,title,status)
       values($1,$2,'MA24 synthetic admission','deleted')`,
      [conversationId, userId]);
    await client.query(
      `insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,
        execution_version,execution_kind,execution_spec,status,lease_token,lease_until)
       values($1,$2,$3,$4,'synthetic-local',$5,$6,'ma24-admission-fixture',
        'main-agent-evaluation',$7,'running',$8,now()+interval '10 minutes')`,
      [runId, userId, conversationId, taskInput.requestKey, JSON.stringify(taskInput),
        JSON.stringify(model), JSON.stringify({ schema: "ma24-evaluation-run-v1",
          manifestSha256: ma24ManifestSha256(manifest), caseId, arm: "baseline" }), leaseToken]);
    await client.query("commit");
    created = true;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }

  assert.deepEqual(await verify(), { userId, caseId, arm: "baseline", query,
    knowledgeScope: ["industry"] });
  const changedDocumentId = randomUUID();
  await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,
      source_type,content_sha256,owner_id,visibility,status)
    select $1,c.id,$2,'MA24 admission corpus drift','synthetic',$3,$4,'private','active'
      from knowledge_collection c where c.slug='industry'`,
  [changedDocumentId, `ma24-admission-${changedDocumentId}`, "d".repeat(64), userId]);
  await assert.rejects(verify(), /live corpus or ACL differs/);
  assert(!(await readMa24LiveCorpusAccount(otherUserId, ["industry"]))
    .documents.some(document => document.documentId === changedDocumentId));
  await admin.query("update knowledge_document set visibility='shared' where id=$1 and owner_id=$2",
    [changedDocumentId, userId]);
  assert((await readMa24LiveCorpusAccount(otherUserId, ["industry"]))
    .documents.some(document => document.documentId === changedDocumentId));
  await admin.query("delete from knowledge_document where id=$1 and owner_id=$2",
    [changedDocumentId, userId]);
  assert.equal((await verify()).caseId, caseId);
  await admin.query(`insert into assistant_message(user_id,conversation_id,role,intent,content,metadata)
    values($1,$2,'user','general','contaminating history','{}')`, [userId, conversationId]);
  await assert.rejects(verify(), /leased execution/);
  await admin.query("delete from assistant_message where user_id=$1 and conversation_id=$2",
    [userId, conversationId]);
  await admin.query("update assistant_conversation set status='active' where id=$1 and user_id=$2",
    [conversationId, userId]);
  await assert.rejects(verify(), /leased execution/);
  await admin.query("update assistant_conversation set status='deleted' where id=$1 and user_id=$2",
    [conversationId, userId]);
  const wrongUserManifest: Ma24FrozenManifest = { ...manifest,
    cases: [{ ...manifest.cases[0], userId: otherUserId }] };
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest: wrongUserManifest,
    sourceSetBytes, goldBytes, codeAndConfigBytes, corpusSnapshotBytes, loadedCodeAndConfig,
    nowUtcDate: "2026-10-15", runId, leaseToken, caseId,
    arm: "baseline", loadedModelConfig: model }),
  /absent from tenant store/);
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes,
    goldBytes: new TextEncoder().encode("changed Gold"), codeAndConfigBytes, corpusSnapshotBytes,
    loadedCodeAndConfig, nowUtcDate: "2026-10-15",
    runId, leaseToken, caseId, arm: "baseline", loadedModelConfig: model }),
  /frozen Gold snapshot drift/);
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes,
    goldBytes, codeAndConfigBytes: new TextEncoder().encode("changed config"), corpusSnapshotBytes,
    loadedCodeAndConfig, nowUtcDate: "2026-10-15",
    runId, leaseToken, caseId, arm: "baseline", loadedModelConfig: model }),
  /frozen code and config snapshot drift/);
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes,
    goldBytes, codeAndConfigBytes, corpusSnapshotBytes, loadedCodeAndConfig: { ...loadedCodeAndConfig,
      modePromptSha256: "changed-loaded-prompt" }, nowUtcDate: "2026-10-15",
    runId, leaseToken, caseId, arm: "baseline", loadedModelConfig: model }),
  /modePromptSha256 drift/);
  const invalidGoldBytes = new TextEncoder().encode(JSON.stringify({ ...gold,
    cases: [{ ...gold.cases[0], expectedSources: [] }] }));
  await assert.rejects(verifyMa24EvaluationTaskBinding({
    manifest: { ...manifest, goldSnapshotSha256: sha(invalidGoldBytes) }, sourceSetBytes,
    goldBytes: invalidGoldBytes, codeAndConfigBytes, corpusSnapshotBytes, loadedCodeAndConfig,
    nowUtcDate: "2026-10-15", runId, leaseToken, caseId,
    arm: "baseline", loadedModelConfig: model,
  }), /Invalid MA24 frozen Gold case/);
  await admin.query(`update agent_run set input=jsonb_set(input,'{content}',to_jsonb($2::text))
    where id=$1 and user_id=$3`, [runId, "Changed question", userId]);
  await assert.rejects(verify(), /leased execution/);
  await admin.query(`update agent_run set input=$2 where id=$1 and user_id=$3`,
    [runId, JSON.stringify(taskInput), userId]);
  await admin.query(`update agent_run set lease_until=now()-interval '1 second'
    where id=$1 and user_id=$2`, [runId, userId]);
  await assert.rejects(verify(), /leased execution/);
  console.log(JSON.stringify({ schema: "ma24-g16-admission-local-v1", synthetic: true,
    checks: ["valid-leased-row", "live-corpus-drift-rejected", "tenant-acl-visibility-change-readback",
      "cross-account-row-hidden", "changed-question-rejected",
      "expired-lease-rejected", "gold-bytes-drift-rejected", "code-config-bytes-drift-rejected",
      "loaded-prompt-drift-rejected",
      "hash-matching-invalid-gold-rejected", "conversation-history-rejected",
      "visible-conversation-rejected"],
    providerCalls: 0 }));
} finally {
  if (created) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owners = await client.query(`select id from app_user where id=any($1::uuid[])
        and display_name='MA24 admission synthetic fixture'
        and email=id::text||'@example.invalid' for update`, [[userId, otherUserId]]);
      assert.equal(owners.rowCount, 2, "Synthetic owners must still be identifiable");
      await client.query("delete from agent_run where id=$1 and user_id=$2", [runId, userId]);
      await client.query("delete from assistant_conversation where id=$1 and user_id=$2",
        [conversationId, userId]);
      await client.query("delete from app_user where id=any($1::uuid[])", [[userId, otherUserId]]);
      await client.query("commit");
      const residual = await admin.query<{ users: string; runs: string; messages: string }>(`
        select (select count(*)::text from app_user where id=any($1::uuid[])) as users,
          (select count(*)::text from agent_run where id=$2) as runs,
          (select count(*)::text from assistant_message where conversation_id=$3) as messages`,
      [[userId, otherUserId], runId, conversationId]);
      assert.deepEqual(residual.rows[0], { users: "0", runs: "0", messages: "0" },
        "Synthetic admission rows remained after cleanup");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  await admin.end();
  await getPool().end();
}
