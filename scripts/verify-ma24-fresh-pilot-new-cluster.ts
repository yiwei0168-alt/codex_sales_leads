import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const id = randomBytes(6).toString("hex");
const containerName = `ma24-pilot-fresh-${id}`;
const args = process.argv.slice(2);
const webImageArgument = args.find(arg => arg.startsWith("--web-image="));
const webImage = webImageArgument?.startsWith("--web-image=")
  ? webImageArgument.slice("--web-image=".length) : undefined;
const browserCheck = args.includes("--browser");
const tenUserCheck = args.includes("--ten-user");
const backupCheck = args.includes("--backup");
const crossClusterCheck = args.includes("--cross-cluster");
const modeBusinessCheck = args.includes("--mode-business");
const runnerAttestationCheck = args.includes("--runner-attestation");
const lockedPolicyCheck = args.includes('--locked-policy');
const memorySourceLocksCheck = args.includes('--memory-source-locks');
const safetySkillUsageCheck = args.includes('--safety-skill-usage');
const collectorImageArgument=args.find(arg=>arg.startsWith('--collector-image='));
const collectorImage=collectorImageArgument?.slice('--collector-image='.length);
const transportJournalCheck = args.includes('--transport-journal')||Boolean(collectorImage);
const poolRecoveryCheck = args.includes('--pool-recovery');
const webPoolRecoveryCheck = args.includes('--web-pool-recovery');
const prospectiveHttpArgument = args.find(arg => arg.startsWith('--prospective-http-image='));
const prospectiveHttpImage = prospectiveHttpArgument?.slice('--prospective-http-image='.length);
const prospectiveBrowserCheck = args.includes('--prospective-browser');
const prospectiveCompositionCheck = args.includes('--prospective-composition');
const prospectiveMaterialCheck = args.includes("--prospective-material") || Boolean(prospectiveHttpImage) || prospectiveCompositionCheck;
const prospectiveSourceCheck = args.includes("--prospective-source") || prospectiveMaterialCheck;
const rollbackImageArgument = args.find(arg => arg.startsWith("--rollback-image="));
const rollbackImage = rollbackImageArgument?.slice("--rollback-image=".length);
assert(args.length <= 20 && args.every(arg => ["--browser", "--ten-user", "--backup", "--cross-cluster", "--mode-business", "--runner-attestation", '--locked-policy', '--memory-source-locks', '--safety-skill-usage', '--transport-journal', '--pool-recovery', '--web-pool-recovery', "--prospective-source", "--prospective-material", '--prospective-browser', '--prospective-composition', collectorImageArgument,prospectiveHttpArgument, webImageArgument, rollbackImageArgument].includes(arg))
  &&(!collectorImageArgument||(collectorImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(collectorImage)))
  && (!webPoolRecoveryCheck || webImage)
  && (!prospectiveBrowserCheck || prospectiveHttpImage)
  && (!prospectiveHttpArgument || (prospectiveHttpImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(prospectiveHttpImage)))
  && (!webImageArgument || (webImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(webImage)))
  && (!rollbackImageArgument || (rollbackImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(rollbackImage)))
  && (!(browserCheck || tenUserCheck || backupCheck || crossClusterCheck || rollbackImage) || webImage)
  && (!crossClusterCheck || backupCheck)
  && (!rollbackImage || rollbackImage !== webImage),
  "Expected --mode-business, --runner-attestation, --safety-skill-usage, --transport-journal, --pool-recovery, --prospective-source, --prospective-material, --prospective-composition, --prospective-http-image=<builder-tag> (with optional --prospective-browser), or --web-image=<tag> with optional --web-pool-recovery, --browser, --ten-user, --backup, --cross-cluster (with --backup), and --rollback-image=<prior-tag>");
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
const prospectiveBrowserPort = prospectiveBrowserCheck ? await availablePort() : null;
const prospectiveBrowserDirectory = prospectiveBrowserCheck ? mkdtempSync(join(tmpdir(), 'ma24-skill-browser-')) : null;
const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"], env });
    let head = "", tail = "", size = 0;
    const redact=(value:string)=>value.replaceAll(adminPassword,'<temporary-admin-password>').replaceAll(appPassword,'<temporary-app-password>').replace(/secretKey:\s*-?\d+/g,'secretKey: <redacted>');
    const append=(data:unknown)=>{
      const chunk=redact(String(data));size+=chunk.length;
      head=(head+chunk).slice(0,2000);tail=(tail+chunk).slice(-3000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("exit", code => resolveRun({ code, output:redact(size<=3000?tail:size<=5000?head.slice(0,size-3000)+tail:head+'\n[output truncated]\n'+tail) }));
  });
