import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const id = randomBytes(6).toString("hex");
const volume = `ma24-pilot-upload-fixture-${id}`;
const writer = `ma24-pilot-upload-writer-${id}`;
const directory = mkdtempSync(join(tmpdir(), "ma24-upload-backup-"));
const image = "node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const invoke = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { env, windowsHide: true, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};
const docker = args => {
  const result = invoke("docker", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
let volumeCreated = false, writerCreated = false;
try {
  docker(["volume", "create", volume]);
  volumeCreated = true;
  docker(["run", "--rm", "--network", "none", "--mount", `type=volume,source=${volume},target=/source`,
    image, "node", "-e", `const f=require('fs');f.mkdirSync('/source/member A',{mode:0o750});
f.writeFileSync('/source/member A/原件.bin',Buffer.from([0,255,1,128,10]),{mode:0o640});
f.writeFileSync('/source/member A/review.json',JSON.stringify({synthetic:true}),{mode:0o600});
f.writeFileSync('/source/empty.txt','',{mode:0o644});
for(const p of ['/source','/source/member A','/source/member A/原件.bin','/source/member A/review.json','/source/empty.txt'])f.chownSync(p,1000,1000);`]);
  docker(["run", "--detach", "--name", writer, "--network", "none",
    "--mount", `type=volume,source=${volume},target=/source`, image,
    "node", "-e", "setInterval(()=>{},1000)"]);
  writerCreated = true;
  const env = { ...process.env, PILOT_UPLOAD_VOLUME: volume, PILOT_BACKUP_DIR: directory };
  const blocked = invoke(process.execPath, ["scripts/backup-verify-ma24-pilot-uploads.mjs"], env);
  assert.notEqual(blocked.status, 0);
  assert(blocked.stderr.includes("Stop every container using the upload volume"), blocked.stderr);
  assert.equal(readdirSync(directory).length, 0, "Refused backup created artifacts");
  docker(["rm", "--force", writer]);
  writerCreated = false;
  const passed = invoke(process.execPath, ["scripts/backup-verify-ma24-pilot-uploads.mjs"], env);
  assert.equal(passed.status, 0, passed.stderr);
  const receipt = JSON.parse(passed.stdout.trim());
  assert.equal(receipt.pilotUploadBackupRestore, "passed");
  assert.equal(receipt.files, 3);
  assert.equal(receipt.contentOwnershipAndPermissionsMatched, true);
  assert.equal(receipt.nodeUid1000ReadVerified, true);
  assert.equal(readdirSync(directory).length, 2);
  assert.equal(docker(["volume", "ls", "--quiet", "--filter", "name=ma24-pilot-restore-uploads-"]), "");
  console.log(JSON.stringify({ pilotUploadBackup: "passed", syntheticFiles: 3,
    activeMountRefused: true, binaryUnicodeEmptyAndReviewFiles: true,
    restoredContentOwnershipAndPermissionsMatched: true, nodeUid1000ReadVerified: true }));
} finally {
  try { if (writerCreated) docker(["rm", "--force", writer]); }
  finally {
    try { if (volumeCreated) docker(["volume", "rm", volume]); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
