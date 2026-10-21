import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join,resolve,sep,basename } from "node:path";
import { Client } from "pg";
import {prepareMailboxRestoreFixture} from './lib/ma24-mailbox-restore-fixture';
import {completeDisposableCheck} from './lib/ma24-disposable-cleanup';

const id = randomBytes(6).toString("hex");
const containerName = `ma24-pilot-fresh-${id}`;
const scheduleDispatchCheck=process.argv.includes('--schedule-dispatch');
const reviewDraftUiCheck=process.argv.includes('--review-draft-ui');
const mailboxImapWorkerCheck=process.argv.includes('--mailbox-imap-worker');
const mailboxImageArgument=process.argv.slice(2).find(arg=>arg.startsWith('--mailbox-worker-image='));
const mailboxWorkerImage=mailboxImageArgument?.slice('--mailbox-worker-image='.length);
const mailboxWorkerImapImageCheck=process.argv.includes('--mailbox-worker-imap');
const batchSettlementCheck=process.argv.includes('--batch-settlement');
const batchWorkerArgument=process.argv.slice(2).find(arg=>arg.startsWith('--batch-worker-image='));
const batchWorkerImage=batchWorkerArgument?.slice('--batch-worker-image='.length);
const batchWorkerCommitCheck=process.argv.includes('--batch-worker-commit');
const scheduleWorkerArgument=process.argv.slice(2).find(arg=>arg.startsWith('--schedule-worker-image='));
const scheduleWorkerImage=scheduleWorkerArgument?.slice('--schedule-worker-image='.length);
const scheduleWorkerCommitCheck=process.argv.includes('--schedule-worker-commit');
const args = process.argv.slice(2).filter(arg=>arg!=='--review-draft-ui'&&arg!=='--mailbox-worker-imap'&&arg!==mailboxImageArgument&&arg!=='--mailbox-imap-worker'&&arg!=='--schedule-dispatch'&&arg!=='--batch-settlement'&&arg!=='--schedule-worker-commit'&&arg!=='--batch-worker-commit'&&arg!==scheduleWorkerArgument&&arg!==batchWorkerArgument);
const webImageArgument = args.find(arg => arg.startsWith("--web-image="));
const webImage = webImageArgument?.startsWith("--web-image=")
  ? webImageArgument.slice("--web-image=".length) : undefined;
const browserCheck = args.includes("--browser");
const currentSchemaCheck = args.includes('--current-schema');
const snapshotDownloadCheck=args.includes('--snapshot-download');
const acceptanceOriginalsCheck=args.includes('--acceptance-originals');
const memoryObservationsUi=args.includes('--memory-observations-ui');
const snapshotLifecycleCheck=args.includes('--snapshot-lifecycle');
const knowledgeScopeSourcesCheck=args.includes('--knowledge-scope-sources');
const finalSettlementCheck=args.includes('--final-settlement');
const mainRuntimeArgument=args.find(arg=>arg.startsWith('--main-runtime-image='));
const mainRuntimeImage=mainRuntimeArgument?.slice('--main-runtime-image='.length);
const mainRuntimeOnly=args.includes('--main-runtime-only');
const mainRuntimeApproval=args.includes('--main-runtime-approval-http');
const mainRuntimeSkillReceipt=args.includes('--main-runtime-skill-receipt');
const mainRuntimeModelReceipt=args.includes('--main-runtime-model-receipt');
const mainRuntimeDurability=args.includes('--main-runtime-durability');
const mainRuntimeCrashRecovery=args.includes('--main-runtime-crash-recovery');
const mainRuntimeNetworkLoss=args.includes('--main-runtime-network-loss');
const mainRuntimeResumeRevocation=args.includes('--main-runtime-resume-revocation');
const mainRuntimeInterruption=args.includes('--main-runtime-interruption')||mainRuntimeNetworkLoss||mainRuntimeResumeRevocation;
const mainRuntimeCommitLoss=args.includes('--main-runtime-commit-loss');
const mainRuntimeTaskEnrollment=args.includes('--main-runtime-task-enrollment');
const localMemoryWorkerCheck=args.includes('--local-memory-worker');
const localMemoryGraphCheck=args.includes('--local-memory-graph-worker');
const localMemoryChineseCheck=args.includes('--local-memory-chinese');
const localMemoryHttpCheck=args.includes('--local-memory-http');
const frontendUiCheck = args.includes('--frontend-ui');
const extendedUiCheck = args.includes('--extended-ui');
const tenUserCheck = args.includes("--ten-user");
const backupCheck = args.includes("--backup");
const crossClusterCheck = args.includes("--cross-cluster");
const modeBusinessCheck = args.includes("--mode-business");
const declarationImageArgument=args.find(arg=>arg.startsWith('--declaration-image='));
const declarationImage=declarationImageArgument?.slice('--declaration-image='.length);
const runnerAttestationCheck = args.includes("--runner-attestation")||Boolean(declarationImage);
const lockedPolicyCheck = args.includes('--locked-policy');
const memorySourceLocksCheck = args.includes('--memory-source-locks');
const methodCatalogLocksCheck = args.includes('--method-catalog-locks');
const shadowSourceLocksCheck = args.includes('--shadow-source-locks');
const safetySkillUsageCheck = args.includes('--safety-skill-usage');
const collectorImageArgument=args.find(arg=>arg.startsWith('--collector-image='));
const collectorImage=collectorImageArgument?.slice('--collector-image='.length);
const transportLinuxArgument=args.find(arg=>arg.startsWith('--transport-linux-image='));
const transportLinuxImage=transportLinuxArgument?.slice('--transport-linux-image='.length);
assert(!transportLinuxArgument||args.every(arg=>arg==='--current-schema'||arg===transportLinuxArgument),'Linux five-category check requires its own fresh database; use only --current-schema and --transport-linux-image=<immutable-id>');
const transportJournalCheck = args.includes('--transport-journal')||Boolean(collectorImage)||Boolean(transportLinuxImage);
const agentCallLeaseCheck=args.includes('--agent-call-lease');
const agentCheckpointLeaseCheck=args.includes('--agent-checkpoint-lease');
const candidateLeaseContentionCheck=args.includes('--candidate-lease-contention');
const runtimeReadSourcesCheck=args.includes('--runtime-read-sources');
const runtimeDisclosureCheck=args.includes('--runtime-disclosure');
assert(!runtimeDisclosureCheck||currentSchemaCheck,'--runtime-disclosure requires --current-schema');
const poolRecoveryCheck = args.includes('--pool-recovery');
const webPoolRecoveryCheck = args.includes('--web-pool-recovery');
const prospectiveHttpArgument = args.find(arg => arg.startsWith('--prospective-http-image='));
const prospectiveHttpImage = prospectiveHttpArgument?.slice('--prospective-http-image='.length);
const prospectiveBrowserCheck = args.includes('--prospective-browser');
const prospectiveCompositionCheck = args.includes('--prospective-composition');
const prospectiveMaterialCheck = args.includes("--prospective-material") || Boolean(prospectiveHttpImage) || prospectiveCompositionCheck;
const prospectiveSourceCheck = args.includes("--prospective-source") || prospectiveMaterialCheck;
const pristineDatabaseChecks = [
  runnerAttestationCheck,
  lockedPolicyCheck,
  memorySourceLocksCheck,
  methodCatalogLocksCheck,
  shadowSourceLocksCheck,
  safetySkillUsageCheck,
  transportJournalCheck,
  agentCallLeaseCheck,
  agentCheckpointLeaseCheck,
  candidateLeaseContentionCheck,
  runtimeReadSourcesCheck,
  runtimeDisclosureCheck,
  prospectiveSourceCheck,
].filter(Boolean).length;
assert(pristineDatabaseChecks <= 1,
  "Each G09 disposable database fixture requires a pristine placeholder-only database; run one fixture flag per fresh-cluster invocation.");
