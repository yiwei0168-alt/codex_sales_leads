/** Diagnostic near-neighbor screen for the current, explicitly non-frozen G14 pool. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { buildKnowledgeEvaluationCorpus, knowledgeEvaluationCorpusHash } from "../src/lib/knowledge/evaluation/corpus";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

const root = resolve("docs/evidence");
const auditPath = join(root, "ma24-g14-draft-pool-exclusion-audit-2026-10-15.json");
const output = resolve(process.argv[2] ?? "tmp/ma24-independent-quarantine/g14-current-pool-neighbors.json");
assert(output.startsWith(resolve("tmp") + sep) && output.endsWith(".json"));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const audit = JSON.parse(await readFile(auditPath, "utf8")) as {
  reproducibility: { manifestSha256: string };
  excludedFromIndependentGold: Array<{ ids: string[] }>;
  remainingDraftsForFullSetReview: { ids: string[] };
};
const rows: Array<{ file: string; sha256: string; ids: string[] }> = [];
const drafts: Array<{ id: string; question: string; file: string }> = [];
for (const file of (await readdir(root)).filter(name => /^ma24-g14-.*\.json$/.test(name)).sort()) {
  const bytes = await readFile(join(root, file));
  const source = JSON.parse(bytes.toString("utf8")) as {
    draftQuestions?: Array<{ id: string; question: string }>;
    draftQuestion?: { id: string; question: string };
  };
  const questions = [...(source.draftQuestions ?? []), ...(source.draftQuestion ? [source.draftQuestion] : [])];
  if (!questions.length) continue;
  assert(questions.every(item => item.id && item.question));
  rows.push({ file, sha256: hash(bytes), ids: questions.map(item => item.id).sort() });
  drafts.push(...questions.map(item => ({ ...item, file })));
}
assert.equal(hash(JSON.stringify(rows)), audit.reproducibility.manifestSha256);
const excluded = new Set(audit.excludedFromIndependentGold.flatMap(group => group.ids));
const retained = drafts.filter(item => !excluded.has(item.id)).sort((a, b) => a.id.localeCompare(b.id));
assert.deepEqual(retained.map(item => item.id).sort(), [...audit.remainingDraftsForFullSetReview.ids].sort());
const corpus = buildKnowledgeEvaluationCorpus();
const blindRaw = await readFile("tmp/ma24-holdout-evaluation/blind-questions.json", "utf8");
const blind = JSON.parse(blindRaw) as { cases: Array<{ caseId: string; query: string }> };
const old = [...corpus.cases.map(item => item.query), ...blind.cases.map(item => item.query)];
const uniqueOld = [...new Set(old)];
const inputs = [...retained.map(item => item.question), ...uniqueOld];
const vectors: number[][] = [];
for (let offset = 0; offset < inputs.length; offset += 32) {
  vectors.push(...await embedTextsWithBge(inputs.slice(offset, offset + 32), fetch, 120_000));
  console.log(JSON.stringify({ embedded: vectors.length, total: inputs.length }));
}
const dot = (a: number[], b: number[]) => Number(a.reduce((sum, value, index) => sum + value * b[index], 0).toFixed(6));
const results = retained.map((item, index) => ({
  id: item.id,
  file: item.file,
  question: item.question,
  currentNeighbors: retained.flatMap((other, position) => index === position ? [] : [{
    id: other.id, score: dot(vectors[index], vectors[position]),
  }]).sort((a, b) => b.score - a.score).slice(0, 5),
  historicalNeighbors: uniqueOld.map((query, position) => ({
    query, score: dot(vectors[index], vectors[retained.length + position]),
  })).sort((a, b) => b.score - a.score).slice(0, 5),
}));
const report = {
  schema: "ma24-g14-current-pool-neighbor-screen-v1",
  manifestSha256: audit.reproducibility.manifestSha256,
  auditSha256: hash(await readFile(auditPath)),
  oldCorpusVersion: corpus.version,
  oldCorpusSha256: knowledgeEvaluationCorpusHash(corpus),
  historicalBlindSha256: hash(blindRaw),
  retainedQuestions: retained.length,
  historicalRows: old.length,
  uniqueHistoricalQueries: uniqueOld.length,
  model: "BAAI/bge-m3",
  revision: "5617a9f61b028005a4858fdac845db406aefb181",
  results,
  semanticIndependenceProven: false,
  cloudCalls: 0,
};
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, sha256: hash(await readFile(output)), retained: retained.length,
  topCurrent: results.map(item => ({ id: item.id, neighborId: item.currentNeighbors[0]?.id,
    score: item.currentNeighbors[0]?.score })),
  topHistorical: results.map(item => ({ id: item.id, score: item.historicalNeighbors[0]?.score })) }));
