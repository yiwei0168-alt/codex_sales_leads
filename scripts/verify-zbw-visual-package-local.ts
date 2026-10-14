/** Validate the held-out ZBW visual candidate package without accepting any review decision. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { validateVisualCandidates } from "../src/lib/knowledge/visual-review-candidates";
import type { Block } from "../src/lib/knowledge/extracted-tree";

const root = resolve("tmp/ma24-independent-quarantine/zbw-visual-candidates");
const artifactBytes = await readFile("tmp/ma24-independent-quarantine/zbw-product-extraction.json");
const packageBytes = await readFile(resolve(root, "review.json"));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const artifact = JSON.parse(artifactBytes.toString("utf8")) as { documents: Array<{ blocks: Block[] }> };
assert.equal(artifact.documents.length, 1);
const records = validateVisualCandidates(packageBytes, {
  sourceSha256: "595df78e84768ec588a9d638366c69064c63139bdb43fea3445500ac7fd63bde",
  artifactSha256: sha256(artifactBytes), packageSha256: sha256(packageBytes),
}, artifact.documents[0].blocks);
const checked = new Set<string>();
for (const record of records) {
  if (!record.imageFile) continue;
  assert(record.imageFile === `${record.reviewImageSha256}.png`);
  const path = resolve(root, record.imageFile);
  assert(path.startsWith(root + sep));
  const bytes = await readFile(path);
  assert.equal(sha256(bytes), record.reviewImageSha256);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  checked.add(record.imageFile);
}
assert.equal(records.length, 145);
const proposals = JSON.parse(await readFile("docs/evidence/ma24-g14-zbw-target-visual-proposals-2026-10-15.json", "utf8")) as {
  sourceSha256: string; artifactSha256: string; candidatePackageSha256: string;
  objects: Array<{ blockId: string; proposedDecision: string }>;
};
assert.equal(proposals.sourceSha256, "595df78e84768ec588a9d638366c69064c63139bdb43fea3445500ac7fd63bde");
assert.equal(proposals.artifactSha256, sha256(artifactBytes));
assert.equal(proposals.candidatePackageSha256, sha256(packageBytes));
assert.equal(proposals.objects.length, 5);
assert.equal(new Set(proposals.objects.map(item => item.blockId)).size, 5);
for (const item of proposals.objects) {
  assert(records.some(record => record.blockId === item.blockId));
  assert.equal(item.proposedDecision, "decoration");
}
console.log(JSON.stringify({ sourceSha256: "595df78e84768ec588a9d638366c69064c63139bdb43fea3445500ac7fd63bde",
  artifactSha256: sha256(artifactBytes), packageSha256: sha256(packageBytes),
  objects: records.length, uniqueImagesHashVerified: checked.size, targetVisualProposals: proposals.objects.length,
  qualityAccepted: false, goldCreated: 0 }));