assert(!currentSchemaCheck||(((webImage||mainRuntimeOnly)&&pristineDatabaseChecks===0||(lockedPolicyCheck||transportJournalCheck||runnerAttestationCheck||agentCallLeaseCheck||agentCheckpointLeaseCheck||candidateLeaseContentionCheck||runtimeReadSourcesCheck||runtimeDisclosureCheck)&&pristineDatabaseChecks===1&&!webImage)&&!modeBusinessCheck&&!poolRecoveryCheck),
  '--current-schema requires isolated Web acceptance, locked-policy, transport-journal or runner-attestation; other G09 fixtures retain their historical schema bootstrap');
assert(!frontendUiCheck||(webImage&&currentSchemaCheck&&browserCheck),'--frontend-ui requires --web-image, --current-schema and --browser');
assert(!extendedUiCheck||frontendUiCheck,'--extended-ui requires --frontend-ui');
assert(!snapshotDownloadCheck||(webImage&&currentSchemaCheck),'--snapshot-download requires --web-image and --current-schema');
assert(!acceptanceOriginalsCheck||(webImage&&currentSchemaCheck),'--acceptance-originals requires --web-image and --current-schema');
assert(!memoryObservationsUi||(webImage&&currentSchemaCheck&&args.every(arg=>[webImageArgument,'--current-schema','--memory-observations-ui'].includes(arg))),'Memory UI requires its own fresh fixed Web/current-schema invocation');
assert(!snapshotLifecycleCheck||(webImage&&currentSchemaCheck),'--snapshot-lifecycle requires --web-image and --current-schema');
assert(!knowledgeScopeSourcesCheck||(webImage&&currentSchemaCheck),'--knowledge-scope-sources requires --web-image and --current-schema');
assert(!finalSettlementCheck||(webImage&&currentSchemaCheck),'--final-settlement requires --web-image and --current-schema');
assert(!scheduleDispatchCheck||(webImage&&currentSchemaCheck),'--schedule-dispatch requires --web-image and --current-schema');
assert(!mailboxImapWorkerCheck||(webImage&&currentSchemaCheck),'--mailbox-imap-worker requires --web-image and --current-schema');
assert(!reviewDraftUiCheck||(webImage&&currentSchemaCheck),'--review-draft-ui requires --web-image and --current-schema');
assert(!mailboxImageArgument||(mailboxWorkerImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(mailboxWorkerImage)&&webImage&&currentSchemaCheck),'--mailbox-worker-image requires fixed image, Web and current schema');
assert(!mailboxWorkerImapImageCheck||mailboxWorkerImage,'--mailbox-worker-imap requires --mailbox-worker-image');
assert(!batchSettlementCheck||(webImage&&currentSchemaCheck),'--batch-settlement requires --web-image and --current-schema');
assert(!batchWorkerArgument||(batchWorkerImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(batchWorkerImage)&&webImage&&currentSchemaCheck),'--batch-worker-image requires fixed image, Web and current schema');
assert(!scheduleWorkerArgument||(scheduleWorkerImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(scheduleWorkerImage)&&webImage&&currentSchemaCheck),'--schedule-worker-image requires a fixed image, Web and current schema');
assert(!scheduleWorkerCommitCheck||scheduleWorkerImage,'--schedule-worker-commit requires --schedule-worker-image');
assert(!batchWorkerCommitCheck||batchWorkerImage,'--batch-worker-commit requires --batch-worker-image');
assert(!mainRuntimeArgument||(mainRuntimeImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(mainRuntimeImage)&&(webImage||mainRuntimeOnly)&&currentSchemaCheck
  &&![snapshotLifecycleCheck,knowledgeScopeSourcesCheck,finalSettlementCheck,acceptanceOriginalsCheck,localMemoryWorkerCheck].some(Boolean)),
 '--main-runtime-image requires current schema with Web or standalone runtime acceptance');
