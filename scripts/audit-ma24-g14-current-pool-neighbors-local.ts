/** Read-only source input, local BGE question-neighbor screen for a provisional G14 pool. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

const root = resolve("tmp/ma24-independent-quarantine");
const inputPath = resolve(process.argv[2] ?? `${root}/g14-current-draft-pool-v6-2026-10-15.json`);
const outputPath = resolve(process.argv[3] ?? `${root}/g14-current-pool-neighbors-local.json`);
for (const path of [inputPath, outputPath])
  assert(path.startsWith(root + sep) && path.endsWith(".json"), "MA24 pool screen stays in private quarantine");
assert(inputPath !== outputPath, "MA24 pool screen output must differ from input");

const source = await readFile(inputPath);
const pool = JSON.parse(source.toString("utf8")) as {
  schema: string; draftCount: number; publicationDraftCount: number; syntheticSecurityDraftCount: number;
  publicationRows: Array<{ id: string; question: string; families: string[] }>;
  securityAnnex: Array<{ id: string; question: string }>;
};
assert(/^ma24-g14-current-draft-pool-v\d+$/.test(pool.schema), "Unknown MA24 pool schema");
assert(Array.isArray(pool.publicationRows) && Array.isArray(pool.securityAnnex));
const rows = [...pool.publicationRows.map(row => ({ ...row, kind: "publication" })),
  ...pool.securityAnnex.map(row => ({ ...row, families: ["synthetic-private-fixture"], kind: "synthetic" }))];
assert(rows.length === pool.draftCount && pool.publicationRows.length === pool.publicationDraftCount &&
  pool.securityAnnex.length === pool.syntheticSecurityDraftCount && rows.length <= 64,
  "MA24 provisional pool count or local BGE batch limit mismatch");
assert(new Set(rows.map(row => row.id)).size === rows.length &&
  rows.every(row => typeof row.id === "string" && row.id.trim() &&
    typeof row.question === "string" && row.question.trim() &&
    Array.isArray(row.families) && row.families.length), "Incomplete MA24 draft identity");

const vectors = await embedTextsWithBge(rows.map(row => row.question), fetch, 300_000);
const score = (a: number, b: number) => Number(vectors[a].reduce((sum, value, index) =>
  sum + value * vectors[b][index], 0).toFixed(6));
const results = rows.map((row, index) => ({ id: row.id, kind: row.kind, families: row.families,
  neighbors: rows.flatMap((other, j) => j === index ? [] : [{ id: other.id, kind: other.kind,
    families: other.families, cosine: score(index, j) }])
    .sort((a, b) => b.cosine - a.cosine).slice(0, 10) }));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const report = { schema: "ma24-g14-current-pool-neighbors-v1", inputSha256: sha(source),
  model: "BAAI/bge-m3", revision: "5617a9f61b028005a4858fdac845db406aefb181",
  rows: rows.length, results, semanticIndependenceProven: false, cloudCalls: 0 };
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ outputPath, outputSha256: sha(await readFile(outputPath)), rows: rows.length,
  semanticIndependenceProven: false, cloudCalls: 0 }));
