import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { Client } from "pg";

const args=process.argv.slice(2);
assert(args.length<=1&&args.every(arg=>arg==='--current-schema'),"Only --current-schema is supported");
const currentSchema=args.includes('--current-schema');
const appSource = process.env.DATABASE_URL;
const migrationSource = process.env.DATABASE_MIGRATION_URL;
const outputSource = process.env.PILOT_BACKUP_DIR;
assert(appSource && migrationSource && outputSource, "Set application, migration, and PILOT_BACKUP_DIR variables");
const appUrl = new URL(appSource), migrationUrl = new URL(migrationSource);
assert(["localhost", "127.0.0.1", "::1"].includes(migrationUrl.hostname.toLowerCase()),
  "Pilot backup requires a local PostgreSQL connection on the target host");
assert(appUrl.hostname === migrationUrl.hostname
  && (appUrl.port || "5432") === (migrationUrl.port || "5432")
  && appUrl.pathname === migrationUrl.pathname
  && appUrl.username !== migrationUrl.username, "Separate application and migration URLs must target one database");
const database = appUrl.pathname.slice(1);
assert(/^[a-z_][a-z0-9_]{0,62}$/i.test(database), "Invalid pilot database name");
assert(isAbsolute(outputSource), "PILOT_BACKUP_DIR must be an absolute path outside the source worktree");
const repositoryRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const assertOutsideWorktree = (path: string) => {
  const inside = relative(repositoryRoot, path);
  assert(inside && (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)),
    "Backups must stay outside the source worktree");
};
assertOutsideWorktree(resolve(outputSource));
process.umask(0o077);
await mkdir(outputSource, { recursive: true, mode: 0o700 });
const directory = await realpath(outputSource);
assertOutsideWorktree(directory);
if (process.platform !== "win32") {
  assert.equal((await stat(directory)).mode & 0o077, 0,
    "Pilot backup directory must not be accessible to other users");
}
const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const filename = `ma24_pilot_${stamp}_${randomBytes(4).toString("hex")}.dump`;
const archive = join(directory, filename);
const manifestPath = `${archive}.json`;
const restoredDatabase = `ma24_pilot_restore_${randomBytes(6).toString("hex")}`;
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const pgEnv: NodeJS.ProcessEnv = { ...process.env, PGHOST: migrationUrl.hostname,
  PGPORT: migrationUrl.port || "5432", PGUSER: decodeURIComponent(migrationUrl.username),
  PGPASSWORD: decodeURIComponent(migrationUrl.password) };
const pgDump = process.env.PG_DUMP_PATH || (process.platform === "win32"
  ? "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe" : "pg_dump");
const pgRestore = process.env.PG_RESTORE_PATH || (process.platform === "win32"
  ? "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe" : "pg_restore");
const run = (command: string, args: string[]) => new Promise<{ code: number | null; output: string }>((accept, reject) => {
  const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env: pgEnv });
  let output = "";
  child.stderr.on("data", part => { output = (output + String(part)).slice(-4000); });
  child.once("error", reject);
  child.once("exit", code => accept({ code, output }));
});
const snapshotSql = `select
  (select count(*)::int from app_user) users,
  (select count(*)::int from market_workspace) workspaces,
  (select count(*)::int from workspace_company) "workspaceCompanies",
  (select count(*)::int from knowledge_document) documents,
  (select md5(coalesce(string_agg(id::text || ':' || email, ',' order by id),'')) from app_user) "accountDigest",
  to_regclass('public.agent_skill_acceptance_freeze') is not null "stage135Present",
  to_regclass('public.ma24_evaluation_hard_limit') is null "laterStageAbsent",
  to_regprocedure('public.lock_local_memory_extraction_source(uuid,uuid,text)') is not null "localMemorySourceLockPresent",
  to_regprocedure('public.lock_local_memory_receipt_source(uuid)') is not null "receiptSourceLockPresent",
  to_regprocedure('public.capture_immutable_asset_snapshot(uuid,text,bytea)') is not null "immutableAssetCapturePresent",
  ${currentSchema?`(select md5(coalesce(string_agg(id::text || ':' || asset_id::text || ':' || source_sha256 || ':' || byte_size::text || ':' || encode(digest(body,'sha256'),'hex'),',' order by id),'')) from knowledge_asset_immutable_snapshot)`:'null::text'} "immutableAssetSnapshotDigest",
  ${currentSchema?`(select count(*)::int from skill_runner_trust_registry_version)`:'0::int'} "trustRegistryVersions",
  ${currentSchema?`(select md5(coalesce(string_agg(to_jsonb(v)::text,'|' order by revision),'')) from skill_runner_trust_registry_version v)`:'null::text'} "trustRegistryVersionDigest",
  ${currentSchema?`(select md5(coalesce(string_agg(to_jsonb(c)::text,'|'),'')) from skill_runner_trust_registry_current c)`:'null::text'} "trustRegistryPointerDigest",
  (select count(*)=2 from information_schema.columns where table_schema='public' and table_name='mailbox_sync_run'
    and column_name in ('work_job_id','work_lease_token')) "mailboxWorkerBinding",
  (select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from mailbox_connection t) "mailboxConnectionsDigest",
  (select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from mailbox_work_job t) "mailboxWorkDigest",
  (select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from mailbox_sync_run t) "mailboxRunsDigest",
  (select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from mailbox_message t) "mailboxMessagesDigest",
  (select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from mailbox_sync_cursor t) "mailboxCursorsDigest"`;
