/** Correct stale v8 G14 pool counters without changing any question or source row. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const inputPath = "tmp/ma24-independent-quarantine/g14-current-draft-pool-v8-nist-corrected-2026-10-16.json";
const outputPath = "tmp/ma24-independent-quarantine/g14-current-draft-pool-v9-metadata-2026-10-16.json";
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const inputBytes = await readFile(inputPath);
assert.equal(sha(inputBytes), "4572c140e64aa992a666c90729fb1ca6c3a8ef6a6922b3a8b5c7a6dfb3e984d8");
const prior = JSON.parse(inputBytes.toString("utf8")) as Record<string, unknown>;
assert.equal(prior.schema, "ma24-g14-current-draft-pool-v8");
const publication = prior.publicationRows as Array<{ id: string; question: string; primaryFormat: string }>;
const synthetic = prior.securityAnnex as Array<{ id: string; primaryFormat: string }>;
assert.equal(publication.length, 24);
assert.equal(synthetic.length, 3);
assert.equal(prior.draftCount, 27);
assert.equal(prior.publicationDraftCount, publication.length);
assert.equal(prior.syntheticSecurityDraftCount, synthetic.length);
const ids = [...publication, ...synthetic].map(row => row.id);
assert.equal(new Set(ids).size, ids.length, "Duplicate G14 draft ID");
assert.equal(new Set(publication.map(row => row.question)).size, publication.length,
  "Duplicate publication question text");
const formats = ["long-pdf", "pdf", "pptx", "xlsx"];
const countFormats = (rows: Array<{ primaryFormat: string }>) => Object.fromEntries(
  formats.map(format => [format, rows.filter(row => row.primaryFormat === format).length]));
const publicationFormats = countFormats(publication);
const syntheticFormats = countFormats(synthetic);
const allFormats = countFormats([...publication, ...synthetic]);
assert.equal(Object.values(allFormats).reduce((sum, count) => sum + count, 0),
  publication.length + synthetic.length, "Unknown primary format");
assert.deepEqual(prior.primaryFormatDrafts, allFormats,
  "Prior format counts must describe all rows before amending metadata");
const report = {
  ...prior,
  schema: "ma24-g14-current-draft-pool-v9",
  priorSha256: sha(inputBytes),
  scope: "24 publication drafts plus 3 synthetic security drafts; no final set freeze",
  primaryFormatDraftsScope: "All 27 drafts, including the 3 synthetic PDF security cases",
  publicationFormatDrafts: publicationFormats,
  syntheticFormatDrafts: syntheticFormats,
  metadataCorrection: "The retired NIST cross-source XLSX draft was removed in v8; its inherited scope label was stale.",
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ schema: "ma24-g14-pool-v9-metadata-audit-v1",
  inputSha256: sha(inputBytes), outputSha256: sha(await readFile(outputPath)),
  publicationDrafts: publication.length, syntheticDrafts: synthetic.length,
  publicationFormats, syntheticFormats, allFormats,
  questionAndSourceRowsChanged: false, goldApprovedByThisAudit: 0 }));
