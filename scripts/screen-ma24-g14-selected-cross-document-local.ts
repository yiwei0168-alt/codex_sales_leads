/** Bounded same-pool similarity screen for the selected, still-unfrozen G14 cross-document draft. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

const root = resolve("tmp/ma24-independent-quarantine");
const input = resolve(process.argv[2] ?? `${root}/g14-current-draft-pool-v2-2026-10-15.json`);
const output = resolve(process.argv[3] ?? `${root}/g14-selected-cross-document-neighbors-2026-10-15.json`);
for (const path of [input, output]) assert(path.startsWith(root + sep) && path.endsWith(".json"));
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const poolBytes = await readFile(input);
const pool = JSON.parse(poolBytes.toString("utf8")) as {
  schema: string; rows: Array<{ id: string; question: string; families: string[];
    wholeQuestionCrossDocument: boolean }>;
};
assert.equal(pool.schema, "ma24-g14-current-draft-pool-v2");
assert.equal(pool.rows.length, 21);
assert.equal(new Set(pool.rows.map(row => row.id)).size, 21);
const selected = pool.rows.filter(row => row.wholeQuestionCrossDocument);
assert.equal(selected.length, 1);
assert.equal(selected[0].id, "govuk-bduk-taking-part-premises-vs-regional-ability");
const others = pool.rows.filter(row => row.id !== selected[0].id);
const vectors = await embedTextsWithBge([selected[0].question, ...others.map(row => row.question)], fetch, 120_000);
assert.equal(vectors.length, 21);
const score = (index: number) => Number(vectors[0].reduce((sum, value, axis) =>
  sum + value * vectors[index + 1][axis], 0).toFixed(6));
const neighbors = others.map((row, index) => ({ id: row.id, question: row.question,
  families: row.families, cosine: score(index) })).sort((a, b) => b.cosine - a.cosine);
const report = { schema: "ma24-g14-selected-cross-document-neighbor-screen-v1",
  inputPoolSha256: digest(poolBytes), selected: selected[0], otherDrafts: others.length,
  model: "BAAI/bge-m3", revision: "5617a9f61b028005a4858fdac845db406aefb181",
  neighbors, semanticIndependenceProven: false, goldApproved: false, cloudCalls: 0 };
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, sha256: digest(await readFile(output)), selectedId: selected[0].id,
  topTen: neighbors.slice(0, 10).map(row => ({ id: row.id, cosine: row.cosine })) }));