const visibleCompanies = async (connectionString: string, userId: string) => {
  const app = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await app.connect();
  try {
    await app.query("begin");
    try {
      await app.query('set local role "network_copilot_app"');
      await app.query("select set_config('app.current_user_id',$1,true)", [userId]);
      return (await app.query<{ id: string }>(
        "select record->>'id' as id from user_company_market order by record->>'id'"))
        .rows.map(row => row.id);
    } finally { await app.query("rollback"); }
  } finally { await app.end(); }
};
const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5_000 });
await admin.connect();
let restoredCreated = false;
let success = false;
try {
  const source = new Client({ connectionString: migrationUrl.toString(), connectionTimeoutMillis: 5_000 });
  await source.connect();
  let sourceSnapshot: Record<string, unknown>;
  try {
    await source.query('begin isolation level repeatable read read only');
    await source.query("set local timezone='UTC'");
    sourceSnapshot = (await source.query(snapshotSql)).rows[0];
    assert(sourceSnapshot.stage135Present&&(currentSchema
      ?!sourceSnapshot.laterStageAbsent&&sourceSnapshot.mailboxWorkerBinding
      :sourceSnapshot.laterStageAbsent&&!sourceSnapshot.mailboxWorkerBinding),
      currentSchema?"Pilot backup requires current schema through 153":"Pilot backup requires historical schema through 135");
    const snapshot=(await source.query<{snapshot:string}>('select pg_export_snapshot() snapshot')).rows[0].snapshot;
    assert(/^[0-9a-f-]+$/i.test(snapshot),'Invalid exported snapshot ID');
    const dumped = await run(pgDump, ["--format=custom", "--no-owner", "--snapshot",snapshot,"--file", archive, "--dbname", database]);
    assert.equal(dumped.code, 0, dumped.output);
    await source.query('commit');
  }catch(error){await source.query('rollback');throw error;}finally { await source.end(); }
  const listed = await run(pgRestore, ["--list", archive]);
  assert.equal(listed.code, 0, listed.output);
  const bytes = (await stat(archive)).size;
  assert(bytes > 0, "Pilot backup archive is empty");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  await admin.query(`create database "${restoredDatabase}" template template0`);
  restoredCreated = true;
  const restored = await run(pgRestore,
    ["--exit-on-error", "--no-owner", "--dbname", restoredDatabase, archive]);
  assert.equal(restored.code, 0, restored.output);
  const restoredAdminUrl = new URL(migrationUrl);
  restoredAdminUrl.pathname = `/${restoredDatabase}`;
  const restoredAdmin = new Client({ connectionString: restoredAdminUrl.toString() });
  await restoredAdmin.connect();
  let memberIds: string[];
  try {
    await restoredAdmin.query("set timezone='UTC'");
    assert.deepEqual((await restoredAdmin.query(snapshotSql)).rows[0], sourceSnapshot,
      "Restored pilot account, workspace, and document snapshot differs from source");
    memberIds = (await restoredAdmin.query<{ id: string }>(
      "select id from app_user where status='active' and password_hash is not null order by id limit 2"))
      .rows.map(row => row.id);
  } finally { await restoredAdmin.end(); }
  const restoredAppUrl = new URL(appUrl);
  restoredAppUrl.pathname = `/${restoredDatabase}`;
  const restoredApp = new Client({ connectionString: restoredAppUrl.toString() });
  await restoredApp.connect();
  try {
    await restoredApp.query("begin");
    try {
      await restoredApp.query('set local role "network_copilot_app"');
      await restoredApp.query("select count(*)::int from app_user");
    } finally { await restoredApp.query("rollback"); }
  } finally { await restoredApp.end(); }
  for (const userId of memberIds) {
    assert.deepEqual(await visibleCompanies(restoredAppUrl.toString(), userId),
      await visibleCompanies(appUrl.toString(), userId), "Restored member-visible companies differ from source");
  }
  const manifest = { schema: "ma24-pilot-backup-v1", createdAt: new Date().toISOString(),
    file: filename, bytes, sha256, format: "PostgreSQL custom archive", ownerIncluded: false,
    aclIncluded: true, restoredToSecondDatabase: true, restrictedApplicationRead: true,
    tenantVisibilityMatched: true, tenantMembersCompared: memberIds.length,
    consistentExportedSnapshot:true,currentSchema,mailboxLogicalDigestsMatched:true,sourceSnapshot };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const entries = await readdir(directory);
  assert(entries.includes(filename) && entries.includes(`${filename}.json`));
  success = true;
  console.log(JSON.stringify({ pilotBackupRestore: "passed", archiveFile: filename,
    bytes, sha256, restoredToSecondDatabase: true, restrictedApplicationRead: true,
    tenantVisibilityMatched: true, tenantMembersCompared: memberIds.length,
    consistentExportedSnapshot:true,currentSchema,mailboxLogicalDigestsMatched:true,
    trustRegistryVersionsCompared:sourceSnapshot.trustRegistryVersions,trustRegistryDigestsMatched:currentSchema }));
} finally {
  try {
    if (restoredCreated) await admin.query(`drop database "${restoredDatabase}" with (force)`);
  } finally {
    try { await admin.end(); }
    finally {
      if (!success) {
        await rm(archive, { force: true });
        await rm(manifestPath, { force: true });
      }
    }
  }
}
