import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.argv.length, 2, "This command takes no arguments");
const volume = process.env.PILOT_UPLOAD_VOLUME;
const directoryInput = process.env.PILOT_BACKUP_DIR;
assert(volume && /^ma24-pilot[a-zA-Z0-9_.-]*$/.test(volume), "Set an explicit ma24-pilot upload volume name");
assert(directoryInput && isAbsolute(directoryInput), "Set an absolute PILOT_BACKUP_DIR outside the worktree");
process.umask(0o077);
const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const assertOutsideWorktree = path => {
  const inside = relative(root, path);
  assert(inside && (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)),
    "Backups must stay outside the source worktree");
};
assertOutsideWorktree(resolve(directoryInput));
mkdirSync(directoryInput, { recursive: true, mode: 0o700 });
const directory = realpathSync(directoryInput);
assertOutsideWorktree(directory);
assert(!directory.includes(","), "Backup path must not contain Docker mount separators");
if (process.platform !== "win32") assert.equal(statSync(directory).mode & 0o077, 0, "Backup directory permissions must be private");
const helperImage = "node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const run = (args) => {
  const result = spawnSync("docker", args, { windowsHide: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || "Docker command failed");
  return result.stdout.trim();
};
run(["volume", "inspect", volume]);
assert.equal(run(["ps", "--quiet", "--filter", `volume=${volume}`]), "",
  "Stop every container using the upload volume before backup, including Web and workers");
const helper = (mounts, command) => run(["run", "--rm", "--network", "none", "--read-only",
  "--security-opt", "no-new-privileges:true", "--user", "0:0",
  ...mounts.flatMap(value => ["--mount", value]), helperImage, ...command]);
const sourceMount = `type=volume,source=${volume},target=/source,readonly`;
const inventoryCode = `const fs=require('fs'),p=require('path'),c=require('crypto');
const rows=[];function walk(path,key){const s=fs.lstatSync(path);
if(!s.isDirectory()&&!s.isFile())throw Error('Upload volume contains unsupported link or special file');
const row={path:key,mode:s.mode&4095,uid:s.uid,gid:s.gid,type:s.isDirectory()?'directory':'file'};
if(s.isFile()){row.bytes=s.size;row.sha256=c.createHash('sha256').update(fs.readFileSync(path)).digest('hex');}
rows.push(row);if(s.isDirectory())for(const n of fs.readdirSync(path).sort())walk(p.join(path,n),key?key+'/'+n:n);}
walk('/source','');process.stdout.write(JSON.stringify(rows));`;
const sourceInventory = helper([sourceMount], ["node", "-e", inventoryCode]);
const entries = JSON.parse(sourceInventory);
const suffix = `${new Date().toISOString().replaceAll(":", "-")}_${randomBytes(4).toString("hex")}`;
const filename = `ma24_pilot_uploads_${suffix}.tar`;
const archive = join(directory, filename);
const manifestPath = `${archive}.json`;
const restoredVolume = `ma24-pilot-restore-uploads-${randomBytes(8).toString("hex")}`;
let restoredCreated = false;
let success = false;
try {
  helper([sourceMount, `type=bind,source=${directory},target=/backup`],
    ["node", "-e", "process.umask(0o077);const r=require('child_process').spawnSync('tar',process.argv.slice(1),{stdio:'inherit'});if(r.error)throw r.error;process.exit(r.status??1)",
      "--", "--create", "--file", `/backup/${filename}`, "--directory", "/source", "."]);
  assert.equal(helper([sourceMount], ["node", "-e", inventoryCode]), sourceInventory,
    "Upload files changed during backup; keep all writers stopped");
  run(["volume", "create", restoredVolume]);
  restoredCreated = true;
  helper([`type=volume,source=${restoredVolume},target=/restored`,
    `type=bind,source=${directory},target=/backup,readonly`],
  ["tar", "--extract", "--same-owner", "--same-permissions", "--file", `/backup/${filename}`, "--directory", "/restored"]);
  const restoredMount = `type=volume,source=${restoredVolume},target=/source,readonly`;
  assert.equal(helper([restoredMount], ["node", "-e", inventoryCode]), sourceInventory,
    "Restored upload content, paths, permissions, or ownership differs");
  run(["run", "--rm", "--network", "none", "--read-only", "--user", "1000:1000",
    "--security-opt", "no-new-privileges:true", "--mount", restoredMount,
    helperImage, "node", "-e", inventoryCode]);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const manifest = { schema: "ma24-pilot-upload-backup-v1", createdAt: new Date().toISOString(),
    file: filename, bytes: statSync(archive).size, sha256,
    inventorySha256: createHash("sha256").update(sourceInventory).digest("hex"),
    files: entries.filter(entry => entry.type === "file").length,
    contentOwnershipAndPermissionsMatched: true, nodeUid1000ReadVerified: true,
    sourceMountedReadOnly: true, noRunningContainerMountAtStart: true };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  success = true;
  console.log(JSON.stringify({ pilotUploadBackupRestore: "passed", ...manifest }));
} finally {
  try { if (restoredCreated) run(["volume", "rm", restoredVolume]); }
  finally {
    if (!success) { rmSync(archive, { force: true }); rmSync(manifestPath, { force: true }); }
  }
}
