import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import nextEnv from "@next/env";
import { Client } from "pg";
import { applyVerifiedMa24Stage, ma24StageMarkers, verifiedMa24StageSql } from "./lib/ma24-stage-127-135";

nextEnv.loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(configured, "A local PostgreSQL connection is required");
const source = new URL(configured);
assert(["localhost", "127.0.0.1", "::1"].includes(source.hostname), "Remote database is not allowed");
const archiveDirectory = resolve("backups/database");
const archiveNames = (await readdir(archiveDirectory)).filter(name => /^network_copilot_.*\.dump$/.test(name));
assert(archiveNames.length, "No local backup archive found");
const requestedArchive = process.env.MA24_RESTORE_ARCHIVE?.trim();
if (requestedArchive) assert(archiveNames.includes(requestedArchive), "Requested local backup archive is unavailable");
const selected = requestedArchive ?? (await Promise.all(archiveNames.map(async name => ({ name, time: (await stat(join(archiveDirectory, name))).mtimeMs }))))
  .sort((a, b) => b.time - a.time)[0].name;
const archive = join(archiveDirectory, selected);
const manifest = JSON.parse(await readFile(`${archive}.json`, "utf8")) as { sha256: string; bytes: number; aclIncluded?: boolean };
const hash = createHash("sha256");
for await (const chunk of createReadStream(archive)) hash.update(chunk);
assert.equal(hash.digest("hex"), manifest.sha256, "Backup checksum mismatch");
assert.equal((await stat(archive)).size, manifest.bytes, "Backup size mismatch");

