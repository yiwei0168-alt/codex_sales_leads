import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client } from "pg";

const id = randomBytes(6).toString("hex");
const containerName = `ma24-pilot-fresh-${id}`;
const adminPassword = randomBytes(24).toString("hex");
const appPassword = randomBytes(24).toString("hex");
const port = await new Promise<number>((resolvePort, reject) => {
  const listener = createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    assert(address && typeof address !== "string");
    listener.close(error => error ? reject(error) : resolvePort(address.port));
  });
});
const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"], env });
    let output = "";
    child.stdout.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.stderr.on("data", data => { output = (output + String(data)).slice(-5000); });
    child.once("error", reject);
    child.once("exit", code => resolveRun({ code, output }));
  });
const adminUrl = new URL(`postgresql://postgres:${adminPassword}@127.0.0.1:${port}/network_copilot_local`);
const appUrl = new URL(`postgresql://network_copilot_local_login:${appPassword}@127.0.0.1:${port}/network_copilot_local`);
let containerId: string | undefined;
try {
  const started = await run("docker", ["run", "--detach", "--name", containerName,
    "--publish", `127.0.0.1:${port}:5432`, "--env", `POSTGRES_PASSWORD=${adminPassword}`,
    "--env", "POSTGRES_DB=network_copilot_local", "pgvector/pgvector:pg16"]);
  assert.equal(started.code, 0, started.output);
  containerId = started.output.trim();
  assert(/^[a-f0-9]{64}$/.test(containerId), "Unexpected disposable container ID");
  let connected = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 1000 });
    try { await probe.connect(); connected = true; await probe.end(); break; }
    catch { await probe.end().catch(() => undefined); await new Promise(wait => setTimeout(wait, 500)); }
  }
  assert(connected, "Disposable PostgreSQL did not become ready");
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`
      create role network_copilot_app nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
      create role network_copilot_skill_collector nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
      create role network_copilot_local_login login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${appPassword}';
      grant network_copilot_app to network_copilot_local_login;
    `);
    const roles = await admin.query<{ appLogin: boolean; appBypass: boolean; loginCanSetApp: boolean; loginCanSetCollector: boolean }>(`
      select (select rolcanlogin from pg_roles where rolname='network_copilot_app') "appLogin",
        (select rolbypassrls from pg_roles where rolname='network_copilot_app') "appBypass",
        pg_has_role('network_copilot_local_login','network_copilot_app','MEMBER') "loginCanSetApp",
        pg_has_role('network_copilot_local_login','network_copilot_skill_collector','MEMBER') "loginCanSetCollector"`);
    assert.deepEqual(roles.rows[0], { appLogin: false, appBypass: false,
      loginCanSetApp: true, loginCanSetCollector: false });
  } finally { await admin.end(); }
  const verified = await run(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/verify-ma24-fresh-pilot-db.ts", "--restore"],
    { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
  assert.equal(verified.code, 0, verified.output);
  assert(verified.output.includes('"freshPilotRestore":"passed"'), verified.output);
  assert(verified.output.includes('"copiedProductionData":false'), verified.output);
  console.log(JSON.stringify({ freshClusterPilot: "passed", image: "pgvector/pgvector:pg16",
    publishedAddress: "127.0.0.1 only", rolesVerified: true, freshMigrationThrough: 135,
    syntheticAccountCompanyAndRestoreVerified: true, copiedProductionData: false }));
} finally {
  if (containerId) {
    const removed = await run("docker", ["rm", "--force", "--volumes", containerId]);
    assert.equal(removed.code, 0, removed.output);
  }
}