assert(!mainRuntimeOnly||(mainRuntimeImage&&!webImage&&!mainRuntimeInterruption&&args.every(arg=>[mainRuntimeArgument,'--main-runtime-only','--main-runtime-skill-receipt','--main-runtime-model-receipt','--current-schema'].includes(arg))),'Standalone runtime check requires only current schema and runtime flags');
assert(!mainRuntimeApproval||(webImage&&mainRuntimeImage&&currentSchemaCheck&&args.every(arg=>[webImageArgument,mainRuntimeArgument,'--current-schema','--main-runtime-approval-http'].includes(arg))),'Approval flow requires only fixed Web/runtime images and current schema');
assert(!mainRuntimeSkillReceipt||mainRuntimeOnly,'Skill receipt recovery requires standalone runtime check');
assert(!mainRuntimeModelReceipt||mainRuntimeOnly,'Model receipt recovery requires standalone runtime check');
assert(!mainRuntimeDurability||mainRuntimeImage,'--main-runtime-durability requires --main-runtime-image');
assert(!mainRuntimeCrashRecovery||mainRuntimeDurability,'--main-runtime-crash-recovery requires --main-runtime-durability');
assert(!mainRuntimeInterruption||mainRuntimeDurability,'--main-runtime-interruption requires --main-runtime-durability');
assert(!(mainRuntimeResumeRevocation&&mainRuntimeNetworkLoss),'Choose isolated resume revocation or network loss');
assert(!mainRuntimeCommitLoss||mainRuntimeImage,'--main-runtime-commit-loss requires --main-runtime-image');
assert(!mainRuntimeTaskEnrollment||mainRuntimeImage,'--main-runtime-task-enrollment requires --main-runtime-image');
assert(!localMemoryWorkerCheck||(webImage&&currentSchemaCheck),'--local-memory-worker requires --web-image and --current-schema');
assert(!localMemoryGraphCheck||localMemoryWorkerCheck,'--local-memory-graph-worker requires --local-memory-worker');
assert(!localMemoryChineseCheck||localMemoryWorkerCheck,'--local-memory-chinese requires --local-memory-worker');
assert(!localMemoryHttpCheck||(localMemoryGraphCheck&&localMemoryChineseCheck),'--local-memory-http requires Chinese memory and graph Worker checks');
const rollbackImageArgument = args.find(arg => arg.startsWith("--rollback-image="));
const rollbackImage = rollbackImageArgument?.slice("--rollback-image=".length);
assert(args.length <= 22 && args.every(arg => ['--memory-observations-ui','--main-runtime-approval-http','--main-runtime-resume-revocation', '--main-runtime-network-loss', '--main-runtime-interruption', '--main-runtime-crash-recovery', '--main-runtime-task-enrollment', '--main-runtime-commit-loss', '--main-runtime-durability', mainRuntimeArgument, '--main-runtime-only', '--main-runtime-skill-receipt', '--main-runtime-model-receipt', "--final-settlement", "--knowledge-scope-sources", "--snapshot-lifecycle", "--acceptance-originals", "--local-memory-http", "--local-memory-chinese", "--local-memory-graph-worker", "--local-memory-worker", "--snapshot-download", "--extended-ui", "--frontend-ui", "--current-schema", "--browser", "--ten-user", "--backup", "--cross-cluster", "--mode-business", "--runner-attestation", '--locked-policy', '--memory-source-locks', '--method-catalog-locks', '--shadow-source-locks', '--safety-skill-usage', '--agent-call-lease', '--agent-checkpoint-lease', '--candidate-lease-contention', '--runtime-read-sources', '--runtime-disclosure', '--transport-journal', '--pool-recovery', '--web-pool-recovery', "--prospective-source", "--prospective-material", '--prospective-browser', '--prospective-composition', declarationImageArgument,collectorImageArgument,transportLinuxArgument,prospectiveHttpArgument, webImageArgument, rollbackImageArgument].includes(arg))
  &&(!declarationImageArgument||(declarationImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(declarationImage)))
  &&(!transportLinuxArgument||(currentSchemaCheck&&transportLinuxImage&&/^sha256:[a-f0-9]{64}$/.test(transportLinuxImage)))
  &&(!collectorImageArgument||(collectorImage&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(collectorImage)))
  && (!webPoolRecoveryCheck || webImage)
  && (!prospectiveBrowserCheck || prospectiveHttpImage)
  && (!prospectiveHttpArgument || (prospectiveHttpImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(prospectiveHttpImage)))
  && (!webImageArgument || (webImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(webImage)))
  && (!rollbackImageArgument || (rollbackImage && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(rollbackImage)))
  && (!(browserCheck || tenUserCheck || backupCheck || crossClusterCheck || rollbackImage) || webImage)
  && (!crossClusterCheck || backupCheck)
  && (!rollbackImage || rollbackImage !== webImage),
  "Expected --mode-business, --runner-attestation, --declaration-image=<tag>, --safety-skill-usage, --transport-journal, --pool-recovery, --prospective-source, --prospective-material, --prospective-composition, --prospective-http-image=<builder-tag> (with optional --prospective-browser), or --web-image=<tag> with optional --current-schema, --web-pool-recovery, --browser, --ten-user, --backup, --cross-cluster (with --backup), and --rollback-image=<prior-tag>");
const networkName = `ma24-pilot-net-${id}`;
const adminPassword = randomBytes(24).toString("hex");
const appPassword = randomBytes(24).toString("hex");
const mailboxFixtureKey = frontendUiCheck?randomBytes(32).toString('base64url'):undefined;
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
const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env,retainedOutput=5000) =>
  new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"], env });
    const headLimit=Math.floor(retainedOutput*0.4),tailLimit=retainedOutput-headLimit;
    let head = "", tail = "", size = 0;
    const redact=(value:string)=>value.replaceAll(adminPassword,'<temporary-admin-password>').replaceAll(appPassword,'<temporary-app-password>').replace(/secretKey:\s*-?\d+/g,'secretKey: <redacted>');
    const append=(data:unknown)=>{
      const chunk=redact(String(data));size+=chunk.length;
      head=(head+chunk).slice(0,headLimit);tail=(tail+chunk).slice(-tailLimit);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("exit", code => resolveRun({ code, output:redact(size<=tailLimit?tail:size<=retainedOutput?head.slice(0,size-tailLimit)+tail:head+'\n[output truncated]\n'+tail) }));
  });