const database = `ma24_restore_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const quoted = `"${database}"`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const cloneUrl = new URL(source); cloneUrl.pathname = `/${database}`;
const admin = new Client({ connectionString: adminUrl.toString() });
const clone = new Client({ connectionString: cloneUrl.toString() });
let created = false;
let cloneConnected = false;
const stageFiles = await verifiedMa24StageSql();
const markers = () => ma24StageMarkers(clone);
const apply = () => applyVerifiedMa24Stage(clone, stageFiles);
const restore = async () => {
  const binary = process.env.PG_RESTORE_PATH || "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe";
  const env = {
    ...process.env,
    PGHOST: source.hostname,
    PGPORT: source.port || "5432",
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGDATABASE: database,
  };
  return new Promise<void>((accept, reject) => {
    const child = spawn(binary, ["--exit-on-error", "--no-owner", ...(manifest.aclIncluded ? [] : ["--no-acl"]), "--jobs=4", "--dbname", database,
      "--use-list", `${archive}.restore-list`, archive], { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", part => { errorText = `${errorText}${part}`.slice(-4000); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? accept() : reject(new Error(`pg_restore exited ${code}: ${errorText}`)));
  });
};

await admin.connect();
try {
  await admin.query(`create database ${quoted}`);
  created = true;
  await restore();
  await clone.connect();
  cloneConnected = true;
  const before = await markers();
  const structurePresent = Object.entries(before).every(([name, present]) => name === "skill_freeze_reader" || present);
  let rollbackVerified = false;
  let committedOnDisposableClone = false;
  let access: Record<string, boolean>;
  if (structurePresent) {
    access = (await clone.query(`select
      has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','SELECT') as review_read,
      has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','INSERT') as review_insert,
      has_table_privilege('network_copilot_app','agent_skill_acceptance_bundle','INSERT') as app_bundle_insert,
      has_table_privilege('network_copilot_skill_collector','agent_skill_acceptance_bundle','INSERT') as collector_bundle_insert,
      (select relrowsecurity and relforcerowsecurity from pg_class where oid='agent_skill_acceptance_bundle'::regclass) as bundle_forced_rls,
      (select relrowsecurity and relforcerowsecurity from pg_class where oid='knowledge_upload_extraction_review'::regclass) as review_forced_rls`)).rows[0] as Record<string, boolean>;
    if (manifest.aclIncluded) {
      assert.deepEqual(access, { review_read: true, review_insert: true, app_bundle_insert: false,
        collector_bundle_insert: true, bundle_forced_rls: true, review_forced_rls: true },
      "Restored stage ACL or RLS boundary failed");
    } else {
      assert.equal(access.bundle_forced_rls, true, "Restored bundle RLS boundary failed");
      assert.equal(access.review_forced_rls, true, "Restored review RLS boundary failed");
    }
  } else {
    await clone.query("begin");
    try {
      await apply();
      assert(Object.values(await markers()).every(Boolean), "Migration markers incomplete");
    } finally {
      await clone.query("rollback");
    }
    assert.deepEqual(await markers(), before, "Rollback did not restore the original schema markers");
    rollbackVerified = true;
    await clone.query("begin");
    try {
      await apply();
      await clone.query("commit");
    } catch (error) {
      await clone.query("rollback");
      throw error;
    }
    committedOnDisposableClone = true;
    access = (await clone.query(`select
      has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','SELECT') as review_read,
      has_table_privilege('network_copilot_app','knowledge_upload_extraction_review','INSERT') as review_insert,
      has_table_privilege('network_copilot_app','agent_skill_acceptance_bundle','INSERT') as app_bundle_insert,
      has_table_privilege('network_copilot_skill_collector','agent_skill_acceptance_bundle','INSERT') as collector_bundle_insert,
      (select relrowsecurity and relforcerowsecurity from pg_class where oid='agent_skill_acceptance_bundle'::regclass) as bundle_forced_rls`)).rows[0] as Record<string, boolean>;
    assert.deepEqual(access, { review_read: true, review_insert: true, app_bundle_insert: false,
      collector_bundle_insert: true, bundle_forced_rls: true }, "Critical migration ACL or RLS boundary failed");
  }
  const after = await markers();
  if (structurePresent) assert.deepEqual(after, before, "Restored schema changed during verification");
  else assert(Object.values(after).every(Boolean), "Committed migration markers incomplete");
  let webCompatibility: unknown;
  if (process.argv.includes("--web-compat")) {
    const application = process.env.DATABASE_URL;
    assert(application, "Web compatibility needs an application database URL");
    const applicationSource = new URL(application);
    assert.equal(applicationSource.hostname, source.hostname);
    assert.equal(applicationSource.port || "5432", source.port || "5432");
    assert.equal(applicationSource.pathname, source.pathname);
    applicationSource.pathname = `/${database}`;
    const copiedAcl = { tables: 0, sequences: 0, functions: 0, langgraphTables: 0, grants: 0 };
    if (!manifest.aclIncluded) {
      const sourceAcl = new Client({ connectionString: source.toString() });
      await sourceAcl.connect();
      const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
      try {
      const tables = (await sourceAcl.query<{ name: string; privileges: string[] }>(`select c.relname as name,
        array_remove(array[
          case when has_table_privilege('network_copilot_app',c.oid,'SELECT') then 'SELECT' end,
          case when has_table_privilege('network_copilot_app',c.oid,'INSERT') then 'INSERT' end,
          case when has_table_privilege('network_copilot_app',c.oid,'UPDATE') then 'UPDATE' end,
          case when has_table_privilege('network_copilot_app',c.oid,'DELETE') then 'DELETE' end],null) as privileges
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v') order by c.relname`)).rows;
      for (const table of tables) {
        if (!table.privileges.length) continue;
        await clone.query(`grant ${table.privileges.join(',')} on table ${identifier(table.name)} to network_copilot_app`);
        copiedAcl.tables++;copiedAcl.grants += table.privileges.length;
      }
      const sequences = (await sourceAcl.query<{ name: string; privileges: string[] }>(`select c.relname as name,
        array_remove(array[
          case when has_sequence_privilege('network_copilot_app',c.oid,'USAGE') then 'USAGE' end,
          case when has_sequence_privilege('network_copilot_app',c.oid,'SELECT') then 'SELECT' end,
          case when has_sequence_privilege('network_copilot_app',c.oid,'UPDATE') then 'UPDATE' end],null) as privileges
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='S' order by c.relname`)).rows;
      for (const sequence of sequences) {
        if (!sequence.privileges.length) continue;
        await clone.query(`grant ${sequence.privileges.join(',')} on sequence ${identifier(sequence.name)} to network_copilot_app`);
        copiedAcl.sequences++;copiedAcl.grants += sequence.privileges.length;
      }
      const functions = (await sourceAcl.query<{ signature: string }>(`select p.oid::regprocedure::text as signature
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prokind='f'
          and has_function_privilege('network_copilot_app',p.oid,'EXECUTE') order by p.oid`)).rows;
      for (const item of functions) {
        await clone.query(`grant execute on function ${item.signature} to network_copilot_app`);
        copiedAcl.functions++;copiedAcl.grants++;
      }
      const schemaAllowed = (await sourceAcl.query<{ allowed: boolean }>(
        "select has_schema_privilege('network_copilot_app','public','USAGE') as allowed",
      )).rows[0].allowed;
      if (schemaAllowed) {
        await clone.query("grant usage on schema public to network_copilot_app");
        copiedAcl.grants++;
      }
      for (const role of ["network_copilot_app", "network_copilot_local_login"]) {
        const langgraphSchemaAllowed = (await sourceAcl.query<{ allowed: boolean }>(
          "select has_schema_privilege($1,'langgraph','USAGE') as allowed", [role],
        )).rows[0].allowed;
        if (langgraphSchemaAllowed) {
          await clone.query(`grant usage on schema langgraph to ${identifier(role)}`);
          copiedAcl.grants++;
        }
        const langgraphTables = (await sourceAcl.query<{ name: string; privileges: string[] }>(`select c.relname as name,
          array_remove(array[
            case when has_table_privilege($1,c.oid,'SELECT') then 'SELECT' end,
            case when has_table_privilege($1,c.oid,'INSERT') then 'INSERT' end,
            case when has_table_privilege($1,c.oid,'UPDATE') then 'UPDATE' end,
            case when has_table_privilege($1,c.oid,'DELETE') then 'DELETE' end],null) as privileges
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='langgraph' and c.relkind in ('r','p') order by c.relname`, [role])).rows;
        for (const table of langgraphTables) {
          if (!table.privileges.length) continue;
          await clone.query(`grant ${table.privileges.join(',')} on table langgraph.${identifier(table.name)} to ${identifier(role)}`);
          copiedAcl.langgraphTables++;copiedAcl.grants += table.privileges.length;
        }
      }
      } finally {
        await sourceAcl.end();
      }
    }
    const oldRouteAcl = (await clone.query(`select
      has_table_privilege('network_copilot_app','app_user','SELECT') as user_read,
      has_table_privilege('network_copilot_app','auth_login_attempt','SELECT') as login_attempt_read,
      has_table_privilege('network_copilot_app','auth_login_attempt','INSERT') as login_attempt_insert,
      has_table_privilege('network_copilot_app','app_session','INSERT') as session_insert,
      has_table_privilege('network_copilot_app','knowledge_upload_job','SELECT') as upload_read`)).rows[0];
    console.log(JSON.stringify({ clone: database,
      diagnostic: manifest.aclIncluded ? "archive-restored-application-acl" : "source-equivalent-application-acl-on-clone",
      copiedAcl, oldRouteAcl }));
    assert(Object.values(oldRouteAcl).every(Boolean), "Restored clone lacks old Web route privileges");
    const { verifyMa24WebCloneCompatibility } = await import("./lib/verify-ma24-web-clone-compatibility");
    webCompatibility = await verifyMa24WebCloneCompatibility({ admin: clone,
      applicationDatabaseUrl: applicationSource.toString(), migrationDatabaseUrl: cloneUrl.toString(),
      reviewUi: process.argv.includes("--review-ui"),
      thothReviewUi: process.argv.includes("--thoth-review-ui"),
      conversationUi: process.argv.includes("--conversation-ui"),
      frontendUi: process.argv.includes("--frontend-ui"),
      mailboxBatchUi: process.argv.includes("--mailbox-batch-ui"),
      mailboxSyncUi: process.argv.includes("--mailbox-sync-ui"),
      mailboxReaderUi: process.argv.includes("--mailbox-reader-ui"),
      attachmentUi: process.argv.includes("--attachment-ui"),
      runHistoryUi: process.argv.includes("--run-history-ui"),
      revisionHistoryUi: process.argv.includes("--revision-history-ui"),
      agentLibraryUi: process.argv.includes("--agent-library-ui"),
      rawJsonUi: process.argv.includes("--raw-json-ui"),
      skillReplayRawJsonUi: process.argv.includes("--skill-replay-raw-json-ui"),
      nonMailApprovalRawJsonUi: process.argv.includes("--non-mail-approval-raw-json-ui") });
  }
  console.log(JSON.stringify({ archive: selected, archiveSha256: manifest.sha256, restored: true,
    migrationRange: "127-135", backupStageState: structurePresent ? "schema-present" : "schema-absent",
    rollbackVerified, committedOnDisposableClone, aclIncludedInArchive: Boolean(manifest.aclIncluded),
    before, after, access, productionChanged: false, fullIntegrityRestore: true,
    skippedConstraints: [], ...(webCompatibility ? { webCompatibility } : {}) }));
} finally {
  if (cloneConnected) await clone.end();
  if (created) await admin.query(`drop database ${quoted} with (force)`);
  await admin.end();
}
