/** Codex-reviewed visual proposals. This writes evidence, not product review decisions. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const sourceSha256 = "595df78e84768ec588a9d638366c69064c63139bdb43fea3445500ac7fd63bde";
const artifactSha256 = "778e65d60e8f54cfc4002e542d458ab5e4ba238638c8bd7f295a318362489c6f";
const packageSha256 = "98970c6fa0f14f6f250559081e29a780393b8b38c0ad42e82d1a2b19deedead6";
const bytes = await readFile("tmp/ma24-independent-quarantine/zbw-visual-candidates/review.json");
assert.equal(createHash("sha256").update(bytes).digest("hex"), packageSha256);
const packageData = JSON.parse(bytes.toString("utf8")) as { sourceSha256: string; extractionArtifactSha256: string;
  records: Array<{ blockId: string; imageFile?: string; reason: string }> };
assert.equal(packageData.sourceSha256, sourceSha256);
assert.equal(packageData.extractionArtifactSha256, artifactSha256);
assert.equal(packageData.records.length, 145);
const images = [...new Set(packageData.records.flatMap(item => item.imageFile ? [item.imageFile] : []))].sort();
assert.equal(images.length, 68);

// Ordered by the image SHA-256 filenames in the frozen package; descriptions were checked against
// the original rendered slides and the full-resolution images where text or structure matters.
const descriptions = [
  "code and document illustration", "ORCID logo", "folder icon", "Jisc Open policy finder logo",
  "countdown cards", "rocket illustration", "phone illustration", "server-panel icon",
  "EconBiz search screenshot", "code laptop icon", "identity illustration", "CC BY badge",
  "code browser illustration", "Open Economics Guide illustration", "five-benefit wheel diagram",
  "researcher profile illustration", "Guide QR code", "reader illustration", "Open Access logo",
  "Figshare logo", "blank or transparent picture", "gear icon", "reproducibility icon",
  "two-person illustration", "researcher portrait", "DOAJ logo", "ZBW logo", "researcher portrait",
  "sharing illustration", "DMP question-board diagram", "GitHub logo", "researcher portrait",
  "Open Access browser icon", "historical photograph", "OA Helper logo", "open-lock icon",
  "researcher at laptop illustration", "Green Open Access leaf", "Guide logo crop", "MPRA logo",
  "document icon", "gear icon", "code snippets illustration", "person holding mug illustration",
  "researcher at laptop illustration", "blank or transparent picture", "programmer illustration",
  "gear icon", "institution icon", "server icon", "information icon", "researcher at laptop illustration",
  "Zenodo logo", "blank or transparent picture", "open-science items illustration",
  "Gold Open Access icon", "Green Open Access icon", "branch icon",
  "freely available article zoom", "researcher illustration", "code icon", "researcher team illustration",
  "Creative Commons icon", "research data team illustration", "data-centre illustration",
  "EconStor logo", "EconBiz logo", "GitLab logo",
];
assert.equal(descriptions.length, images.length);
const evidenceText = new Map([
  ["slide-11-visual-2", "The wheel lists five individual benefits of Open Science: greater visibility of scholarly work; greater impact and promotion of knowledge transfer; facilitating feedback; compliance with funding guidelines; and more options for publication and more control."],
  ["slide-22-visual-2", "The dated EconBiz example searches for marketing with the Open Access only filter selected; results show freely available labels. This illustrates the interface in the slide, not current search results or counts."],
  ["slide-22-visual-10", "A magnified callout of the EconBiz example marks an Article result as freely available."],
  ["slide-30-visual-5", "The DMP board asks what data are produced and used, the data type, what should or must be stored and why, which supplementary information is needed, when data selection happens, how long data should be stored, when and where data are transferred, and who may use the data."],
]);
const objects = packageData.records.map(record => {
  const evidence = evidenceText.get(record.blockId);
  if (record.imageFile) {
    const index = images.indexOf(record.imageFile);
    assert(index >= 0);
    return { blockId: record.blockId, proposedDecision: evidence ? "evidence" : "decoration",
      ...(evidence ? { evidenceText: evidence } : {}),
      reason: evidence ? `Original slide and candidate image checked: ${descriptions[index]} carries text or structure absent from successful editable text blocks.`
        : `Original slide and candidate image checked: ${descriptions[index]} is decorative or repeats adjacent editable text; no separate factual transcription needed.` };
  }
  assert(!evidence);
  if (record.reason === "native-connector-candidate-requires-review")
    return { blockId: record.blockId, proposedDecision: "decoration", reason: "Original slide and native connector checked: layout line or callout link, with no standalone factual content." };
  assert.equal(record.blockId, "slide-13-visual-4");
  return { blockId: record.blockId, proposedDecision: "decoration",
    reason: "Original slide 13 shape 216 exported and checked: identity illustration next to the editable ORCID uniqueness text." };
});
assert.equal(objects.filter(item => item.proposedDecision === "evidence").length, 4);
assert.equal(objects.filter(item => item.proposedDecision === "decoration").length, 141);
assert.equal(new Set(objects.map(item => item.blockId)).size, 145);
const out = { schema: "ma24-g14-zbw-visual-object-review-v1", date: "2026-10-15", sourceSha256,
  artifactSha256, candidatePackageSha256: packageSha256,
  scope: "145 individual original-slide and candidate-image proposals; no product review applied or document registered",
  objects, proposedReview: { total: 145, evidence: 4, decoration: 141, unresolved: 0 },
  productReviewApplied: false, goldCreated: 0 };
await writeFile("docs/evidence/ma24-g14-zbw-visual-object-review-2026-10-15.json", `${JSON.stringify(out, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ objects: objects.length, evidence: 4, decoration: 141,
  packageSha256, productReviewApplied: false, goldCreated: 0 }));