const adminUrl = new URL(`postgresql://postgres:${adminPassword}@127.0.0.1:${port}/network_copilot_local`);
const appUrl = new URL(`postgresql://network_copilot_local_login:${appPassword}@127.0.0.1:${port}/network_copilot_local`);
let containerId: string | undefined;
let webContainerId: string | undefined;
let restoredContainerId: string | undefined;
let networkId: string | undefined;
let currentSchemaMarkers:Record<string,boolean>|null=null;
let snapshotDownloadResult:unknown=null;
let localMemoryWorkerResult:unknown=null;
let trustRegistryRestoreResult:unknown=null;
let primaryFailure:{error:unknown}|undefined;
let acceptanceResult:Record<string,unknown>|undefined;
try {
  if (webImage||mainRuntimeOnly) {
    const created = await run("docker", ["network", "create", ...(mainRuntimeOnly?["--internal"]:[]), networkName]);
    assert.equal(created.code, 0, created.output);
    networkId = created.output.trim();
    assert(/^[a-f0-9]{64}$/.test(networkId), "Unexpected disposable network ID");
  }
  const started = await run("docker", ["run", "--detach", "--name", containerName,
    ...(webImage ? ["--network", networkName, "--network-alias", "pilot-db"] : []),
    "--publish", `127.0.0.1:${port}:5432`, "--env", `POSTGRES_PASSWORD=${adminPassword}`,
    ...(prospectiveBrowserPort ? ['--publish', `127.0.0.1:${prospectiveBrowserPort}:3000`] : []),
    "--env", "POSTGRES_DB=network_copilot_local", "pgvector/pgvector:pg16",
    ...(webImage||collectorImage||declarationImage||mainRuntimeOnly||transportLinuxImage ? ["bash", "-ec", [
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
  if(mainRuntimeOnly){
    const attached=await run('docker',['network','connect','--alias','pilot-db',networkName,containerId]);
    assert.equal(attached.code,0,attached.output);
  }
  let connected = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 1000 });
    try { await probe.connect(); connected = true; await probe.end(); break; }
    catch { await probe.end().catch(() => undefined); await new Promise(wait => setTimeout(wait, 500)); }
  }
  if(!connected){
    const state=await run('docker',['inspect','--format','{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}',containerId]);
    const readiness=await run('docker',['exec',containerId,'pg_isready','-U','postgres','-d','network_copilot_local']);
    throw new Error(`Disposable PostgreSQL did not become ready; container=${state.output.trim()}; internal=${readiness.output.trim()}`);
  }
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
  if (webImage || mainRuntimeOnly || modeBusinessCheck || runnerAttestationCheck || lockedPolicyCheck || memorySourceLocksCheck || methodCatalogLocksCheck || shadowSourceLocksCheck || prospectiveSourceCheck || safetySkillUsageCheck || transportJournalCheck || agentCallLeaseCheck || agentCheckpointLeaseCheck || candidateLeaseContentionCheck || runtimeReadSourcesCheck || runtimeDisclosureCheck || poolRecoveryCheck) {
    const migration = await run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/migrate.ts", currentSchemaCheck?"--fresh-pilot-through=170":"--fresh-pilot-through=135"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString() });
    assert.equal(migration.code, 0, migration.output);
    if(currentSchemaCheck){
      const inspect=new Client({connectionString:adminUrl.toString()});await inspect.connect();
      try{
        currentSchemaMarkers=(await inspect.query<Record<string,boolean>>(`select
          exists(select 1 from information_schema.columns where table_schema='public' and table_name='mailbox_sync_run' and column_name='work_job_id') as mailbox_work_binding,
          exists(select 1 from information_schema.columns where table_schema='public' and table_name='mailbox_sync_run' and column_name='work_lease_token') as mailbox_lease_binding,
          exists(select 1 from pg_constraint where conrelid='public.mailbox_sync_run'::regclass and conname='mailbox_sync_run_worker_binding_check') as mailbox_binding_constraint,
          to_regprocedure('public.lock_skill_knowledge_sources()') is not null as knowledge_source_gate,
          to_regprocedure('public.lock_skill_task_origins(uuid[])') is not null as task_origin_gate,
          to_regprocedure('public.lock_local_memory_extraction_source(uuid,uuid,text)') is not null as local_memory_source_gate,
          to_regprocedure('public.lock_local_memory_receipt_source(uuid)') is not null as receipt_source_gate,
          to_regprocedure('public.capture_immutable_asset_snapshot(uuid,text,bytea)') is not null as immutable_snapshot_capture,
          to_regprocedure('public.prune_orphan_asset_snapshots(uuid,jsonb,text)') is not null as immutable_snapshot_lifecycle,
          to_regclass('public.skill_runner_trust_registry_version') is not null as trust_registry_versions,
          to_regclass('public.skill_runner_trust_registry_current') is not null as trust_registry_pointer,
          to_regprocedure('public.publish_skill_runner_trust_registry(jsonb,text)') is not null as trust_registry_publication,
          to_regclass('public.skill_runtime_package_registration') is not null as runtime_package_registrations,
          to_regclass('public.agent_skill_candidate_checkpoint') is not null as candidate_recovery_checkpoint,
          to_regclass('public.agent_skill_candidate_execution_lease') is not null as candidate_execution_lease,
          to_regclass('skill_candidate_graph.checkpoints') is not null as candidate_graph_checkpoint,
          to_regclass('public.skill_runtime_package_withdrawal') is not null as runtime_package_withdrawals,
          to_regprocedure('public.register_skill_runtime_package(jsonb,text,uuid,bigint)') is not null as runtime_package_publication,
          to_regprocedure('public.skill_activation_is_current(uuid,uuid,integer)') is not null as skill_activation_lifecycle,
          public.skill_activation_source_fence_ready() as skill_activation_sources_sealed,
          public.skill_activation_review_guard_ready() as skill_activation_reviews_serialized,
          public.skill_activation_declaration_guard_ready() as skill_activation_declarations_serialized,
          public.skill_activation_source_guard_health() as skill_activation_source_guard_health,
          public.skill_activation_use_guard_ready() as skill_activation_use_commit_guard,
          exists(select 1 from pg_trigger where tgrelid='public.agent_run_event'::regclass and tgname='skill_activation_commit_guard'
           and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal) as skill_activation_commit_guard,
          exists(select 1 from pg_trigger where tgrelid='public.agent_run_event'::regclass and tgname='skill_activation_binding_commit_guard'
           and tgdeferrable and tginitdeferred and tgenabled in('O','A') and not tgisinternal) as skill_activation_binding_guard
        `)).rows[0];
        assert(Object.values(currentSchemaMarkers).every(Boolean),'Current Web schema incomplete');
      }finally{await inspect.end();}
    }
  }
  if(snapshotLifecycleCheck){
    const lifecycle=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-immutable-snapshot-lifecycle-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_SNAPSHOT_LIFECYCLE:'1'});
    assert.equal(lifecycle.code,0,lifecycle.output);assert(lifecycle.output.includes('"snapshotLifecycle":"passed"'),lifecycle.output);console.log(lifecycle.output.trim());
  }
  if(knowledgeScopeSourcesCheck){
    const scope=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-knowledge-scope-sources-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_KNOWLEDGE_SCOPE:'1'});
    assert.equal(scope.code,0,scope.output);assert(scope.output.includes('"knowledgeScopeSources":"passed"'),scope.output);console.log(scope.output.trim());
  }
  if(finalSettlementCheck){
    const settlement=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-final-main-settlement-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_FINAL_SETTLEMENT:'1'});
    assert.equal(settlement.code,0,settlement.output);assert(settlement.output.includes('"finalMainSettlement":"passed"'),settlement.output);console.log(settlement.output.trim());
  }
  if(reviewDraftUiCheck){
    const review=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-review-draft-image-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_REVIEW_IMAGE:'1',
        MA24_REVIEW_IMAGE:webImage!,MA24_REVIEW_NETWORK:networkName,MA24_REVIEW_DATABASE_CONTAINER:containerId!});
    assert.equal(review.code,0,review.output);assert(review.output.includes('"fixedReviewDraftDatabase":"passed"')&&review.output.includes('"fixedReviewDraftDatabaseCleaned":true'),review.output);console.log(review.output.trim());
  }
  if(mailboxWorkerImage){
    const runtimeApp=new URL(appUrl);runtimeApp.hostname='pilot-db';runtimeApp.port='5432';runtimeApp.searchParams.set('sslmode','verify-full');
    const certificate=await run('docker',['exec',containerId!,'cat','/tmp/ma24-server.crt']);assert.equal(certificate.code,0);
    const mailboxImage=await run(process.execPath,['scripts/run-tsx.cjs',mailboxWorkerImapImageCheck?'scripts/verify-mailbox-imap-image-db.ts':'scripts/verify-mailbox-worker-image.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_MAILBOX_DATABASE_CONTAINER:containerId!,MA24_DISPOSABLE_MAILBOX_IMAGE:'1',MA24_MAILBOX_IMAGE:mailboxWorkerImage,MA24_MAILBOX_NETWORK:networkName,
        MA24_MAILBOX_RUNTIME_DATABASE_URL:runtimeApp.toString(),MA24_MAILBOX_CA:certificate.output.trim()});
    assert.equal(mailboxImage.code,0,mailboxImage.output);assert(mailboxImage.output.includes(mailboxWorkerImapImageCheck?'"mailboxWorkerImapImage":"passed"':'"mailboxWorkerImage":"passed"'),mailboxImage.output);console.log(mailboxImage.output.trim());
  }
  if(mailboxImapWorkerCheck){
    const mailboxWorker=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-mailbox-imap-worker-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_MAILBOX_IMAP:'1'});
    assert.equal(mailboxWorker.code,0,mailboxWorker.output);assert(mailboxWorker.output.includes('"mailboxImapWorker":"passed"'),mailboxWorker.output);console.log(mailboxWorker.output.trim());
  }
  if(batchWorkerImage){
    const runtimeApp=new URL(appUrl);runtimeApp.hostname='pilot-db';runtimeApp.port='5432';runtimeApp.searchParams.set('sslmode','verify-full');
    const certificate=await run('docker',['exec',containerId!,'cat','/tmp/ma24-server.crt']);assert.equal(certificate.code,0);
    const batchWorker=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-batch-worker-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_BATCH_WORKER:'1',MA24_BATCH_WORKER_IMAGE:batchWorkerImage,
        MA24_BATCH_WORKER_COMMIT:batchWorkerCommitCheck?'1':'0',MA24_BATCH_NETWORK:networkName,MA24_BATCH_DATABASE_CONTAINER:containerId!,MA24_BATCH_RUNTIME_DATABASE_URL:runtimeApp.toString(),MA24_BATCH_CA:certificate.output.trim()});
    assert.equal(batchWorker.code,0,batchWorker.output);assert(batchWorker.output.includes(batchWorkerCommitCheck?'"batchWorkerCommit":"passed"':'"batchWorkerCrash":"passed"'),batchWorker.output);console.log(batchWorker.output.trim());
  }
  if(batchSettlementCheck){
    const batch=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-batch-settlement-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_BATCH_SETTLEMENT:'1'});
    assert.equal(batch.code,0,batch.output);assert(batch.output.includes('"batchSettlement":"passed"'),batch.output);console.log(batch.output.trim());
  }
  if(scheduleDispatchCheck){
    const schedules=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-schedule-dispatch-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_SCHEDULE_DISPATCH:'1'});
    assert.equal(schedules.code,0,schedules.output);assert(schedules.output.includes('"scheduleDispatch":"passed"'),schedules.output);console.log(schedules.output.trim());
  }
  if(scheduleWorkerImage){
    const runtimeApp=new URL(appUrl);runtimeApp.hostname='pilot-db';runtimeApp.port='5432';runtimeApp.searchParams.set('sslmode','verify-full');
    const certificate=await run('docker',['exec',containerId!,'cat','/tmp/ma24-server.crt']);assert.equal(certificate.code,0);
    const scheduledWorker=await run(process.execPath,['scripts/run-tsx.cjs',scheduleWorkerCommitCheck?'scripts/verify-schedule-worker-commit-db.ts':'scripts/verify-schedule-worker-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_SCHEDULE_WORKER:'1',
        MA24_SCHEDULE_WORKER_IMAGE:scheduleWorkerImage,MA24_SCHEDULE_DATABASE_CONTAINER:containerId!,MA24_SCHEDULE_NETWORK:networkName,MA24_SCHEDULE_RUNTIME_DATABASE_URL:runtimeApp.toString(),MA24_SCHEDULE_CA:certificate.output.trim()});
    assert.equal(scheduledWorker.code,0,scheduledWorker.output);assert(scheduledWorker.output.includes(scheduleWorkerCommitCheck?'"scheduleWorkerCommit":"passed"':'"scheduleWorkerCrash":"passed"'),scheduledWorker.output);console.log(scheduledWorker.output.trim());
  }
  const verifyMainRuntime=async(http?:{base:string;ownerCookie:string;peerCookie:string;ownerEmail:string})=>{
    if(!mainRuntimeImage)return;
    const inRuntimeApp=new URL(appUrl);inRuntimeApp.hostname='pilot-db';inRuntimeApp.port='5432';inRuntimeApp.searchParams.set('sslmode','verify-full');
    const rootCertificate=await run('docker',['exec',containerId!,'cat','/tmp/ma24-server.crt']);assert.equal(rootCertificate.code,0);
    const mainRuntime=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-main-runtime-worker-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_MAIN_RUNTIME:'1',MA24_MAIN_RUNTIME_IMAGE:mainRuntimeImage,
        MA24_MAIN_RUNTIME_DURABILITY:mainRuntimeDurability?'1':'0',MA24_MAIN_RUNTIME_CRASH_RECOVERY:mainRuntimeCrashRecovery?'1':'0',MA24_MAIN_RUNTIME_COMMIT_LOSS:mainRuntimeCommitLoss?'1':'0',
        MA24_MAIN_RUNTIME_TASK_ENROLLMENT:mainRuntimeTaskEnrollment?'1':'0',MA24_MAIN_RUNTIME_SKILL_RECEIPT:mainRuntimeSkillReceipt?'1':'0',MA24_MAIN_RUNTIME_EXPECT_INTERNAL:mainRuntimeOnly?'1':'0',
        MA24_MAIN_RUNTIME_MODEL_RECEIPT:mainRuntimeModelReceipt?'1':'0',MA24_MAIN_RUNTIME_APPROVAL_HTTP:mainRuntimeApproval?'1':'0',
        MA24_MAIN_RUNTIME_INTERRUPTION:mainRuntimeInterruption?'1':'0',MA24_MAIN_RUNTIME_NETWORK_LOSS:mainRuntimeNetworkLoss?'1':'0',MA24_MAIN_RUNTIME_RESUME_REVOCATION:mainRuntimeResumeRevocation?'1':'0',
        ...(http?{MA24_MAIN_RUNTIME_WEB_BASE:http.base,MA24_MAIN_RUNTIME_OWNER_COOKIE:http.ownerCookie,MA24_MAIN_RUNTIME_PEER_COOKIE:http.peerCookie,MA24_MAIN_RUNTIME_OWNER_EMAIL:http.ownerEmail}:{}),
        MA24_MAIN_RUNTIME_DATABASE_CONTAINER:containerId,MA24_MAIN_RUNTIME_NETWORK:networkName,MA24_MAIN_RUNTIME_DATABASE_URL:inRuntimeApp.toString(),MA24_MAIN_RUNTIME_DATABASE_CA:rootCertificate.output.trim()});
    assert.equal(mainRuntime.code,0,mainRuntime.output);assert(mainRuntime.output.includes('"mainRuntimeWorker":"passed"'),mainRuntime.output);
    if(mainRuntimeSkillReceipt)assert(mainRuntime.output.includes('"disabledSkillNotReenabled":true'),mainRuntime.output);
    if(mainRuntimeModelReceipt)assert(mainRuntime.output.includes('"emptyCheckpointModelNodeRecoveryVerified":true'),mainRuntime.output);
    if(mainRuntimeApproval)assert(mainRuntime.output.includes('"approvedLocalAction":"passed"'),mainRuntime.output);
    if(mainRuntimeDurability)assert(mainRuntime.output.includes('"committedTaskSurvivesLostHttpResponse":true'),mainRuntime.output);
    if(mainRuntimeCrashRecovery)assert(mainRuntime.output.includes('"acknowledgedThreadRetained":true'),mainRuntime.output);
    if(mainRuntimeInterruption&&!mainRuntimeNetworkLoss)assert(mainRuntime.output.includes('"actualHttpManualResumeVerified":true'),mainRuntime.output);
    if(mainRuntimeNetworkLoss)assert(mainRuntime.output.includes('"combinedApiAndNetworkLossVerified":true'),mainRuntime.output);
    if(mainRuntimeResumeRevocation)assert(mainRuntime.output.includes('"withdrawnCheckpointAnswerWithheld":true'),mainRuntime.output);
    if(mainRuntimeCommitLoss){assert(mainRuntime.output.includes('"actualPostgresCommitAcknowledgmentLost":true'),mainRuntime.output);
      assert(mainRuntime.output.includes('"commitPreventedAfterRealInsert":true'),mainRuntime.output);}
    if(mainRuntimeTaskEnrollment)assert(mainRuntime.output.includes('"actualMatchingApiAndWorkerVerified":true'),mainRuntime.output);console.log(mainRuntime.output.trim());
  };
  if(!mainRuntimeInterruption&&!mainRuntimeApproval)await verifyMainRuntime();
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
  if(shadowSourceLocksCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-shadow-source-locks-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_SHADOW_SOURCE_LOCKS:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"shadowSourceLocksDatabase":"passed"'),checked.output);console.log(checked.output.trim());
  }
  if(memorySourceLocksCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-memory-source-locks-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_MEMORY_SOURCE_LOCKS:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"memorySourceLocksDatabase":"passed"'),checked.output);console.log(checked.output.trim());
  }
  if(methodCatalogLocksCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-method-catalog-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_METHOD_CATALOG:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"methodCatalogSourceLocksDatabase":"passed"'),checked.output);console.log(checked.output.trim());
  }
  if(lockedPolicyCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-locked-policy-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_LOCKED_POLICY:'1'},24000);
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"lockedPolicyDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if (runnerAttestationCheck) {
    const attested = await run(process.execPath,
      ["scripts/run-tsx.cjs", "scripts/verify-skill-runner-attestation-db.ts"],
      { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
        MA24_DISPOSABLE_RUNNER_ATTESTATION: "1",MA24_RUNNER_CURRENT_SCHEMA:currentSchemaCheck?'1':'0',
        ...(declarationImage?{MA24_DECLARATION_TEST_IMAGE:declarationImage,MA24_DECLARATION_TEST_CONTAINER:containerId}:{}) });
    assert.equal(attested.code, 0, attested.output);
    assert(attested.output.includes('"runnerAttestationStore":"passed"'), attested.output);
    assert(attested.output.includes('"lockedEvidenceLatestReviewSerialized":true'),attested.output);
    assert(attested.output.includes('"configuredDeclarationCliDatabaseVerified":true'),attested.output);
    if(declarationImage)assert(attested.output.includes('"configuredDeclarationLinuxImageVerified":true'),attested.output);
    if(process.env.MA24_DECLARATION_DATABASE_TRUST==='1'){
      assert(attested.output.includes('"configuredDeclarationDatabaseTrustVerified":true'),attested.output);
      assert(attested.output.includes('"configuredDeclarationRegistryDisablementWaitsForCollectorCommit":true'),attested.output);
    }
    console.log(attested.output.trim());
  }
  if(poolRecoveryCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-ma24-pool-recovery.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_POOL_RECOVERY:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"poolRecoveryDatabase":"passed"'),checked.output);
  }
  if(candidateLeaseContentionCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-candidate-lease-contention-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_CANDIDATE_LEASE_CONTENTION:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"candidateLeaseContentionDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(runtimeDisclosureCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-runtime-disclosure-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_RUNTIME_DISCLOSURE:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"runtimeDisclosureDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(runtimeReadSourcesCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-runtime-read-source-locks-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_RUNTIME_READ_SOURCES:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"runtimeReadSourceLocksDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(agentCheckpointLeaseCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-agent-checkpoint-lease-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_AGENT_CHECKPOINT_LEASE:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"agentCheckpointLeaseDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(agentCallLeaseCheck){
    const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-agent-call-lease-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_AGENT_CALL_LEASE:'1'});
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"agentCallLeaseDatabase":"passed"'),checked.output);
    console.log(checked.output.trim());
  }
  if(transportJournalCheck){
    if(!transportLinuxImage){
     const built=await run(process.execPath,['scripts/build-skill-collector.mjs']);
     assert.equal(built.code,0,built.output);assert(built.output.includes('"collectorBuild":"passed"'),built.output);
    }
    const checked=await run(process.execPath,transportLinuxImage?['scripts/run-skill-transport-linux-check.mjs',transportLinuxImage,containerId!]:['scripts/run-tsx.cjs','scripts/verify-skill-transport-journal-db.ts'],
      {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_TRANSPORT_JOURNAL:'1',
       ...(collectorImage?{MA24_COLLECTOR_TEST_IMAGE:collectorImage,MA24_COLLECTOR_TEST_CONTAINER:containerId}:{} )},24000);
    assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"transportJournalDatabase":"passed"'),checked.output);
    if(transportLinuxImage)assert(checked.output.includes('"linuxFiveCategoryTransport":"passed"'),checked.output);
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
        "--env", `DATABASE_SSL_CA=${certificate.output.trim()}`,
        ...(mailboxFixtureKey?['--env',`MAILBOX_CREDENTIAL_KEY=${mailboxFixtureKey}`,'--env','OPENROUTER_API_KEY=synthetic-unusable']:[]), image]);
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
    if(mainRuntimeInterruption||mainRuntimeApproval)await verifyMainRuntime({base,ownerCookie:firstCookie,peerCookie:secondCookie,ownerEmail:credentials[0].email});
    if(memoryObservationsUi){
      const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-memory-observations-fixed-web.ts'],
       {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_MEMORY_UI:'1',
        MA24_MEMORY_WEB_BASE:base,MA24_MEMORY_OWNER_COOKIE:firstCookie,MA24_MEMORY_PEER_COOKIE:secondCookie,
        MA24_MEMORY_OWNER_EMAIL:credentials[0].email,MA24_MEMORY_DATABASE_CONTAINER:containerId!,OPENAI_API_KEY:'',OPENROUTER_API_KEY:''});
      assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"memoryObservationsFixedWeb":"passed"'),checked.output);console.log(checked.output.trim());
    }
    if(acceptanceOriginalsCheck){
      const originalHttp=process.env.MA24_ORIGINALS_HTTP==='1';
      const originalDirectory=originalHttp?mkdtempSync(join(tmpdir(),'ma24-originals-browser-')):undefined;
      try{
      if(originalDirectory){
        for(const [file,source] of [['key.pem','/tmp/ma24-server.key'],['cert.pem','/tmp/ma24-server.crt']]){
          const data=await run('docker',['exec',containerId!,'cat',source]);assert.equal(data.code,0);
          writeFileSync(join(originalDirectory,file),data.output,{mode:0o600});
        }
      }
      const checked=await run(process.execPath,['scripts/run-tsx.cjs','scripts/verify-skill-acceptance-originals-db.ts'],
        {...process.env,DATABASE_URL:appUrl.toString(),DATABASE_MIGRATION_URL:adminUrl.toString(),MA24_DISPOSABLE_ORIGINAL_CAPTURE:'1',
          ...(originalDirectory?{MA24_ORIGINALS_HTTP_BASE:base,MA24_ORIGINALS_OWNER_COOKIE:firstCookie,MA24_ORIGINALS_PEER_COOKIE:secondCookie,MA24_ORIGINALS_WEB_CONTAINER:webContainerId!,MA24_ORIGINALS_TLS_KEY:join(originalDirectory,'key.pem'),MA24_ORIGINALS_TLS_CERT:join(originalDirectory,'cert.pem')}:{})});
      assert.equal(checked.code,0,checked.output);assert(checked.output.includes('"actualFilesAndDatabase":true'),checked.output);console.log(checked.output.trim());
      }finally{if(originalDirectory)rmSync(originalDirectory,{recursive:true,force:true});}
    }
    if(localMemoryWorkerCheck){
      const {verifyMa24LocalMemoryWorker}=await import('./lib/verify-ma24-local-memory-worker');
      const onObservationsReady=localMemoryHttpCheck?async(ids:{originalId:string;correctedId:string})=>{
        const {verifyMa24MemoryHttpFlow}=await import('./lib/verify-ma24-memory-http-flow');
        return verifyMa24MemoryHttpFlow({base,ownerCookie:firstCookie,peerCookie:secondCookie,...ids});
      }:undefined;
      localMemoryWorkerResult=await verifyMa24LocalMemoryWorker({adminUrl:adminUrl.toString(),appUrl:appUrl.toString(),ownerEmail:credentials[0].email,disposableContainerId:containerId!,graphWorker:localMemoryGraphCheck,chinese:localMemoryChineseCheck,onObservationsReady});
    }
    if(snapshotDownloadCheck){
      const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
      try{const {verifyMa24SnapshotDownload}=await import('./lib/verify-ma24-snapshot-download');
        snapshotDownloadResult=await verifyMa24SnapshotDownload({admin,base,ownerCookie:firstCookie,peerCookie:secondCookie,ownerEmail:credentials[0].email,disposableContainerId:containerId!});
      }finally{await admin.end();}
    }
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
            MA24_HTTPS_PROBE_UPSTREAM: base, MA24_HTTPS_PROBE_KEY: keyPath, MA24_HTTPS_PROBE_CERT: certPath,
            ...(mailboxFixtureKey?{MAILBOX_CREDENTIAL_KEY:mailboxFixtureKey,MA24_FRESH_WEB_FRONTEND_UI:'1',MA24_FRESH_WEB_DISPOSABLE:'1'}:{}),
            ...(extendedUiCheck?{MA24_FRESH_WEB_EXTENDED_UI:'1',LANGSMITH_TRACING:'false',LANGCHAIN_TRACING_V2:'false'}:{}) });
        assert.equal(browser.code, 0, browser.output);
        assert(browser.output.includes('"httpsBrowserSession":"passed"'), browser.output);
        assert(browser.output.includes('"manualCompanyWriteReadUi":true'), browser.output);
        if(frontendUiCheck)assert(browser.output.includes('"freshMailboxUiCases":4'),browser.output);
        if(extendedUiCheck)assert(browser.output.includes('"freshExtendedUiCases":6'),browser.output);
      } finally { rmSync(tempDirectory, { recursive: true, force: true }); }
    }
    if (backupCheck) {
      const verifyTrustRegistryRestore=currentSchemaCheck?await (await import('./lib/ma24-trust-registry-restore-fixture')).prepareTrustRegistryRestoreFixture(adminUrl.toString(),containerId!):undefined;
      const verifyMailboxRestore=currentSchemaCheck?await prepareMailboxRestoreFixture(
        adminUrl.toString(),credentials[0].email,credentials[1].email):undefined;
      const tempDirectory = mkdtempSync(join(tmpdir(), "ma24-pilot-backup-"));
      try {
        const backup = await run(process.execPath,
          ["scripts/run-tsx.cjs", "scripts/backup-verify-ma24-pilot-db.ts",...(currentSchemaCheck?['--current-schema']:[])],
          { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_MIGRATION_URL: adminUrl.toString(),
            PILOT_BACKUP_DIR: tempDirectory });
        assert.equal(backup.code, 0, backup.output);
        assert(backup.output.includes('"pilotBackupRestore":"passed"'), backup.output);
        assert(backup.output.includes('"tenantMembersCompared":2'), backup.output);
        assert(backup.output.includes('"tenantVisibilityMatched":true'), backup.output);
        if(currentSchemaCheck){assert(backup.output.includes('"trustRegistryVersionsCompared":2'),backup.output);assert(backup.output.includes('"trustRegistryDigestsMatched":true'),backup.output);}
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
            assert.deepEqual(stage.rows[0], { stage135: true, laterStage: currentSchemaCheck });
            if(currentSchemaCheck){
              const binding=await restoredAdmin.query<{present:boolean}>(`select count(*)=2 present from information_schema.columns
                where table_schema='public' and table_name='mailbox_sync_run' and column_name in ('work_job_id','work_lease_token')`);
              assert.equal(binding.rows[0].present,true,'Restored current mailbox lease binding missing');
              const sourceLocks=await restoredAdmin.query<{present:boolean}>(`select
                to_regprocedure('public.lock_local_memory_extraction_source(uuid,uuid,text)') is not null
                and to_regprocedure('public.lock_local_memory_receipt_source(uuid)') is not null
                and to_regprocedure('public.capture_immutable_asset_snapshot(uuid,text,bytea)') is not null
                and to_regprocedure('public.publish_skill_runner_trust_registry(jsonb,text)') is not null present`);
              assert.equal(sourceLocks.rows[0].present,true,'Restored source locks or immutable snapshot capture missing');
            }
            const countSql = `select (select count(*)::int from app_user) users,
              (select count(*)::int from market_workspace) workspaces,
              (select count(*)::int from workspace_company) companies,
              (select count(*)::int from knowledge_document) documents,
              ${currentSchemaCheck?`(select count(*)::int from knowledge_asset_immutable_snapshot)`:'0::int'} snapshots,
              ${currentSchemaCheck?`(select md5(coalesce(string_agg(id::text || ':' || asset_id::text || ':' || source_sha256 || ':' || byte_size::text || ':' || encode(digest(body,'sha256'),'hex'),',' order by id),'')) from knowledge_asset_immutable_snapshot)`:'null::text'} snapshot_digest`;
            const sourceAdmin = new Client({ connectionString: adminUrl.toString() });
            await sourceAdmin.connect();
            try {
              const source=(await sourceAdmin.query(countSql)).rows[0];
              if(snapshotDownloadCheck)assert(source.snapshots>0,'Snapshot restore must use nonempty original bytes');
              assert.deepEqual((await restoredAdmin.query(countSql)).rows[0],source,
                "Cross-cluster restored account, document, or snapshot digest differs");
            } finally { await sourceAdmin.end(); }
            if(verifyTrustRegistryRestore)trustRegistryRestoreResult=await verifyTrustRegistryRestore(restoredAdminUrl.toString(),restoredAppUrl.toString());
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
          if(verifyMailboxRestore)await verifyMailboxRestore(restoredAdminUrl.toString(),restoredAppUrl.toString());
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
  acceptanceResult={ freshClusterPilot: "passed", image: "pgvector/pgvector:pg16",
    reviewDraftFixedImageVerified:reviewDraftUiCheck,
    mailboxImapWorkerVerified:mailboxImapWorkerCheck,
    mailboxWorkerImageVerified:Boolean(mailboxWorkerImage)&&!mailboxWorkerImapImageCheck,
    mailboxWorkerImapImageVerified:Boolean(mailboxWorkerImage)&&mailboxWorkerImapImageCheck,
    scheduleDispatchVerified:scheduleDispatchCheck,
    batchSettlementVerified:batchSettlementCheck,
    batchWorkerCrashVerified:Boolean(batchWorkerImage)&&!batchWorkerCommitCheck,
    batchWorkerCommitVerified:Boolean(batchWorkerImage)&&batchWorkerCommitCheck,
    scheduleWorkerCrashVerified:Boolean(scheduleWorkerImage)&&!scheduleWorkerCommitCheck,
    scheduleWorkerCommitVerified:Boolean(scheduleWorkerImage)&&scheduleWorkerCommitCheck,
    publishedAddress: "127.0.0.1 only", rolesVerified: true, duplicateRoleBootstrapRejected: true,
    freshMigrationThrough: currentSchemaCheck?170:135,currentSchemaMarkers,snapshotLifecycleVerified:snapshotLifecycleCheck,knowledgeScopeSourcesVerified:knowledgeScopeSourcesCheck,finalSettlementVerified:finalSettlementCheck,compiledMainRuntimeVerified:Boolean(mainRuntimeImage),mainRuntimeSkillReceiptVerified:mainRuntimeSkillReceipt,mainRuntimeModelReceiptVerified:mainRuntimeModelReceipt,mainRuntimeDurabilityVerified:mainRuntimeDurability,mainRuntimeCrashRecoveryVerified:mainRuntimeCrashRecovery,mainRuntimeInterruptionVerified:mainRuntimeInterruption,mainRuntimeNetworkLossVerified:mainRuntimeNetworkLoss,mainRuntimeResumeRevocationVerified:mainRuntimeResumeRevocation,mainRuntimeCommitLossVerified:mainRuntimeCommitLoss,mainRuntimeTaskEnrollmentVerified:mainRuntimeTaskEnrollment,snapshotDownloadResult,memoryObservationsUiVerified:memoryObservationsUi,localMemoryWorkerResult,trustRegistryRestoreResult,freshMailboxUiVerified:frontendUiCheck,extendedFrontendUiVerified:extendedUiCheck,
    syntheticAccountCompanyAndRestoreVerified: true, copiedProductionData: false,
    linuxWebImage: webImage ?? null, linuxWebHttpWorkflowVerified: Boolean(webImage),
    linuxWebHttpsBrowserVerified: browserCheck, tenConcurrentSyntheticAccountsVerified: tenUserCheck,
    pilotBackupRestoreVerified: backupCheck, crossClusterRestoreVerified: crossClusterCheck,
    nonemptyMailboxCrossClusterRestoreVerified:currentSchemaCheck&&backupCheck&&crossClusterCheck,
    scriptedModeBusinessVerified: modeBusinessCheck,
    runnerAttestationStoreVerified: runnerAttestationCheck,
    collectorDeclarationImageVerified: Boolean(declarationImage),
    lockedPolicyDatabaseVerified: lockedPolicyCheck,
    memorySourceLocksVerified: memorySourceLocksCheck,
    methodCatalogSourceLocksVerified: methodCatalogLocksCheck,
    shadowSourceLocksVerified: shadowSourceLocksCheck,
    safetySkillUsageVerified: safetySkillUsageCheck,
    transportJournalDatabaseVerified: transportJournalCheck,
    agentCallLeaseDatabaseVerified:agentCallLeaseCheck,
    agentCheckpointLeaseDatabaseVerified:agentCheckpointLeaseCheck,
    candidateLeaseContentionDatabaseVerified:candidateLeaseContentionCheck,
    runtimeReadSourceLocksDatabaseVerified:runtimeReadSourcesCheck,
    runtimeDisclosureDatabaseVerified:runtimeDisclosureCheck,
    linuxFiveCategoryTransportVerified:Boolean(transportLinuxImage),
    collectorImageTlsPreflightVerified: Boolean(collectorImage),
    poolRecoveryVerified: poolRecoveryCheck,
    standaloneDatabaseRecoveryVerified: webPoolRecoveryCheck,
    extraG09Migration: runnerAttestationCheck ? 141 : null,
    prospectiveSourceDatabaseVerified: prospectiveSourceCheck,
    prospectivePairedMaterialVerified: prospectiveMaterialCheck,
    prospectiveStandaloneHttpVerified: Boolean(prospectiveHttpImage),
    prospectiveStandaloneBrowserVerified: prospectiveBrowserCheck,
    completeCompositionVerified: prospectiveCompositionCheck,
    samePortPriorImageRollbackVerified: Boolean(rollbackImage) };
} catch(error) {primaryFailure={error};}
finally {
  const steps:Array<{name:string;run:()=>Promise<unknown>}>=[];
  if(prospectiveBrowserDirectory)steps.push({name:'browser-directory',run:async()=>{
    const target=resolve(prospectiveBrowserDirectory);
    assert(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('ma24-skill-browser-'),'Disposable browser directory escaped temporary root');
    rmSync(target,{recursive:true,force:true});
  }});
  for(const [name,target] of [['restored-container',restoredContainerId],['web-container',webContainerId],['database-container',containerId]] as const){
    if(target)steps.push({name,run:async()=>{
      assert(/^[a-f0-9]{64}$/.test(target),'Disposable container ID invalid');
      const removed=await run('docker',['rm','--force','--volumes',target]);assert.equal(removed.code,0,removed.output);
    }});
  }
  const networkTarget=networkId;
  if(networkTarget)steps.push({name:'network',run:async()=>{
    assert(/^[a-f0-9]{64}$/.test(networkTarget),'Disposable network ID invalid');
    const removed=await run('docker',['network','rm',networkTarget]);assert.equal(removed.code,0,removed.output);
  }});
  await completeDisposableCheck(primaryFailure,steps);
}
assert(acceptanceResult,'Disposable acceptance result missing');
console.log(JSON.stringify(acceptanceResult));
