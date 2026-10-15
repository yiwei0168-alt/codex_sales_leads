/** Local synthetic database acceptance for MA24 task admission; no model calls. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { getPool } from "../src/lib/rag/db";
import { modeModelConfig } from "../src/lib/assistant/main/mode-config";
import { verifyMa24EvaluationTaskBinding } from "../src/lib/knowledge/evaluation/ma24-evaluation-task-binding";
import { ma24CaseQuerySha256, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24SourceSetSnapshot } from "../src/lib/knowledge/evaluation/ma24-independent-comparison";

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
const goldBytes = new TextEncoder().encode("synthetic Gold kept outside model input");
const codeAndConfigBytes = new TextEncoder().encode("synthetic code and configuration snapshot");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v2",
  sourceSetSha256: sha(sourceSetBytes),
  goldSnapshotSha256: sha(goldBytes), codeAndConfigSha256: sha(codeAndConfigBytes),
  requiredImprovementTags: [], protectedNoRegressionTags: [],
  cases: [{ caseId, caseSha256: ma24CaseQuerySha256(query), group: "synthetic",
    tags: [], expectedOutcome: "route", userId, knowledgeScope: ["industry"] }] };
const model = modeModelConfig("standard");
const taskInput = { content: query, requestKey: `ma24-admission-${runId}`, attachments: [],
  knowledgeScope: ["industry"], mode: "standard" };
const verify = () => verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes, goldBytes,
  codeAndConfigBytes, runId,
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
      `insert into assistant_conversation(id,user_id,title) values($1,$2,'MA24 synthetic admission')`,
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
  const wrongUserManifest: Ma24FrozenManifest = { ...manifest,
    cases: [{ ...manifest.cases[0], userId: otherUserId }] };
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest: wrongUserManifest,
    sourceSetBytes, goldBytes, codeAndConfigBytes, runId, leaseToken, caseId,
    arm: "baseline", loadedModelConfig: model }),
  /absent from tenant store/);
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes,
    goldBytes: new TextEncoder().encode("changed Gold"), codeAndConfigBytes,
    runId, leaseToken, caseId, arm: "baseline", loadedModelConfig: model }),
  /frozen Gold snapshot drift/);
  await assert.rejects(verifyMa24EvaluationTaskBinding({ manifest, sourceSetBytes,
    goldBytes, codeAndConfigBytes: new TextEncoder().encode("changed config"),
    runId, leaseToken, caseId, arm: "baseline", loadedModelConfig: model }),
  /frozen code and config snapshot drift/);
  await admin.query(`update agent_run set input=jsonb_set(input,'{content}',to_jsonb($2::text))
    where id=$1 and user_id=$3`, [runId, "Changed question", userId]);
  await assert.rejects(verify(), /leased execution/);
  await admin.query(`update agent_run set input=$2 where id=$1 and user_id=$3`,
    [runId, JSON.stringify(taskInput), userId]);
  await admin.query(`update agent_run set lease_until=now()-interval '1 second'
    where id=$1 and user_id=$2`, [runId, userId]);
  await assert.rejects(verify(), /leased execution/);
  console.log(JSON.stringify({ schema: "ma24-g16-admission-local-v1", synthetic: true,
    checks: ["valid-leased-row", "cross-account-row-hidden", "changed-question-rejected",
      "expired-lease-rejected", "gold-bytes-drift-rejected", "code-config-bytes-drift-rejected"],
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
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  await admin.end();
  await getPool().end();
}
