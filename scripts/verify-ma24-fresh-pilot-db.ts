import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { Client } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const browserCheck = process.argv.slice(2).includes("--browser");
const httpCheck = browserCheck || process.argv.slice(2).includes("--http");
assert(process.argv.slice(2).every(arg => ["--http", "--browser"].includes(arg)), "Unknown verifier argument");
const packagedServer = resolve(".next/standalone/server.js");
if (httpCheck) assert(existsSync(packagedServer), "Build the current standalone Web before --http");
if (browserCheck) {
  assert(process.env.MA24_HTTPS_PROBE_KEY && process.env.MA24_HTTPS_PROBE_CERT,
    "Set ephemeral local HTTPS probe key and certificate paths for --browser");
  const staticSource = resolve(".next/static");
  assert(existsSync(staticSource), "Build the current static assets before --browser");
  cpSync(staticSource, resolve(".next/standalone/.next/static"), { recursive: true, force: true });
}
const appSource = process.env.DATABASE_URL;
const migrationSource = process.env.DATABASE_MIGRATION_URL;
assert(appSource && migrationSource, "Separate local app and migration URLs required");
const appUrl = new URL(appSource), migrationUrl = new URL(migrationSource);
assert(["localhost", "127.0.0.1", "::1"].includes(migrationUrl.hostname));
assert.equal(appUrl.hostname, migrationUrl.hostname);
assert.equal(appUrl.port || "5432", migrationUrl.port || "5432");
assert.equal(migrationUrl.pathname, "/network_copilot_local");
assert.notEqual(appUrl.username, migrationUrl.username);
const name = `ma24_fresh_pilot_${randomBytes(6).toString("hex")}`;
assert(/^ma24_fresh_pilot_[a-f0-9]{12}$/.test(name));
const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let created = false;
try {
  await admin.query(`create database "${name}" template template0`);
  created = true;
  const appTarget = new URL(appUrl), migrationTarget = new URL(migrationUrl);
  appTarget.pathname = `/${name}`;
  migrationTarget.pathname = `/${name}`;
  const runMigration = () => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-tsx.cjs", "scripts/migrate.ts", "--fresh-pilot-through=135"], {
      cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: appTarget.toString(), DATABASE_MIGRATION_URL: migrationTarget.toString() },
    });
    let output = "";
    child.stdout.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.stderr.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.once("error", reject);
    child.once("exit", code => resolve({ code, output }));
  });
  const result = await runMigration();
  assert.equal(result.code, 0, result.output);
  const repeat = await runMigration();
  assert.notEqual(repeat.code, 0, "Fresh-only migration must reject an already initialized database");
  assert(repeat.output.includes("empty application schemas"));
  const app = new Client({ connectionString: appTarget.toString() });
  await app.connect();
  try {
    await app.query("begin");
    await app.query('set local role "network_copilot_app"');
    const checked = await app.query<{ users: number; placeholderOnly: boolean; documents: number; stage: boolean; laterStageAbsent: boolean }>(`
      select (select count(*)::int from app_user) users,
        (select bool_and(id='00000000-0000-4000-8000-000000000001'::uuid
          and email='owner@network-copilot.local' and password_hash is null) from app_user) "placeholderOnly",
        (select count(*)::int from knowledge_document) documents,
        to_regclass('public.agent_skill_acceptance_freeze') is not null stage,
        to_regclass('public.ma24_evaluation_hard_limit') is null "laterStageAbsent"`);
    assert.deepEqual(checked.rows[0], { users: 1, placeholderOnly: true, documents: 0,
      stage: true, laterStageAbsent: true });
    await app.query("rollback");
  } finally { await app.end(); }
  const credentials = [1, 2].map(index => ({
    email: `pilot-fixture-${randomBytes(12).toString("hex")}@example.invalid`,
    password: randomBytes(32).toString("base64url"),
    displayName: `Pilot fixture ${index}`,
  }));
  for (const credential of credentials) {
    const provisioned = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: appTarget.toString(),
        APP_USER_EMAIL: credential.email, APP_USER_DISPLAY_NAME: credential.displayName,
        APP_PASSWORD_SETUP: credential.password, APP_USER_ROLE: "member" };
      delete env.DATABASE_MIGRATION_URL;
      const child = spawn(process.execPath, ["scripts/run-tsx.cjs", "scripts/upsert-app-user.ts"], {
        cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env,
      });
      let output = "";
      child.stdout.on("data", data => { output = (output + String(data)).slice(-5000); });
      child.stderr.on("data", data => { output = (output + String(data)).slice(-5000); });
      child.once("error", reject);
      child.once("exit", code => resolve({ code, output }));
    });
    assert.equal(provisioned.code, 0, provisioned.output);
  }
  process.env.DATABASE_URL = appTarget.toString();
  const { findLoginUser } = await import("../src/lib/auth/users");
  const { verifyPassword } = await import("../src/lib/auth/password");
  const { addManualCompany } = await import("../src/lib/sales/manual-company");
  const { getCurrentWorkspace, updateCompanyState } = await import("../src/lib/sales/repository");
  const { getPool } = await import("../src/lib/rag/db");
  try {
    const users = await Promise.all(credentials.map(async credential => {
      const user = await findLoginUser(credential.email);
      assert(user && verifyPassword(credential.password, user.passwordHash));
      assert.equal(user.displayName, credential.displayName);
      return user;
    }));
    const [firstUser, secondUser] = users.map(user => user.id);
    const added = await addManualCompany(firstUser, {
      name: "Synthetic Pilot Company", country: "DE", website: "https://pilot-fixture.invalid",
    });
    assert.equal(added.duplicate, false);
    const first = await getCurrentWorkspace(firstUser);
    const second = await getCurrentWorkspace(secondUser);
    assert(first?.companies.some(company => company.id === added.externalId));
    assert(second && !second.companies.some(company => company.id === added.externalId));
    await assert.rejects(updateCompanyState(added.externalId, {}, secondUser), /Company not found in current workspace/);
    const firstAgain = await getCurrentWorkspace(firstUser);
    assert(firstAgain?.companies.some(company => company.id === added.externalId));
    if (httpCheck) {
      const port = await new Promise<number>((resolvePort, reject) => {
        const listener = createServer();
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", () => {
          const address = listener.address();
          assert(address && typeof address !== "string");
          listener.close(error => error ? reject(error) : resolvePort(address.port));
        });
      });
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: appTarget.toString(),
        NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" };
      const web = spawn(process.execPath, [resolve("scripts/start-ma24-pilot-web.mjs"), resolve(".next/standalone")], {
        cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env,
      });
      let webOutput = "";
      web.stdout.on("data", data => { webOutput = (webOutput + String(data)).slice(-5000); });
      web.stderr.on("data", data => { webOutput = (webOutput + String(data)).slice(-5000); });
      const base = `http://127.0.0.1:${port}`;
      try {
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (web.exitCode !== null) throw new Error(`Pilot Web exited early: ${webOutput}`);
          try { ready = (await fetch(`${base}/api/auth/session`)).ok; } catch { /* Still starting. */ }
          if (ready) break;
          await new Promise(resolveWait => setTimeout(resolveWait, 500));
        }
        assert(ready, `Pilot Web did not start: ${webOutput}`);
        const login = async (index: number) => {
          const response = await fetch(`${base}/api/auth/login`, { method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: credentials[index].email, password: credentials[index].password }) });
          assert.equal(response.status, 200, await response.text());
          const setCookie = response.headers.get("set-cookie") ?? "";
          const attributes = setCookie.split(";").slice(1).map(part => part.trim().toLowerCase());
          assert(attributes.includes("secure") && attributes.includes("httponly") && attributes.includes("samesite=lax"),
            `Unexpected cookie attributes: ${attributes.join(",")}`);
          const cookie = setCookie.split(";")[0];
          assert(cookie);
          return cookie;
        };
        const firstCookie = await login(0), secondCookie = await login(1);
        const createdByHttp = await fetch(`${base}/api/workspaces/current/companies`, {
          method: "POST", headers: { cookie: firstCookie, "content-type": "application/json" },
          body: JSON.stringify({ name: "Synthetic HTTP Pilot Company", country: "DE",
            website: "https://http-pilot-fixture.invalid" }),
        });
        if (createdByHttp.status !== 200) throw new Error(`HTTP company create ${createdByHttp.status}: ${await createdByHttp.text()}`);
        const httpCompany = await createdByHttp.json() as { duplicate: boolean; externalId: string };
        assert.equal(httpCompany.duplicate, false);
        const ownerResponse = await fetch(`${base}/api/workspaces/current`, { headers: { cookie: firstCookie } });
        assert.equal(ownerResponse.status, 200);
        const ownerWorkspace = await ownerResponse.json() as { companies: Array<{ id: string }> };
        assert(ownerWorkspace.companies.some(company => company.id === added.externalId));
        assert(ownerWorkspace.companies.some(company => company.id === httpCompany.externalId));
        const otherResponse = await fetch(`${base}/api/workspaces/current`, { headers: { cookie: secondCookie } });
        assert.equal(otherResponse.status, 200);
        const otherWorkspace = await otherResponse.json() as { companies: Array<{ id: string }> };
        assert(!otherWorkspace.companies.some(company => company.id === added.externalId));
        assert(!otherWorkspace.companies.some(company => company.id === httpCompany.externalId));
        const denied = await fetch(`${base}/api/workspaces/current/companies/${encodeURIComponent(httpCompany.externalId)}`, {
          method: "PATCH", headers: { cookie: secondCookie, "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision: 0, priority: "High" }),
        });
        assert.equal(denied.status, 404);
        const afterDenied = await fetch(`${base}/api/workspaces/current`, { headers: { cookie: firstCookie } });
        assert.equal(afterDenied.status, 200);
        const afterDeniedWorkspace = await afterDenied.json() as { companies: Array<{ id: string }> };
        assert(afterDeniedWorkspace.companies.some(company => company.id === httpCompany.externalId));
        const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: firstCookie } });
        assert.equal(logout.status, 200);
        const loggedOut = await fetch(`${base}/api/auth/session`, { headers: { cookie: firstCookie } });
        assert.equal((await loggedOut.json() as { authenticated: boolean }).authenticated, false);
        if (browserCheck) {
          const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
            const browserEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: appTarget.toString(),
              DATABASE_MIGRATION_URL: migrationTarget.toString(), MA24_HTTPS_PROBE_UPSTREAM: base };
            delete browserEnv.MA24_HTTPS_PROBE_OLD_WEB;
            const child = spawn(process.execPath, ["scripts/run-tsx.cjs", "scripts/verify-ma24-https-browser-session.ts"], {
              cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: browserEnv,
            });
            let output = "";
            child.stdout.on("data", data => { output = (output + String(data)).slice(-5000); });
            child.stderr.on("data", data => { output = (output + String(data)).slice(-5000); });
            child.once("error", reject);
            child.once("exit", code => resolveResult({ code, output }));
          });
          assert.equal(result.code, 0, result.output);
          assert(result.output.includes('"httpsBrowserSession":"passed"'), result.output);
        }
      } finally {
        if (web.exitCode === null) {
          web.kill();
          await new Promise(resolveWait => web.once("exit", resolveWait));
        }
      }
    }
  } finally { await getPool().end(); }
  console.log(JSON.stringify({ disposableDatabase: true, migrationThrough: 135, seededNonLoginPlaceholder: 1,
    realUsers: 0, documents: 0, applicationLoginChecked: true, stagePresent: true,
    laterStageAbsent: true, repeatRejected: true, syntheticMembers: 2,
    membersProvisionedThroughAppRole: true, passwordsVerified: true,
    manualCompanyWrittenAndRead: true, otherMemberReadAndWriteDenied: true,
    packagedHttpLoginWriteReadIsolationAndLogout: httpCheck,
    loopbackHttpsBrowserWorkflow: browserCheck, copiedProductionData: false }));
} finally {
  if (created) await admin.query(`drop database "${name}" with (force)`);
  await admin.end();
}
