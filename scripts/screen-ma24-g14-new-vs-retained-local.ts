/** Diagnostic only: compare two new drafts with the previously retained G14 pool. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

const root = resolve("docs/evidence");
const files = [
  "ma24-g14-bpi-2018-xlsx-candidate-2026-10-15.json",
  "ma24-g14-taking-part-internet-xlsx-no-answer-candidate-2026-10-15.json",
];
const output = resolve(process.argv[2] ?? "tmp/ma24-independent-quarantine/new-vs-retained-screen.json");
assert(output.startsWith(resolve("tmp") + sep) && output.endsWith(".json"));
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const auditBytes = await readFile(join(root, "ma24-g14-draft-pool-exclusion-audit-2026-10-15.json"));
const audit = JSON.parse(auditBytes.toString("utf8")) as {
  remainingDraftsForFullSetReview: { ids: string[] };
};
const expected = new Set(audit.remainingDraftsForFullSetReview.ids);
assert.equal(expected.size, 18);
const retained: Array<{ id: string; question: string; file: string }> = [];
for (const file of (await readdir(root)).filter(name => /^ma24-g14-.*\.json$/.test(name)).sort()) {
  if (files.includes(file)) continue;
  const source = JSON.parse(await readFile(join(root, file), "utf8")) as {
    draftQuestions?: Array<{ id: string; question: string }>;
    draftQuestion?: { id: string; question: string };
  };
  const rows = [...(source.draftQuestions ?? []), ...(source.draftQuestion?.id ? [source.draftQuestion] : [])];
  retained.push(...rows.filter(item => expected.has(item.id)).map(item => ({ ...item, file })));
}
assert.deepEqual(new Set(retained.map(item => item.id)), expected);
const fresh = await Promise.all(files.map(async file => {
  const raw = await readFile(join(root, file), "utf8");
  const source = JSON.parse(raw) as { draftQuestion?: string; draft?: { id: string; question: string } };
  const draft = source.draft ?? { id: "bpi-2018-cash-accruals", question: source.draftQuestion };
  assert(draft.id && draft.question);
  return { id: draft.id, question: draft.question, file, evidenceSha256: hash(raw) };
}));
const inputs = [...fresh.map(item => item.question), ...retained.map(item => item.question)];
const vectors: number[][] = [];
for (let offset = 0; offset < inputs.length; offset += 32)
  vectors.push(...await embedTextsWithBge(inputs.slice(offset, offset + 32), fetch, 120_000));
const similarity = (left: number[], right: number[]) => Number(left.reduce(
  (sum, value, index) => sum + value * right[index], 0).toFixed(6));
const results = fresh.map((item, index) => ({ ...item,
  neighbors: retained.map((other, position) => ({ id: other.id, file: other.file,
    question: other.question, score: similarity(vectors[index], vectors[fresh.length + position]),
  })).sort((a, b) => b.score - a.score).slice(0, 10),
}));
const report = { schema: "ma24-g14-new-vs-retained-neighbor-screen-v1",
  priorAuditSha256: hash(auditBytes), retainedDrafts: retained.length, newDrafts: fresh.length,
  model: "BAAI/bge-m3", revision: "5617a9f61b028005a4858fdac845db406aefb181",
  results, semanticIndependenceProven: false, cloudCalls: 0 };
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, sha256: hash(await readFile(output)),
  top: results.map(item => ({ id: item.id, neighborId: item.neighbors[0]?.id,
    score: item.neighbors[0]?.score })) }));
