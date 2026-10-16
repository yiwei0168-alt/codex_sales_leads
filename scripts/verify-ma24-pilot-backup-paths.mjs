import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "ma24-backup-boundary-"));
const alias = join(temporary, "worktree-alias");
let aliasCreated = false;
try {
  symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
  aliasCreated = true;
  const misleading = join(root, `..backup-boundary-${Date.now()}`);
  assert(!existsSync(misleading));
  const commands = [
    [join(root, "scripts/run-tsx.cjs"), join(root, "scripts/backup-verify-ma24-pilot-db.ts")],
    [join(root, "scripts/backup-verify-ma24-pilot-uploads.mjs")],
  ];
  for (const args of commands) {
    for (const directory of [root, misleading, alias]) {
      const result = spawnSync(process.execPath, args, { cwd: temporary, windowsHide: true, encoding: "utf8",
        env: { ...process.env, DATABASE_URL: "postgresql://app:synthetic@127.0.0.1:1/pilot",
          DATABASE_MIGRATION_URL: "postgresql://admin:synthetic@127.0.0.1:1/pilot",
          PILOT_UPLOAD_VOLUME: "ma24-pilot-synthetic", PILOT_BACKUP_DIR: directory } });
      if (result.error) throw result.error;
      assert.notEqual(result.status, 0);
      assert(result.stderr.includes("Backups must stay outside the source worktree"), result.stderr);
    }
  }
  assert(!existsSync(misleading), "Rejected path created a directory inside the worktree");
  const outside = spawnSync(process.execPath, commands[0], { cwd: temporary, windowsHide: true, encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://app:synthetic@127.0.0.1:1/pilot",
      DATABASE_MIGRATION_URL: "postgresql://admin:synthetic@127.0.0.1:1/pilot",
      PILOT_BACKUP_DIR: temporary } });
  if (outside.error) throw outside.error;
  assert.notEqual(outside.status, 0);
  assert(outside.stderr.includes("ECONNREFUSED"), "External directory should pass validation and reach the closed test port");
  assert.deepEqual(readdirSync(temporary), ["worktree-alias"]);
  console.log(JSON.stringify({ pilotBackupPathBoundary: "passed", commands: 2,
    rejectedCasesPerCommand: 3, alternateWorkingDirectory: true,
    dotDotNameAndWorktreeJunctionRejected: true, externalDirectoryAccepted: true, archiveCreated: false }));
} finally {
  if (aliasCreated) unlinkSync(alias);
  const absoluteTemporary = resolve(temporary);
  assert(absoluteTemporary.startsWith(resolve(tmpdir())), "Temporary cleanup escaped system temp");
  rmSync(absoluteTemporary, { recursive: true, force: true });
}
