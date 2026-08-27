import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  prepareSharedEvidenceDossiers,
  type CandidatePoolArtifact,
} from "../lib/evidence-dossier";

const root = path.resolve("experiments/multi-source-lead-discovery");
const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice("--run-id=".length)
  ?? "2026-08-26-de-v1";
const artifactRoot = path.join(root, "artifacts/runs", runId);
const inputPath = path.join(artifactRoot, "evidence/deduplicated-candidate-pool.json");
const outputPath = path.join(artifactRoot, "evidence/shared-evidence-dossiers.seed.json");

const pool = JSON.parse(await readFile(inputPath, "utf8")) as CandidatePoolArtifact;
if (pool.runId !== runId) throw new Error(`Pool runId ${pool.runId} does not match requested run ${runId}`);
const artifact = prepareSharedEvidenceDossiers(pool);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

const statusCounts = Object.fromEntries([...new Set(artifact.companies.map((company) => company.enrichmentStatus))]
  .sort().map((status) => [status, artifact.companies.filter((company) => company.enrichmentStatus === status).length]));
const crossPoolMergeCount = artifact.companies.filter((company) => company.sourcePoolNames.length > 1).length;
console.log(JSON.stringify({
  runId,
  sourcePoolCompanyCount: artifact.sourcePoolCompanyCount,
  canonicalCompanyCount: artifact.canonicalCompanyCount,
  submittedOccurrenceCount: artifact.submittedOccurrenceCount,
  crossPoolMergeCount,
  crossPoolMerges: artifact.companies.filter((company) => company.sourcePoolNames.length > 1)
    .map((company) => ({ canonicalName: company.canonicalName, sourcePoolNames: company.sourcePoolNames })),
  statusCounts,
  output: path.relative(process.cwd(), outputPath),
}, null, 2));
