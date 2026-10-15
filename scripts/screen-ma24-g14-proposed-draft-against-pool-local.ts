/** Diagnostic local BGE comparison of one proposed G14 draft with the current pool. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

const receiptRoot = resolve("docs/evidence");
const tempRoot = resolve("tmp/ma24-independent-quarantine");
const receiptPath = resolve(process.argv[2] ?? "");
const poolPath = resolve(process.argv[3] ?? "");
const outputPath = resolve(process.argv[4] ?? "");
assert(receiptPath.startsWith(receiptRoot + sep) && receiptPath.endsWith(".json"));
for (const file of [poolPath, outputPath])
  assert(file.startsWith(tempRoot + sep) && file.endsWith(".json"));
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const receiptBytes = await readFile(receiptPath);
const poolBytes = await readFile(poolPath);
const receipt = JSON.parse(receiptBytes.toString("utf8")) as {
  sourceSha256s: string[]; families: string[]; draft: { id: string; question: string };
};
const pool = JSON.parse(poolBytes.toString("utf8")) as {
  schema: string; rows: Array<{ id: string; question: string; families: string[] }>;
};
assert(["ma24-g14-current-draft-pool-v2", "ma24-g14-current-draft-pool-v3"].includes(pool.schema));
assert(pool.rows.length === (pool.schema.endsWith("v2") ? 21 : 22));
assert(new Set(pool.rows.map(row => row.id)).size === pool.rows.length);
assert(receipt.sourceSha256s?.length === 2 && receipt.sourceSha256s.every(hash => /^[0-9a-f]{64}$/.test(hash)));
assert(receipt.draft?.id && receipt.draft.question?.trim() && receipt.families?.length === 2);
assert(!pool.rows.some(row => row.id === receipt.draft.id || row.question === receipt.draft.question));
const vectors = await embedTextsWithBge([receipt.draft.question, ...pool.rows.map(row => row.question)], fetch, 120_000);
assert.equal(vectors.length, pool.rows.length + 1);
const neighbors = pool.rows.map((row, index) => ({ id: row.id, question: row.question,
  families: row.families, sharedFamilies: row.families.filter(family => receipt.families.includes(family)),
  cosine: Number(vectors[0].reduce((sum, value, axis) => sum + value * vectors[index + 1][axis], 0).toFixed(6)),
})).sort((left, right) => right.cosine - left.cosine);
const report = { schema: "ma24-g14-proposed-draft-pool-screen-v1",
  proposalSha256: digest(receiptBytes), currentPoolSha256: digest(poolBytes),
  proposedId: receipt.draft.id, otherDrafts: pool.rows.length,
  model: "BAAI/bge-m3", revision: "5617a9f61b028005a4858fdac845db406aefb181",
  neighbors, semanticIndependenceProven: false, goldApproved: false, cloudCalls: 0 };
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output: outputPath, sha256: digest(await readFile(outputPath)),
  proposedId: report.proposedId, topTen: neighbors.slice(0, 10).map(({ id, cosine, sharedFamilies }) =>
    ({ id, cosine, sharedFamilies })) }));
