import { readFile } from "node:fs/promises";
import path from "node:path";

import { extractCandidateOccurrences } from "../experiments/global-model-lead-benchmark/lib/normalization";

const filename = process.argv[2];
if (!filename) throw new Error("Usage: debug-benchmark-extraction.ts <raw artifact filename>");
const artifact = JSON.parse(await readFile(path.resolve("experiments/global-model-lead-benchmark/runs/raw", filename), "utf8"));
const candidates = extractCandidateOccurrences(artifact, "diagnostic-salt");
console.log(JSON.stringify(candidates.map((candidate) => ({
  rank: candidate.answerRank,
  name: candidate.companyName,
  category: candidate.claimedCategory,
  categoryRank: candidate.categoryRank,
  canonicalKey: candidate.canonicalKey,
  extractionRule: candidate.extractionRule,
})), null, 2));
