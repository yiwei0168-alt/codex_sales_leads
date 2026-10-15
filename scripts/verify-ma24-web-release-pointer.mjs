import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// This check only binds the local Web artifact and HTTP build pointer. It cannot
// establish the in-process source of LangGraph or workers, or authorize a switch.
const sourceCommit = "5e74b86d";
const expectedCandidateBuildId = "lZLtUJUu48Mzpo-hg2VLq";
const expectedCandidateManifestSha256 = "62e24755b44c3f2ca85cf85fd916ae1d1e4090462f41fc9cd5632048fc63983e";
const expectedLiveBuildId = "QfoyXprIZIVgSWxFSZ-1K";
const snapshot = resolve(".next-releases/ma24-g01-5e74b86d");
const buildInputs = [
  "src", "public", "db/migrations", "package.json", "package-lock.json",
  "next.config.ts", "tsconfig.json", "scripts/build-next.mjs",
];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const candidateBuildId = (await readFile(resolve(snapshot, "BUILD_ID"), "utf8")).trim();
const manifest = await readFile(resolve(snapshot, "build-manifest.json"));
const manifestSha256 = createHash("sha256").update(manifest).digest("hex");
const committedInputChanges = git("diff", "--name-only", sourceCommit, "HEAD", "--", ...buildInputs)
  .split(/\r?\n/).filter(Boolean);
const worktreeInputChanges = git("status", "--porcelain", "--untracked-files=all", "--", ...buildInputs)
  .split(/\r?\n/).filter(Boolean);

const baseUrl = process.env.MA24_WEB_BASE_URL ?? "http://127.0.0.1:3018";
const status = async path => {
  const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(5000) });
  await response.body?.cancel();
  return response.status;
};
const [homeStatus, sessionStatus, oldManifestStatus, candidateManifestStatus] = await Promise.all([
  status("/"), status("/api/auth/session"),
  status(`/_next/static/${expectedLiveBuildId}/_buildManifest.js`),
  status(`/_next/static/${expectedCandidateBuildId}/_buildManifest.js`),
]);
const candidateArtifactIntact = candidateBuildId === expectedCandidateBuildId
  && manifestSha256 === expectedCandidateManifestSha256
  && committedInputChanges.length === 0 && worktreeInputChanges.length === 0;
const oldPointerObserved = homeStatus === 200 && sessionStatus === 200
  && oldManifestStatus === 200 && candidateManifestStatus === 404;
console.log(JSON.stringify({
  schema: "ma24-web-release-pointer-v1",
  checkedAt: new Date().toISOString(),
  mode: "read-only",
  candidate: { sourceCommit, buildId: candidateBuildId, snapshot,
    manifestSha256, committedInputChanges, worktreeInputChanges, candidateArtifactIntact },
  web: { baseUrl, expectedLiveBuildId, homeStatus, sessionStatus,
    oldManifestStatus, candidateManifestStatus, oldPointerObserved },
  candidateLoaded: candidateManifestStatus === 200,
  readyForRelease: false,
  limits: ["Snapshot BUILD_ID and build input trees do not prove every snapshot file hash",
    "HTTP build assets do not prove in-process source for LangGraph or workers",
    "This check does not establish domain quality, fresh backup, migration, pilot or actual rollback"],
}));
assert(candidateArtifactIntact, "Candidate Web build inputs or BUILD_ID changed");
assert(oldPointerObserved, "Live Web build pointer differs from the expected old baseline");
