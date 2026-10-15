import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { hashPassword } from "../../src/lib/auth/password";

const oldRoot = resolve("tmp/ui-scroll-runtime-release");
const candidateRoot = process.cwd();
const oldBuild = "QfoyXprIZIVgSWxFSZ-1K";
const nextBin = (root: string) => resolve(root, "node_modules/next/dist/bin/next");

async function freeLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return address.port;
}

async function waitForReady(base: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Isolated Web server exited before readiness");
    try {
      const response = await fetch(`${base}/api/auth/session`, { signal: AbortSignal.timeout(2_000) });
      await response.body?.cancel();
      if (response.status === 200) return;
    } catch { /* Continue until the bounded deadline. */ }
    await new Promise(accept => setTimeout(accept, 500));
  }
  throw new Error("Isolated Web server did not become ready in 45 seconds");
}

async function stopOwnedServer(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  const closed = new Promise<void>(accept => child.once("close", () => accept()));
  if (process.platform === "win32") {
    await new Promise<void>((accept, reject) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true, stdio: "ignore",
      });
      killer.once("error", reject);
      killer.once("exit", code => code === 0 ? accept() : reject(new Error("Isolated Web process tree did not stop")));
    });
  } else {
    child.kill("SIGTERM");
  }
  await closed;
}

