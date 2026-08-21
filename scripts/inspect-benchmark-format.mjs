import { readFile } from "node:fs/promises";
import path from "node:path";

const filename = process.argv[2];
if (!filename) throw new Error("Usage: node scripts/inspect-benchmark-format.mjs <raw artifact filename>");
const artifact = JSON.parse(await readFile(path.resolve("experiments/global-model-lead-benchmark/runs/raw", filename), "utf8"));
const lines = String(artifact.answerText ?? "").split(/\r?\n/);
const structuralLines = lines.filter((line) => /^\s*(?:#{1,6}\s+|\d+[.)]\s+|\|.+\||[-*]\s+\*\*)/.test(line));
console.log((process.argv.includes("--all") ? lines : structuralLines).slice(0, 160).join("\n"));
