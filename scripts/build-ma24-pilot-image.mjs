import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releasesRoot = join(repoRoot, ".next-releases");
const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repoRoot, encoding: "utf8" }).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Fixed commit required');
const tag = process.argv[2] ?? `ma24-pilot-web:${commit.slice(0, 8)}`;
const target = process.argv[3];
if (process.argv.length > 4 || (target && target !== '--target=builder')) throw new Error('Only --target=builder is supported');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(tag)) throw new Error("Invalid Docker image tag");

mkdirSync(releasesRoot, { recursive: true });
const temporaryRoot = mkdtempSync(join(releasesRoot, "pilot-image-"));
const temporaryRelative = relative(releasesRoot, temporaryRoot);
if (!temporaryRelative || temporaryRelative.startsWith("..") || isAbsolute(temporaryRelative)) {
  throw new Error("Temporary build path escaped .next-releases");
}

const archive = join(temporaryRoot, "source.tar");
const context = join(temporaryRoot, "context");
mkdirSync(context);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

try {
  console.log(`Building ${tag} from committed source ${commit}`);
  run("git", ["archive", "--format=tar", commit, "-o", archive]);
  run("tar", ["-xf", archive, "-C", context]);
  for (const path of [".dockerignore", "Dockerfile.pilot-web", "scripts/start-ma24-pilot-container.mjs"]) {
    if (!existsSync(join(context, path))) throw new Error(`Committed image input is missing: ${path}`);
  }
  run("docker", ["build", ...(target ? ['--target', 'builder'] : []), "--file", join(context, "Dockerfile.pilot-web"), "--build-arg", `SOURCE_COMMIT=${commit}`, "--tag", tag, context]);
  console.log(`Built ${tag} from ${commit}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