export async function verifyMa24WebCloneCompatibility(options: {
  admin: Client;
  applicationDatabaseUrl: string;
  migrationDatabaseUrl: string;
  reviewUi?: boolean;
  thothReviewUi?: boolean;
  conversationUi?: boolean;
  frontendUi?: boolean;
  mailboxBatchUi?: boolean;
  mailboxSyncUi?: boolean;
  mailboxReaderUi?: boolean;
  attachmentUi?: boolean;
  runHistoryUi?: boolean;
  revisionHistoryUi?: boolean;
  agentLibraryUi?: boolean;
  rawJsonUi?: boolean;
  skillReplayRawJsonUi?: boolean;
  nonMailApprovalRawJsonUi?: boolean;
}): Promise<unknown> {
  assert.equal(await readFile(resolve(oldRoot, ".next/BUILD_ID"), "utf8").then(value => value.trim()), oldBuild);
  const candidateBuild = (await readFile(resolve(candidateRoot, ".next/BUILD_ID"), "utf8")).trim();
  assert(candidateBuild && candidateBuild !== oldBuild, "A separate candidate Web build is required");
  const userId = randomUUID();
  const email = `ma24-web-compat-${userId}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  await options.admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'MA24 isolated Web compatibility',$3,'member','active')", [userId, email, hashPassword(password)]);
  const versions = [
    { name: "old-web-rollback", root: oldRoot, buildId: oldBuild },
    { name: "candidate-web", root: candidateRoot, buildId: candidateBuild },
    ...(options.reviewUi ? [{ name: "old-web-after-candidate-upload", root: oldRoot, buildId: oldBuild }] : []),
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const version of versions) {
    const port = await freeLocalPort();
    const base = `http://127.0.0.1:${port}`;
    let serviceOutput = "";
    const child = spawn(process.execPath, [nextBin(version.root), "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: version.root,
      env: { ...process.env, NODE_ENV: "production", DATABASE_URL: options.applicationDatabaseUrl,
        DATABASE_MIGRATION_URL: options.migrationDatabaseUrl,
        ...(version.name === "candidate-web" && options.mailboxBatchUi ? {
          OPENROUTER_API_KEY: "ma24-synthetic-unusable",
          OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
          KIMI_MODEL: "kimi-k3",
        } : {}) },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", part => {
      serviceOutput = `${serviceOutput}${part}`.slice(-12_000);
    });
    try {
      await waitForReady(base, child);
      const manifest = await fetch(`${base}/_next/static/${version.buildId}/_buildManifest.js`, { signal: AbortSignal.timeout(10_000) });
      assert.equal(manifest.status, 200, `${version.name} build manifest unavailable`);
      await manifest.body?.cancel();
      const denied = await fetch(`${base}/api/knowledge/uploads?offset=0&limit=7`, { signal: AbortSignal.timeout(10_000) });
      assert.equal(denied.status, 401, `${version.name} anonymous upload list was not denied`);
      await denied.body?.cancel();
      const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10_000) });
      if (login.status !== 200) {
        const diagnostic = serviceOutput.split(/\r?\n/).filter(line =>
          /permission denied|function .*does not exist|relation .*does not exist|ECONN|error:|code:/i.test(line))
          .slice(-8).join(" | ").replaceAll(email, "<synthetic-email>")
          .replaceAll(password, "<synthetic-password>")
          .replaceAll(options.applicationDatabaseUrl, "<clone-db>")
          .replaceAll(options.migrationDatabaseUrl, "<clone-db>").slice(0, 1400);
        throw new Error(`${version.name} synthetic login HTTP ${login.status}; server diagnostic: ${diagnostic || "none"}`);
      }
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      assert(cookie, `${version.name} login had no session cookie`);
      await login.body?.cancel();
      const list = await fetch(`${base}/api/knowledge/uploads?offset=0&limit=7`, { headers: { cookie }, signal: AbortSignal.timeout(10_000) });
      assert.equal(list.status, 200, `${version.name} authenticated upload list failed`);
      const listed = await list.json() as { jobs?: unknown[] };
      assert(Array.isArray(listed.jobs));
      if (version.name === "old-web-after-candidate-upload") {
        const uploaded = (await options.admin.query<{ id: string; status: string }>(
          "select id,status from knowledge_upload_job where user_id=$1", [userId],
        )).rows;
        assert.equal(uploaded.length, 1, "Synthetic candidate upload missing before old Web rollback smoke");
        assert.equal(uploaded[0].status, "extracted");
        assert.equal(listed.jobs.length, 1, "Old Web cannot list the candidate-created upload");
        assert.equal((listed.jobs[0] as { id: string }).id, uploaded[0].id);
      } else {
        assert.deepEqual(listed.jobs, [], `${version.name} synthetic account sees non-owned upload jobs`);
      }
      let acceptanceReviewStatus: number | undefined;
      if (version.name === "candidate-web") {
        const response = await fetch(`${base}/api/assistant/skills/acceptance-reviews?skillId=${randomUUID()}`, {
          headers: { cookie }, signal: AbortSignal.timeout(10_000),
        });
        acceptanceReviewStatus = response.status;
        assert.equal(response.status, 200, "Candidate Skill acceptance list failed after migration");
        assert.deepEqual(await response.json(), { items: [], hasMore: false });
      }
      let reviewPage: unknown;
      let thothReviewPage: unknown;
      let conversationPage: unknown;
      let mailboxDrawerPage: unknown;
      let mailboxBatchPage: unknown;
      let mailboxSyncPage: unknown;
      let mailboxReaderPage: unknown;
      let attachmentPage: unknown;
      let runHistoryPage: unknown;
      let revisionHistoryPage: unknown;
      let agentLibraryPage: unknown;
      let rawJsonPage: unknown;
      let skillReplayRawJsonPage: unknown;
      let nonMailApprovalRawJsonPage: unknown;
      if (version.name === "candidate-web" && options.reviewUi) {
        const { verifyMa24ReviewPageClone } = await import("./verify-ma24-review-page-clone");
        try {
          reviewPage = await verifyMa24ReviewPageClone({ admin: options.admin, base, cookie,
            userId, email, password, migrationDatabaseUrl: options.migrationDatabaseUrl });
        } catch (error) {
          const diagnostic = serviceOutput.split(/\r?\n/).filter(line =>
            /permission denied|function .*does not exist|relation .*does not exist|ECONN|error:|code:/i.test(line))
            .slice(-8).join(" | ").replaceAll(email, "<synthetic-email>")
            .replaceAll(password, "<synthetic-password>")
            .replaceAll(options.applicationDatabaseUrl, "<clone-db>")
            .replaceAll(options.migrationDatabaseUrl, "<clone-db>").slice(0, 1400);
          throw new Error(`Candidate review page smoke failed: ${error instanceof Error ? error.message : "unknown"}; server diagnostic: ${diagnostic || "none"}`);
        }
      }
      if (version.name === "candidate-web" && options.thothReviewUi) {
        const { verifyMa24ThothReviewPageClone } = await import("./verify-ma24-thoth-review-page-clone");
        thothReviewPage = await verifyMa24ThothReviewPageClone({ admin: options.admin, base, cookie,
          userId, email, password, migrationDatabaseUrl: options.migrationDatabaseUrl });
      }
      if (version.name === "candidate-web" && options.conversationUi) {
        const { verifyMa24ConversationDeleteClone } = await import("./verify-ma24-conversation-delete-clone");
        conversationPage = await verifyMa24ConversationDeleteClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.frontendUi) {
        const { verifyMa24MailboxDrawerClone } = await import("./verify-ma24-mailbox-drawer-clone");
        mailboxDrawerPage = await verifyMa24MailboxDrawerClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.mailboxBatchUi) {
        const { verifyMa24MailboxBatchClone } = await import("./verify-ma24-mailbox-batch-clone");
        mailboxBatchPage = await verifyMa24MailboxBatchClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.mailboxSyncUi) {
        const { verifyMa24MailboxSyncClone } = await import("./verify-ma24-mailbox-sync-clone");
        mailboxSyncPage = await verifyMa24MailboxSyncClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.mailboxReaderUi) {
        const { verifyMa24MailboxReaderClone } = await import("./verify-ma24-mailbox-reader-clone");
        mailboxReaderPage = await verifyMa24MailboxReaderClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.attachmentUi) {
        const { verifyMa24AttachmentSelectorClone } = await import("./verify-ma24-attachment-selector-clone");
        attachmentPage = await verifyMa24AttachmentSelectorClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.runHistoryUi) {
        const { verifyMa24RunHistoryClone } = await import("./verify-ma24-run-history-clone");
        runHistoryPage = await verifyMa24RunHistoryClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.revisionHistoryUi) {
        const { verifyMa24RevisionHistoryClone } = await import("./verify-ma24-revision-history-clone");
        revisionHistoryPage = await verifyMa24RevisionHistoryClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.agentLibraryUi) {
        const { verifyMa24AgentLibraryClone } = await import("./verify-ma24-agent-library-clone");
        agentLibraryPage = await verifyMa24AgentLibraryClone({ admin: options.admin, base, cookie, userId });
      }
      if (version.name === "candidate-web" && options.rawJsonUi) {
        const { verifyMa24RawJsonClone } = await import("./verify-ma24-raw-json-clone");
        rawJsonPage = await verifyMa24RawJsonClone({ admin: options.admin, base, cookie, userId,
          migrationDatabaseUrl: options.migrationDatabaseUrl,
          applicationDatabaseUrl: options.applicationDatabaseUrl });
      }
      if (version.name === "candidate-web" && options.skillReplayRawJsonUi) {
        const { verifyMa24SkillReplayRawJsonClone } = await import("./verify-ma24-skill-replay-raw-json-clone");
        skillReplayRawJsonPage = await verifyMa24SkillReplayRawJsonClone({ admin: options.admin, base, cookie, userId,
          migrationDatabaseUrl: options.migrationDatabaseUrl });
      }
      if (version.name === "candidate-web" && options.nonMailApprovalRawJsonUi) {
        const { verifyMa24NonMailApprovalRawJsonClone } = await import("./verify-ma24-non-mail-approval-raw-json-clone");
        nonMailApprovalRawJsonPage = await verifyMa24NonMailApprovalRawJsonClone({ admin: options.admin, base, cookie, userId });
      }
      results.push({ version: version.name, buildId: version.buildId, manifestStatus: manifest.status,
        anonymousUploadStatus: denied.status, syntheticLoginStatus: login.status,
        authenticatedUploadStatus: list.status, visibleUploadJobs: listed.jobs.length,
        ...(acceptanceReviewStatus ? { acceptanceReviewStatus } : {}),
        ...(reviewPage ? { reviewPage } : {}),
        ...(thothReviewPage ? { thothReviewPage } : {}),
        ...(conversationPage ? { conversationPage } : {}),
        ...(mailboxDrawerPage ? { mailboxDrawerPage } : {}),
        ...(mailboxBatchPage ? { mailboxBatchPage } : {}),
        ...(mailboxSyncPage ? { mailboxSyncPage } : {}),
        ...(mailboxReaderPage ? { mailboxReaderPage } : {}),
        ...(attachmentPage ? { attachmentPage } : {}),
        ...(runHistoryPage ? { runHistoryPage } : {}),
        ...(revisionHistoryPage ? { revisionHistoryPage } : {}),
        ...(agentLibraryPage ? { agentLibraryPage } : {}),
        ...(rawJsonPage ? { rawJsonPage } : {}),
        ...(skillReplayRawJsonPage ? { skillReplayRawJsonPage } : {}),
        ...(nonMailApprovalRawJsonPage ? { nonMailApprovalRawJsonPage } : {}) });
    } finally {
      await stopOwnedServer(child);
    }
  }
  return { cloneOnly: true, syntheticAccountOnly: true,
    modelCalls: options.reviewUi ? null : 0, workerUsageCountersCaptured: !options.reviewUi,
    versions: results };
}
