import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DISCOVERY_PROVIDER_ENVIRONMENTS } from "../lib/providers";

const root = path.resolve("experiments/multi-source-lead-discovery");
const repositoryRoot = path.resolve(".");
const benchmarkPath = path.join(root, "config/benchmark.json");
const inputsPath = path.join(root, "config/inputs.json");
const inputFiles = [
  benchmarkPath,
  inputsPath,
  path.join(root, "docs/01-protocol.md"),
  path.join(root, "docs/05-scoring-and-blind-audit.md"),
  path.join(repositoryRoot, "src/data/channel-role-taxonomy.ts"),
];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const [benchmarkText, inputsText] = await Promise.all([
  readFile(benchmarkPath, "utf8"),
  readFile(inputsPath, "utf8"),
]);
const benchmark = JSON.parse(benchmarkText) as {
  schemaVersion: number;
  protocolVersion: string;
  status: string;
  countryCode: string;
  countryName: string;
  languageCode: string;
  measuredSystems: unknown[];
  execution: Record<string, unknown>;
  scoring: Record<string, unknown>;
};
const inputs = JSON.parse(inputsText) as {
  schemaVersion: number;
  promptVersion: string;
  channels: Array<{ id: string; queries: string[] }>;
  primaryEvaluator: Record<string, unknown>;
  downstreamEvaluator: {
    evaluatorVersion: string;
    provider: string;
    gateway: string;
    apiKeyEnvironmentVariable: string;
    baseUrl: string;
    model: string;
    reasoningEffort: string;
    structuredOutput: string;
    maxOutputTokens: number;
  };
};

if (benchmark.status !== "frozen-ready-to-run") throw new Error("Benchmark protocol is not frozen");
if (inputs.channels.some((channel) => channel.queries.length !== benchmark.execution.queriesPerChannel)) {
  throw new Error("Frozen query count does not match the execution budget");
}

const fileHashes = await Promise.all(inputFiles.map(async (filename) => {
  const content = await readFile(filename);
  return {
    path: path.relative(repositoryRoot, filename).replaceAll("\\", "/"),
    sha256: sha256(content),
    bytes: content.byteLength,
  };
}));

const manifest = {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  promptVersion: inputs.promptVersion,
  frozenAt: benchmark.execution.frozenAt,
  datePolicy: "Discovery calls ran after execution.frozenAt. OpenAI evaluator calls began after execution.judgeAmendedAt; retry/failure-isolation logic applies after execution.runnerAmendedAt. Human-audit sampling was amended before any human decisions, as recorded in scoring.blindAudit.amendedAt. Every attempt retains its actual ISO-8601 Asia/Shanghai timestamp.",
  market: {
    countryCode: benchmark.countryCode,
    countryName: benchmark.countryName,
    languageCode: benchmark.languageCode,
  },
  endpoints: DISCOVERY_PROVIDER_ENVIRONMENTS.map((provider) => ({
    providerId: provider.id,
    apiKeyEnvironmentVariable: provider.apiKeyEnv,
    baseUrlEnvironmentVariable: provider.baseUrlEnv,
    defaultBaseUrl: provider.defaultBaseUrl,
  })),
  measuredSystems: benchmark.measuredSystems,
  execution: benchmark.execution,
  scoring: benchmark.scoring,
  queryPacks: inputs.channels.map((channel) => ({ channelId: channel.id, queries: channel.queries })),
  primaryEvaluator: inputs.primaryEvaluator,
  diagnosticApiEvaluator: inputs.downstreamEvaluator,
  unresolvedPlaceholders: [],
  secretValuesIncluded: false,
  fileHashes,
};

await writeFile(path.join(root, "artifacts/input-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  written: "experiments/multi-source-lead-discovery/artifacts/input-manifest.json",
  manifestSha256: sha256(JSON.stringify(manifest)),
  inputFileCount: fileHashes.length,
}, null, 2));
