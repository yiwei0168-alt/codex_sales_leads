import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client } from "pg";

const id = randomBytes(6).toString("hex");
const containerName = `ma24-pilot-fresh-${id}`;
const webImageArgument = process.argv[2];
const webImage = webImageArgument?.startsWith("--web-image=")
  ? webImageArgument.slice("--web-image=".length) : undefined;
assert(process.argv.length <= 3 && (!webImageArgument || (webImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(webImage))),
  "Expected one local --web-image=<tag> argument");
const networkName = `ma24-pilot-net-${id}`;
const adminPassword = randomBytes(24).toString("hex");
const appPassword = randomBytes(24).toString("hex");
const availablePort = () => new Promise<number>((resolvePort, reject) => {
  const listener = createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    assert(address && typeof address !== "string");
    listener.close(error => error ? reject(error) : resolvePort(address.port));
  });
});
const port = await availablePort();
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
let webContainerId: string | undefined;
let networkId: string | undefined;
try {
  if (webImage) {
    const created = await run("docker", ["network", "create", networkName]);
    assert.equal(created.code, 0, created.output);
    networkId = created.output.trim();
    assert(/^[a-f0-9]{64}$/.test(networkId), "Unexpected disposable network ID");
  }
  const started = await run("docker", ["run", "--detach", "--name", containerName,
    ...(webImage ? ["--network", networkName, "--network-alias", "pilot-db"] : []),
    "--publish", `127.0.0.1:${port}:5432`, "--env", `POSTGRES_PASSWORD=${adminPassword}`,
    "--env", "POSTGRES_DB=network_copilot_local", "pgvector/pgvector:pg16",
    ...(webImage ? ["bash", "-ec", [
      "openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=pilot-db",
      "-addext subjectAltName=DNS:pilot-db -keyout /tmp/ma24-server.key",
      "-out /tmp/ma24-server.crt >/dev/null 2>&1;",
      "chmod 600 /tmp/ma24-server.key; chown postgres:postgres /tmp/ma24-server.key /tmp/ma24-server.crt;",
      "exec docker-entrypoint.sh postgres -c ssl=on",
      "-c ssl_cert_file=/tmp/ma24-server.crt -c ssl_key_file=/tmp/ma24-server.key",
    ].join(" ")] : [])]);
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
  if (webImage) {
    const migration = await run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/migrate.ts", "--fresh-pilot-through=135"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
    assert.equal(migration.code, 0, migration.output);
    const credentials = [1, 2].map(index => ({
      email: `pilot-container-${id}-${index}@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    }));
    for (const credential of credentials) {
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: appUrl.toString(),
        APP_USER_EMAIL: credential.email, APP_USER_DISPLAY_NAME: "Synthetic pilot member",
        APP_PASSWORD_SETUP: credential.password, APP_USER_ROLE: "member" };
      delete env.DATABASE_MIGRATION_URL;
      const provisioned = await run(process.execPath, ["scripts/run-tsx.cjs", "scripts/upsert-app-user.ts"], env);
      assert.equal(provisioned.code, 0, provisioned.output);
    }
    const webPort = await availablePort();
    const webDatabaseUrl = new URL(appUrl);
    webDatabaseUrl.hostname = "pilot-db";
    webDatabaseUrl.port = "5432";
    webDatabaseUrl.searchParams.set("sslmode", "verify-full");
    const certificate = await run("docker", ["exec", containerId, "cat", "/tmp/ma24-server.crt"]);
    assert.equal(certificate.code, 0, certificate.output);
    assert(certificate.output.includes("-----BEGIN CERTIFICATE-----"));
    const webStarted = await run("docker", ["run", "--detach", "--name", `ma24-pilot-web-${id}`,
      "--network", networkName, "--publish", `127.0.0.1:${webPort}:3000`,
      "--env", `DATABASE_URL=${webDatabaseUrl.toString()}`,
      "--env", `DATABASE_SSL_CA=${certificate.output.trim()}`, webImage]);
    assert.equal(webStarted.code, 0, webStarted.output);
    webContainerId = webStarted.output.trim();
    assert(/^[a-f0-9]{64}$/.test(webContainerId), "Unexpected disposable Web container ID");
    const base = `http://127.0.0.1:${webPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { ready = (await fetch(`${base}/api/auth/session`)).ok; } catch { /* Still starting. */ }
      if (ready) break;
      await new Promise(wait => setTimeout(wait, 500));
    }
    assert(ready, "Disposable Linux Web did not become ready");
    const login = async (index: number) => {
      const response = await fetch(`${base}/api/auth/login`, { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials[index]) });
      if (response.status !== 200) {
        const logs = await run("docker", ["logs", webContainerId!]);
        throw new Error(`Linux Web login ${response.status}: ${await response.text()}\n${logs.output}`
          .replaceAll(appPassword, "<redacted>"));
      }
      const setCookie = response.headers.get("set-cookie") ?? "";
      const attributes = setCookie.split(";").slice(1).map(part => part.trim().toLowerCase());
      assert(attributes.includes("secure") && attributes.includes("httponly") && attributes.includes("samesite=lax"));
      const cookie = setCookie.split(";")[0];
      assert(cookie);
      return cookie;
    };
    const firstCookie = await login(0), secondCookie = await login(1);
    const created = await fetch(`${base}/api/workspaces/current/companies`, { method: "POST",
      headers: { cookie: firstCookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Synthetic Linux Pilot Company", country: "DE",
        website: `https://pilot-container-${id}.invalid` }) });
    if (created.status !== 200) throw new Error(`Linux Web company create ${created.status}: ${await created.text()}`);
    const company = await created.json() as { duplicate: boolean; externalId: string };
    assert.equal(company.duplicate, false);
    const getCompanies = async (cookie: string) => {
      const response = await fetch(`${base}/api/workspaces/current`, { headers: { cookie } });
      assert.equal(response.status, 200);
      return (await response.json() as { companies: Array<{ id: string }> }).companies;
    };
    assert((await getCompanies(firstCookie)).some(item => item.id === company.externalId));
    assert(!(await getCompanies(secondCookie)).some(item => item.id === company.externalId));
    const denied = await fetch(`${base}/api/workspaces/current/companies/${encodeURIComponent(company.externalId)}`,
      { method: "PATCH", headers: { cookie: secondCookie, "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, priority: "High" }) });
    assert.equal(denied.status, 404);
    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: firstCookie } });
    assert.equal(logout.status, 200);
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: firstCookie } });
    assert.equal((await session.json() as { authenticated: boolean }).authenticated, false);
  }
  console.log(JSON.stringify({ freshClusterPilot: "passed", image: "pgvector/pgvector:pg16",
    publishedAddress: "127.0.0.1 only", rolesVerified: true, freshMigrationThrough: 135,
    syntheticAccountCompanyAndRestoreVerified: true, copiedProductionData: false,
    linuxWebImage: webImage ?? null, linuxWebHttpWorkflowVerified: Boolean(webImage) }));
} finally {
  if (webContainerId) {
    const removed = await run("docker", ["rm", "--force", "--volumes", webContainerId]);
    assert.equal(removed.code, 0, removed.output);
  }
  if (containerId) {
    const removed = await run("docker", ["rm", "--force", "--volumes", containerId]);
    assert.equal(removed.code, 0, removed.output);
  }
  if (networkId) {
    const removed = await run("docker", ["network", "rm", networkId]);
    assert.equal(removed.code, 0, removed.output);
  }
}
