import assert from "node:assert/strict";
import { Client } from "pg";
import {
  databaseConnectionString,
  databaseSslConfiguration,
  isRemoteDatabase,
} from "../src/lib/rag/database-ssl";

assert.equal(process.argv.length, 2, "This bootstrap command takes no arguments");
const appSource = process.env.DATABASE_URL;
const migrationSource = process.env.DATABASE_MIGRATION_URL;
assert(appSource && migrationSource, "Set separate DATABASE_URL and DATABASE_MIGRATION_URL environment variables");
const appUrl = new URL(appSource), migrationUrl = new URL(migrationSource);
assert(appUrl.hostname === migrationUrl.hostname
  && (appUrl.port || "5432") === (migrationUrl.port || "5432")
  && appUrl.pathname === migrationUrl.pathname, "Application and migration URLs must target one database");
assert(appUrl.username !== migrationUrl.username, "Application and migration logins must be distinct");
assert(/^\/[a-z_][a-z0-9_]{0,62}$/i.test(appUrl.pathname), "Expected a named pilot database");
const appLogin = decodeURIComponent(appUrl.username);
assert(/^[a-z_][a-z0-9_]{0,62}$/i.test(appLogin), "Invalid pilot application login role");
assert(!["postgres", "network_copilot_app", "network_copilot_skill_collector"].includes(appLogin),
  "Pilot application login must be a separate restricted role");
assert(!process.env.DATABASE_APPLICATION_ROLE || process.env.DATABASE_APPLICATION_ROLE === "network_copilot_app",
  "This pilot bootstrap uses network_copilot_app");
const appPassword = decodeURIComponent(appUrl.password);
assert(appPassword.length >= 16, "Pilot application password must contain at least 16 characters");
if (isRemoteDatabase(appSource)) {
  assert(appUrl.searchParams.get("sslmode") === "verify-full"
    && migrationUrl.searchParams.get("sslmode") === "verify-full",
  "Remote pilot database URLs must use sslmode=verify-full");
}

const client = new Client({ connectionString: databaseConnectionString(migrationSource),
  ssl: databaseSslConfiguration(migrationSource), connectionTimeoutMillis: 5_000 });
await client.connect();
try {
  await client.query("begin");
  try {
    const existing = await client.query<{ count: number }>(`
      select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','public_evidence','langgraph')
        and c.relkind in ('r','p','v','m','S','f') and c.relname <> 'spatial_ref_sys'`);
    assert.equal(existing.rows[0]?.count, 0, "Pilot database must have empty application schemas");
    const roles = await client.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname = any($1::text[])",
      [["network_copilot_app", "network_copilot_skill_collector", appLogin]],
    );
    assert.equal(roles.rowCount, 0, "Pilot roles already exist; inspect them instead of replacing credentials");
    await client.query("create role network_copilot_app nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
    await client.query("create role network_copilot_skill_collector nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
    // Keep the password out of DDL text and command output.
    await client.query("select set_config('ma24_pilot.app_password',$1,true)", [appPassword]);
    await client.query(`do $$ begin
      execute format('create role "${appLogin}" login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password %L',
        current_setting('ma24_pilot.app_password'));
    end $$`);
    await client.query(`grant network_copilot_app to "${appLogin}"`);
    const checked = await client.query<{ appLogin: boolean; appBypass: boolean; loginCanSetApp: boolean; loginCanSetCollector: boolean }>(`
      select (select rolcanlogin from pg_roles where rolname='network_copilot_app') "appLogin",
        (select rolbypassrls from pg_roles where rolname='network_copilot_app') "appBypass",
        pg_has_role($1,'network_copilot_app','MEMBER') "loginCanSetApp",
        pg_has_role($1,'network_copilot_skill_collector','MEMBER') "loginCanSetCollector"`, [appLogin]);
    assert.deepEqual(checked.rows[0], { appLogin: false, appBypass: false,
      loginCanSetApp: true, loginCanSetCollector: false });
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
} finally { await client.end(); }
const application = new Client({ connectionString: databaseConnectionString(appSource),
  ssl: databaseSslConfiguration(appSource), connectionTimeoutMillis: 5_000 });
await application.connect();
try {
  const identity = await application.query<{ current_user: string }>("select current_user");
  assert.equal(identity.rows[0]?.current_user, appLogin);
} finally { await application.end(); }
console.log(JSON.stringify({ pilotRoleBootstrap: "passed", database: appUrl.pathname.slice(1),
  applicationLogin: appLogin, applicationRole: "network_copilot_app",
  collectorRole: "network_copilot_skill_collector", credentialsPrinted: false }));