const adminUrl = new URL(`postgresql://postgres:${adminPassword}@127.0.0.1:${port}/network_copilot_local`);
const appUrl = new URL(`postgresql://network_copilot_local_login:${appPassword}@127.0.0.1:${port}/network_copilot_local`);
let containerId: string | undefined;
let webContainerId: string | undefined;
let restoredContainerId: string | undefined;
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
    ...(prospectiveBrowserPort ? ['--publish', `127.0.0.1:${prospectiveBrowserPort}:3000`] : []),
    "--env", "POSTGRES_DB=network_copilot_local", "pgvector/pgvector:pg16",
    ...(webImage||collectorImage ? ["bash", "-ec", [
      "openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=pilot-db",
      "-addext subjectAltName=DNS:pilot-db,DNS:localhost -keyout /tmp/ma24-server.key",
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
  const roles = await run(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/bootstrap-ma24-pilot-db.ts"],
    { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
  assert.equal(roles.code, 0, roles.output);
  assert(roles.output.includes('"pilotRoleBootstrap":"passed"'), roles.output);
  assert(!roles.output.includes(appPassword), "Bootstrap exposed the disposable application password");
  const duplicateRoles = await run(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/bootstrap-ma24-pilot-db.ts"],
    { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
  assert.notEqual(duplicateRoles.code, 0, "Repeat bootstrap must not replace an existing login password");
  assert(duplicateRoles.output.includes("Pilot roles already exist"), duplicateRoles.output);
  assert(!duplicateRoles.output.includes(appPassword), "Rejected bootstrap exposed the disposable application password");
  const verified = await run(process.execPath,
    ["scripts/run-tsx.cjs", "scripts/verify-ma24-fresh-pilot-db.ts", "--restore"],
    { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
  assert.equal(verified.code, 0, verified.output);
  assert(verified.output.includes('"freshPilotRestore":"passed"'), verified.output);
  assert(verified.output.includes('"copiedProductionData":false'), verified.output);
  if (webImage || modeBusinessCheck || runnerAttestationCheck || lockedPolicyCheck || memorySourceLocksCheck || prospectiveSourceCheck || safetySkillUsageCheck || transportJournalCheck || poolRecoveryCheck) {
    const migration = await run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/migrate.ts", "--fresh-pilot-through=135"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
    assert.equal(migration.code, 0, migration.output);
  }
  if (prospectiveSourceCheck) {
    const inContainerApp = new URL(appUrl), inContainerAdmin = new URL(adminUrl);
    inContainerApp.port = '5432'; inContainerAdmin.port = '5432';
    const sourcePromise = prospectiveHttpImage ? run('docker', ['run', '--rm', '--network', `container:${containerId}`,
      '--workdir', '/build', '--env', `DATABASE_URL=${inContainerApp.toString()}`,
      '--env', `DATABASE_MIGRATION_URL=${inContainerAdmin.toString()}`,
      '--env', 'MA24_DISPOSABLE_PROSPECTIVE_SOURCE=1', '--env', 'MA24_PROSPECTIVE_FULL_MATERIAL=1',
      ...(prospectiveCompositionCheck ? ['--env','MA24_PROSPECTIVE_COMPOSITION=1'] : []),
      ...(prospectiveBrowserDirectory ? ['--mount', `type=bind,source=${prospectiveBrowserDirectory},target=/probe`, '--env', 'MA24_PROSPECTIVE_BROWSER=1'] : []),
      '--env', 'MA24_PROSPECTIVE_HTTP=1', prospectiveHttpImage,
      'node', 'scripts/run-tsx.cjs', 'scripts/verify-skill-prospective-source-db.ts']) : run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/verify-skill-prospective-source-db.ts"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
        MA24_DISPOSABLE_PROSPECTIVE_SOURCE: "1",MA24_PROSPECTIVE_FULL_MATERIAL: prospectiveMaterialCheck ? "1" : "0",MA24_PROSPECTIVE_COMPOSITION:prospectiveCompositionCheck?'1':'0',
        MA24_COMPOSITION_REVIEW_LOCK:prospectiveCompositionCheck?'1':'0',MA24_COMPOSITION_LOCKED_MATERIALS:prospectiveCompositionCheck?'1':'0' });
    if(prospectiveBrowserDirectory){
      let terminal=false;void sourcePromise.finally(()=>{terminal=true;}).catch(()=>undefined);
      try{
        const generated=await run('docker',['exec',containerId,'openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=localhost','-keyout','/tmp/ma24-browser.key','-out','/tmp/ma24-browser.crt']);
        assert.equal(generated.code,0,'Disposable browser TLS generation failed');
        for(const [remote,local] of [['key','key.pem'],['crt','cert.pem']]){
          const file=await run('docker',['exec',containerId,'cat',`/tmp/ma24-browser.${remote}`]);assert.equal(file.code,0);
          writeFileSync(join(prospectiveBrowserDirectory,local),file.output,{mode:0o600});
        }
        const ready=join(prospectiveBrowserDirectory,'ready.json');
        for(let attempt=0;attempt<1800&&!terminal&&!existsSync(ready);attempt++)await new Promise(done=>setTimeout(done,200));
        assert(existsSync(ready),'Disposable standalone browser handshake missing');
        const browser=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-prospective-browser.ts'],{
          ...process.env,MA24_DISPOSABLE_PROSPECTIVE_BROWSER:'1',MA24_PROSPECTIVE_BROWSER_UPSTREAM:`http://127.0.0.1:${prospectiveBrowserPort}`,
          MA24_PROSPECTIVE_BROWSER_READY:ready,MA24_HTTPS_PROBE_KEY:join(prospectiveBrowserDirectory,'key.pem'),MA24_HTTPS_PROBE_CERT:join(prospectiveBrowserDirectory,'cert.pem')});
        const passed=browser.code===0&&browser.output.includes('"prospectiveBrowserUi":"passed"');
        writeFileSync(join(prospectiveBrowserDirectory,'result.json'),JSON.stringify({passed}));
        assert(passed,browser.output);
      }catch(error){
        writeFileSync(join(prospectiveBrowserDirectory,'result.json'),JSON.stringify({passed:false}));
        await sourcePromise;throw error;
      }
    }
    const source=await sourcePromise;
    assert.equal(source.code, 0, source.output);
    assert(source.output.includes('"prospectiveSourceDatabase":"passed"'), source.output);
    if(prospectiveMaterialCheck)assert(source.output.includes('"fullPairedMaterialVerified":true'),source.output);
    if(prospectiveHttpImage)assert(source.output.includes('"prospectiveStandaloneHttp":"passed"'),source.output);
    if(prospectiveBrowserCheck)assert(source.output.includes('"prospectiveStandaloneBrowser":"passed"'),source.output);
    if(prospectiveCompositionCheck)assert(source.output.includes('"completeCompositionDatabase":"passed"')&&source.output.includes('"completeCompositionVerified":true'),source.output);
    if(prospectiveCompositionCheck&&!prospectiveHttpImage)assert(source.output.includes('"developmentReviewLockCheck":true'),source.output);
    if(prospectiveCompositionCheck&&!prospectiveHttpImage)assert(source.output.includes('"lockedMaterialsCheck":true'),source.output);
  }
  if(memorySourceLocksCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-memory-source-locks-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_MEMORY_SOURCE_LOCKS:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"memorySourceLocksDatabase":"passed"'),checked.output);console.log(checked.output.trim());
  }
  if(lockedPolicyCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-locked-policy-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_LOCKED_POLICY:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"lockedPolicyDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if (runnerAttestationCheck) {
    const attested = await run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/verify-skill-runner-attestation-db.ts"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
        MA24_DISPOSABLE_RUNNER_ATTESTATION: "1" });
    assert.equal(attested.code, 0, attested.output);
    assert(attested.output.includes('"runnerAttestationStore":"passed"'), attested.output);
    assert(attested.output.includes('"lockedEvidenceLatestReviewSerialized":true'),attested.output);
  }
  if(poolRecoveryCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-ma24-pool-recovery.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_POOL_RECOVERY:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"poolRecoveryDatabase":"passed"'),checked.output);
  }
  if(transportJournalCheck){
    const built=await run(process.execPath,['scripts/build-skill-collector.mjs']);
    assert.equal(built.code,0,built.output);assert(built.output.includes('"collectorBuild":"passed"'),built.output);
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-transport-journal-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_TRANSPORT_JOURNAL:'1',
       ...(collectorImage?{MA24_COLLECTOR_TEST_IMAGE:collectorImage,MA24_COLLECTOR_TEST_CONTAINER:containerId}:{} )});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"transportJournalDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(safetySkillUsageCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-safety-usage-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_SAFETY_USAGE:'1'});
    assert.equal(checked.code,0,checked.output);
    assert(checked.output.includes('"safetySkillUsageDatabase":"passed"'),checked.output);
  }
  if (modeBusinessCheck) {
    const tempDirectory = mkdtempSync(join(tmpdir(), "ma24-mode-business-"));
    try {
      const business = await run(process.execPath,
        ["scripts/run-tsx.cjs", "scripts/verify-mode-business-local.ts"],
        { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
          MA24_MODE_BUSINESS_REPORT: join(tempDirectory, "report.json") });
      assert.equal(business.code, 0, business.output);
      assert(business.output.includes('"passed":12'), business.output);
      assert(business.output.includes('"fixtureCleaned":true'), business.output);
      assert(business.output.includes('"externalCalls":0'), business.output);
    } finally { rmSync(tempDirectory, { recursive: true, force: true }); }
  }
  if (webImage) {
    const credentials = Array.from({ length: tenUserCheck ? 10 : 2 }, (_, index) => ({
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
    const webApplicationName=`ma24-web-recovery-${id}`;
    if(webPoolRecoveryCheck)webDatabaseUrl.searchParams.set('application_name',webApplicationName);
    const certificate = await run("docker", ["exec", containerId, "cat", "/tmp/ma24-server.crt"]);
    assert.equal(certificate.code, 0, certificate.output);
    assert(certificate.output.includes("-----BEGIN CERTIFICATE-----"));
    const base = `http://127.0.0.1:${webPort}`;
    const startWeb = async (image: string) => {
      const started = await run("docker", ["run", "--detach", "--name", `ma24-pilot-web-${id}`,
        "--network", networkName, "--publish", `127.0.0.1:${webPort}:3000`,
        "--env", `DATABASE_URL=${webDatabaseUrl.toString()}`,
        "--env", `DATABASE_SSL_CA=${certificate.output.trim()}`, image]);
      assert.equal(started.code, 0, started.output);
      webContainerId = started.output.trim();
      assert(/^[a-f0-9]{64}$/.test(webContainerId), "Unexpected disposable Web container ID");
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try { ready = (await fetch(`${base}/api/auth/session`)).ok; } catch { /* Still starting. */ }
        if (ready) break;
        await new Promise(wait => setTimeout(wait, 500));
      }
      assert(ready, "Disposable Linux Web did not become ready");
    };
    const switchWeb = async (image: string) => {
      assert(webContainerId, "No disposable Web container to switch");
      const removed = await run("docker", ["rm", "--force", "--volumes", webContainerId]);
      assert.equal(removed.code, 0, removed.output);
      webContainerId = undefined;
      await startWeb(image);
    };
    await startWeb(webImage);
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
    if(webPoolRecoveryCheck){
      const inspect=async()=>{
        const state=await run('docker',['inspect','--format','{{.State.Pid}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Running}}',webContainerId!]);
        assert.equal(state.code,0);assert(state.output.trim().endsWith(' true'));return state.output.trim();
      };
      const before=await inspect(),admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
      try{
        const params=[webApplicationName,decodeURIComponent(webDatabaseUrl.username)];
        const existing=await admin.query<{pid:number;state:string;ssl:boolean}>(`select a.pid,a.state,s.ssl from pg_stat_activity a
          join pg_stat_ssl s on s.pid=a.pid where a.datname=current_database() and a.application_name=$1 and a.usename=$2`,params);
        assert(existing.rows.length>0);assert(existing.rows.every(row=>row.state==='idle'&&row.ssl));
        const pids=existing.rows.map(row=>row.pid);
        const killed=await admin.query<{terminated:boolean}>(`select pg_terminate_backend(pid) terminated from pg_stat_activity
          where datname=current_database() and application_name=$1 and usename=$2 and state='idle' and pid=any($3::int[])`,[...params,pids]);
        assert.equal(killed.rows.length,pids.length);assert(killed.rows.every(row=>row.terminated));
        let observed=false;
        for(let attempt=0;attempt<30;attempt++){
          const logs=await run('docker',['logs','--tail','40',webContainerId!]);
          observed=(logs.output.match(/\[database\] Idle PostgreSQL connection closed/g)?.length??0)>=pids.length;
          if(observed)break;await new Promise(done=>setTimeout(done,100));
        }
        assert(observed,'Standalone did not handle all terminated idle connections');
        assert.equal(await inspect(),before,'Web process restarted during database disconnect');
        const retained=await fetch(`${base}/api/auth/session`,{headers:{cookie:firstCookie}});
        assert.equal(retained.status,200);assert.equal((await retained.json() as {authenticated:boolean}).authenticated,true);
        assert((await getCompanies(firstCookie)).some(row=>row.id===company.externalId));
        assert(!(await getCompanies(secondCookie)).some(row=>row.id===company.externalId));
        const written=await fetch(`${base}/api/workspaces/current/companies`,{method:'POST',headers:{cookie:firstCookie,'content-type':'application/json'},
          body:JSON.stringify({name:'Synthetic company after DB reconnect',country:'DE',website:`https://pilot-reconnected-${id}.invalid`})});
        assert.equal(written.status,200);
        const afterWrite=await written.json() as {duplicate:boolean;externalId:string};assert.equal(afterWrite.duplicate,false);
        assert.equal((await getCompanies(firstCookie)).filter(row=>row.id===afterWrite.externalId).length,1);
        assert(!(await getCompanies(secondCookie)).some(row=>row.id===afterWrite.externalId));
        const forbidden=await fetch(`${base}/api/workspaces/current/companies/${encodeURIComponent(afterWrite.externalId)}`,{method:'PATCH',
          headers:{cookie:secondCookie,'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,priority:'High'})});
        assert.equal(forbidden.status,404);
        const current=await admin.query<{pid:number;ssl:boolean}>(`select a.pid,s.ssl from pg_stat_activity a join pg_stat_ssl s on s.pid=a.pid
          where a.datname=current_database() and a.application_name=$1 and a.usename=$2`,params);
        assert(current.rows.length>0&&current.rows.every(row=>!pids.includes(row.pid)&&row.ssl));
        assert.equal(await inspect(),before);
        console.log(JSON.stringify({standaloneDatabaseRecovery:'passed',terminatedOwnIdleBackends:pids.length,
          sameProcessAndStartTime:true,originalSessionRetained:true,tlsReconnected:true,subsequentWriteReadAndIsolation:true}));
      }finally{await admin.end();}
    }
    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: firstCookie } });
    assert.equal(logout.status, 200);
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: firstCookie } });
    assert.equal((await session.json() as { authenticated: boolean }).authenticated, false);
    if (tenUserCheck) {
      const cookies = await Promise.all(credentials.map((_, index) => login(index)));
      const companies = await Promise.all(cookies.map(async (cookie, index) => {
        const response = await fetch(`${base}/api/workspaces/current/companies`, { method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ name: `Synthetic concurrent company ${index}`,
            country: "DE", website: `https://pilot-concurrent-${id}-${index}.invalid` }) });
        if (response.status !== 200) throw new Error(`Concurrent company ${index}: ${response.status} ${await response.text()}`);
        const result = await response.json() as { duplicate: boolean; externalId: string };
        assert.equal(result.duplicate, false);
        return result.externalId;
      }));
      assert.equal(new Set(companies).size, 10);
      await Promise.all(cookies.map(async (cookie, index) => {
        const visible = await getCompanies(cookie);
        assert(visible.some(item => item.id === companies[index]));
        assert(!visible.some(item => item.id === companies[(index + 1) % companies.length]));
      }));
    }
    if (browserCheck) {
      const key = await run("docker", ["exec", containerId, "cat", "/tmp/ma24-server.key"]);
      assert.equal(key.code, 0, key.output);
      assert(key.output.includes("-----BEGIN PRIVATE KEY-----"));
      const tempDirectory = mkdtempSync(join(tmpdir(), "ma24-pilot-browser-"));
      try {
        const keyPath = join(tempDirectory, "key.pem"), certPath = join(tempDirectory, "cert.pem");
        writeFileSync(keyPath, key.output, { mode: 0o600 });
        writeFileSync(certPath, certificate.output, { mode: 0o600 });
        const browser = await run(process.execPath,
          ["scripts/run-tsx.cjs", "scripts/verify-ma24-https-browser-session.ts"],
          { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
            MA24_HTTPS_PROBE_UPSTREAM: base, MA24_HTTPS_PROBE_KEY: keyPath, MA24_HTTPS_PROBE_CERT: certPath });
        assert.equal(browser.code, 0, browser.output);
        assert(browser.output.includes('"httpsBrowserSession":"passed"'), browser.output);
        assert(browser.output.includes('"manualCompanyWriteReadUi":true'), browser.output);
      } finally { rmSync(tempDirectory, { recursive: true, force: true }); }
    }
    if (backupCheck) {
      const tempDirectory = mkdtempSync(join(tmpdir(), "ma24-pilot-backup-"));
      try {
        const backup = await run(process.execPath,
          ["scripts/run-tsx.cjs", "scripts/backup-verify-ma24-pilot-db.ts"],
          { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
            PILOT_BACKUP_DIR: tempDirectory });
        assert.equal(backup.code, 0, backup.output);
        assert(backup.output.includes('"pilotBackupRestore":"passed"'), backup.output);
        assert(backup.output.includes('"tenantMembersCompared":2'), backup.output);
        assert(backup.output.includes('"tenantVisibilityMatched":true'), backup.output);
        assert(!backup.output.includes(appPassword), "Backup exposed the disposable application password");
        assert(!backup.output.includes(adminPassword), "Backup exposed the disposable migration password");
        if (crossClusterCheck) {
          const receiptLine = backup.output.trim().split(/\r?\n/).find(line => line.includes('"pilotBackupRestore":"passed"'));
          assert(receiptLine, "Pilot backup did not return its archive receipt");
          const receipt = JSON.parse(receiptLine) as { archiveFile: string };
          assert(/^ma24_pilot_[a-zA-Z0-9_.-]+\.dump$/.test(receipt.archiveFile), "Unexpected pilot archive file");
          const restoredPort = await availablePort();
          const restoredAdminPassword = randomBytes(24).toString("hex");
          const restoredAppPassword = randomBytes(24).toString("hex");
          const restoredName = `ma24-pilot-restored-${id}`;
          const restoredStarted = await run("docker", ["run", "--detach", "--name", restoredName,
            "--publish", `127.0.0.1:${restoredPort}:5432`,
            "--env", `POSTGRES_PASSWORD=${restoredAdminPassword}`,
            "--env", "POSTGRES_DB=network_copilot_local", "pgvector/pgvector:pg16"]);
          assert.equal(restoredStarted.code, 0, restoredStarted.output);
          restoredContainerId = restoredStarted.output.trim();
          assert(/^[a-f0-9]{64}$/.test(restoredContainerId), "Unexpected disposable restored container ID");
          const restoredAdminUrl = new URL(adminUrl);
          restoredAdminUrl.port = String(restoredPort);
          restoredAdminUrl.password = restoredAdminPassword;
          const restoredAppUrl = new URL(appUrl);
          restoredAppUrl.port = String(restoredPort);
          restoredAppUrl.password = restoredAppPassword;
          let restoredReady = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const probe = new Client({ connectionString: restoredAdminUrl.toString(), connectionTimeoutMillis: 1000 });
            try { await probe.connect(); restoredReady = true; await probe.end(); break; }
            catch { await probe.end().catch(() => undefined); await new Promise(wait => setTimeout(wait, 500)); }
          }
          assert(restoredReady, "Second disposable PostgreSQL did not become ready");
          const restoredRoles = await run(process.execPath,
            ["scripts/run-tsx.cjs", "scripts/bootstrap-ma24-pilot-db.ts"],
            { ...process.env, DATABASE_URL: restoredAppUrl.toString(),
              DATABASE_MIGRATION_URL: restoredAdminUrl.toString() });
          assert.equal(restoredRoles.code, 0, restoredRoles.output);
          assert(restoredRoles.output.includes('"pilotRoleBootstrap":"passed"'), restoredRoles.output);
          const pgRestore = process.env.PG_RESTORE_PATH || (process.platform === "win32"
            ? "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe" : "pg_restore");
          const restoredArchive = await run(pgRestore,
            ["--exit-on-error", "--no-owner", "--dbname", "network_copilot_local",
              join(tempDirectory, receipt.archiveFile)],
            { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(restoredPort),
              PGUSER: "postgres", PGPASSWORD: restoredAdminPassword });
          assert.equal(restoredArchive.code, 0, restoredArchive.output);
          const restoredAdmin = new Client({ connectionString: restoredAdminUrl.toString() });
          await restoredAdmin.connect();
          let memberIds: string[];
          try {
            const members = await restoredAdmin.query<{ id: string }>(
              "select id from app_user where email = any($1::text[]) order by email",
              [credentials.slice(0, 2).map(value => value.email)]);
            memberIds = members.rows.map(row => row.id);
            assert.equal(memberIds.length, 2);
            const stage = await restoredAdmin.query<{ stage135: boolean; laterStage: boolean }>(
              `select to_regclass('public.agent_skill_acceptance_freeze') is not null "stage135",
                to_regclass('public.ma24_evaluation_hard_limit') is not null "laterStage"`);
            assert.deepEqual(stage.rows[0], { stage135: true, laterStage: false });
            const countSql = `select (select count(*)::int from app_user) users,
              (select count(*)::int from market_workspace) workspaces,
              (select count(*)::int from workspace_company) companies,
              (select count(*)::int from knowledge_document) documents`;
            const sourceAdmin = new Client({ connectionString: adminUrl.toString() });
            await sourceAdmin.connect();
            try {
              assert.deepEqual((await restoredAdmin.query(countSql)).rows[0],
                (await sourceAdmin.query(countSql)).rows[0],
                "Cross-cluster restored account, workspace, company, or document count differs");
            } finally { await sourceAdmin.end(); }
          } finally { await restoredAdmin.end(); }
          const restoredApp = new Client({ connectionString: restoredAppUrl.toString() });
          await restoredApp.connect();
          try {
            for (const [index, memberId] of memberIds.entries()) {
              await restoredApp.query("begin");
              try {
                await restoredApp.query('set local role "network_copilot_app"');
                await restoredApp.query("select set_config('app.current_user_id',$1,true)", [memberId]);
                const visible = await restoredApp.query<{ id: string }>(
                  "select record->>'id' as id from user_company_market");
                assert.equal(visible.rows.some(row => row.id === company.externalId), index === 0,
                  "Cross-cluster restored company visibility differs by member");
              } finally { await restoredApp.query("rollback"); }
            }
          } finally { await restoredApp.end(); }
          assert(!restoredArchive.output.includes(restoredAdminPassword), "Restore exposed the disposable password");
        }
      } finally { rmSync(tempDirectory, { recursive: true, force: true }); }
    }
    if (rollbackImage) {
      const resumedCookie = await login(0);
      await switchWeb(rollbackImage);
      assert((await getCompanies(resumedCookie)).some(item => item.id === company.externalId),
        "Prior image lost current-image company or session after same-port switch");
      assert(!(await getCompanies(secondCookie)).some(item => item.id === company.externalId),
        "Prior image exposed current-image company to another member");
      const oldWrite = await fetch(`${base}/api/workspaces/current/companies`, { method: "POST",
        headers: { cookie: secondCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Synthetic rollback image company", country: "DE",
          website: `https://pilot-rollback-${id}.invalid` }) });
      if (oldWrite.status !== 200) throw new Error(`Prior-image company create ${oldWrite.status}: ${await oldWrite.text()}`);
      const oldCompany = await oldWrite.json() as { duplicate: boolean; externalId: string };
      assert.equal(oldCompany.duplicate, false);
      await switchWeb(webImage);
      assert((await getCompanies(resumedCookie)).some(item => item.id === company.externalId),
        "Current image lost its company after return switch");
      assert((await getCompanies(secondCookie)).some(item => item.id === oldCompany.externalId),
        "Current image cannot read prior-image company after return switch");
      assert(!(await getCompanies(resumedCookie)).some(item => item.id === oldCompany.externalId),
        "Current image exposed prior-image company to another member");
    }
  }
  console.log(JSON.stringify({ freshClusterPilot: "passed", image: "pgvector/pgvector:pg16",
    publishedAddress: "127.0.0.1 only", rolesVerified: true, duplicateRoleBootstrapRejected: true,
    freshMigrationThrough: 135,
    syntheticAccountCompanyAndRestoreVerified: true, copiedProductionData: false,
    linuxWebImage: webImage ?? null, linuxWebHttpWorkflowVerified: Boolean(webImage),
    linuxWebHttpsBrowserVerified: browserCheck, tenConcurrentSyntheticAccountsVerified: tenUserCheck,
    pilotBackupRestoreVerified: backupCheck, crossClusterRestoreVerified: crossClusterCheck,
    scriptedModeBusinessVerified: modeBusinessCheck,
    runnerAttestationStoreVerified: runnerAttestationCheck,
    lockedPolicyDatabaseVerified: lockedPolicyCheck,
    memorySourceLocksVerified: memorySourceLocksCheck,
    safetySkillUsageVerified: safetySkillUsageCheck,
    transportJournalDatabaseVerified: transportJournalCheck,
    collectorImageTlsPreflightVerified: Boolean(collectorImage),
    poolRecoveryVerified: poolRecoveryCheck,
    standaloneDatabaseRecoveryVerified: webPoolRecoveryCheck,
    extraG09Migration: runnerAttestationCheck ? 141 : null,
    prospectiveSourceDatabaseVerified: prospectiveSourceCheck,
    prospectivePairedMaterialVerified: prospectiveMaterialCheck,
    prospectiveStandaloneHttpVerified: Boolean(prospectiveHttpImage),
    prospectiveStandaloneBrowserVerified: prospectiveBrowserCheck,
    completeCompositionVerified: prospectiveCompositionCheck,
    samePortPriorImageRollbackVerified: Boolean(rollbackImage) }));
} finally {
  if(prospectiveBrowserDirectory)rmSync(prospectiveBrowserDirectory,{recursive:true,force:true});
  if (restoredContainerId) {
    const removed = await run("docker", ["rm", "--force", "--volumes", restoredContainerId]);
    assert.equal(removed.code, 0, removed.output);
  }
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
