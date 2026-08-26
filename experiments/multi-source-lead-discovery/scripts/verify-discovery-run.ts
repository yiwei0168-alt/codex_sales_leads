import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

interface BenchmarkConfig {
  execution: { runId: string; runOrder: string[]; queriesPerChannel: number; geminiFullRequests: number };
  selectedChannels: Array<{ id: string }>;
}

interface InputsConfig {
  channels: Array<{ id: string; queries: string[] }>;
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const benchmark = JSON.parse(await readFile(path.join(root, "config/benchmark.json"), "utf8")) as BenchmarkConfig;
const inputs = JSON.parse(await readFile(path.join(root, "config/inputs.json"), "utf8")) as InputsConfig;
const discoveryRoot = path.join(root, "artifacts/runs", benchmark.execution.runId, "discovery");

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(filename) : entry.name.endsWith(".json") ? [filename] : [];
  }));
  return nested.flat();
}

const files = (await jsonFiles(discoveryRoot)).sort();
const expectedFiles = benchmark.execution.runOrder.length * inputs.channels.length;
if (files.length !== expectedFiles) throw new Error(`Expected ${expectedFiles} discovery artifacts, found ${files.length}`);

const forbiddenLabels = ["authorization", "x-api-key", "api_key", "cookie", "Key Executives"];
const configuredSecretValues = [
  process.env.GEMINI_API_KEY,
  process.env.TAVILY_API_KEY,
  process.env.GOOGLE_PLACES_API_KEY,
  process.env.EXA_API_KEY,
  process.env.BRAVE_SEARCH_API_KEY,
  process.env.SEARCHAPI_API_KEY,
].map((value) => value?.trim()).filter((value): value is string => Boolean(value && value.length >= 8));
const records = [];
let normalizedRecords = 0;
let plannedSuccessfulRequests = benchmark.execution.geminiFullRequests;
for (const filename of files) {
  const content = await readFile(filename, "utf8");
  const relative = path.relative(path.resolve("."), filename).replaceAll("\\", "/");
  for (const label of forbiddenLabels) {
    if (content.toLowerCase().includes(label.toLowerCase())) throw new Error(`Forbidden committed label in ${relative}: ${label}`);
  }
  if (configuredSecretValues.some((secret) => content.includes(secret))) throw new Error(`Configured secret leaked into ${relative}`);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content)) throw new Error(`Email address leaked into ${relative}`);
  const artifact = JSON.parse(content) as {
    systemId: string;
    channelId: string;
    rawSha256: string;
    candidates?: unknown[];
    queryOutputs?: Array<{ queryIndex: number; rawSha256: string; result: { query: { query: string }; items: unknown[] } }>;
  };
  if (!benchmark.execution.runOrder.includes(artifact.systemId)) throw new Error(`Unknown system in ${relative}`);
  const channel = inputs.channels.find((entry) => entry.id === artifact.channelId);
  if (!channel) throw new Error(`Unknown channel in ${relative}`);
  if (artifact.systemId === "gemini-full") {
    if (!Array.isArray(artifact.candidates)) throw new Error(`Missing Gemini Full candidates in ${relative}`);
    normalizedRecords += artifact.candidates.length;
  } else {
    if (artifact.queryOutputs?.length !== benchmark.execution.queriesPerChannel) throw new Error(`Wrong query count in ${relative}`);
    for (const queryOutput of artifact.queryOutputs) {
      if (queryOutput.result.query.query !== channel.queries[queryOutput.queryIndex]) throw new Error(`Frozen query mismatch in ${relative}`);
      if (!/^[a-f0-9]{64}$/.test(queryOutput.rawSha256)) throw new Error(`Invalid raw hash in ${relative}`);
      normalizedRecords += queryOutput.result.items.length;
      plannedSuccessfulRequests += 1;
    }
  }
  const fileStat = await stat(filename);
  records.push({ path: relative, sha256: sha256(content), bytes: fileStat.size,
    recordCount: artifact.candidates?.length ?? artifact.queryOutputs?.reduce((sum, output) => sum + output.result.items.length, 0) ?? 0 });
}

const expectedSuccessfulRequests = 1 + (benchmark.execution.runOrder.length - 1)
  * inputs.channels.length * benchmark.execution.queriesPerChannel;
if (plannedSuccessfulRequests !== expectedSuccessfulRequests) {
  throw new Error(`Expected ${expectedSuccessfulRequests} successful requests, found ${plannedSuccessfulRequests}`);
}
const manifest = {
  schemaVersion: 1,
  runId: benchmark.execution.runId,
  stage: "discovery",
  validation: "passed",
  artifactFiles: files.length,
  normalizedRecords,
  plannedSuccessfulRequests: expectedSuccessfulRequests,
  actualExternalRequests: expectedSuccessfulRequests + 2,
  protocolDeviation: {
    systemId: "gemini-full",
    extraRequests: 2,
    reason: "Two API-success responses failed the original exact-channelId parser and were not retained because of an execution-harness logging defect. The same frozen prompt was recovered once after response capture and equivalent-label parsing were fixed.",
    qualityScoringTreatment: "Only the successful third response supplies candidates; extra requests affect resource reporting, not quality score.",
  },
  privacyChecks: { configuredSecretsAbsent: true, emailAddressesAbsent: true, personnelSectionsAbsent: true },
  files: records,
};
const output = path.join(root, "artifacts/runs", benchmark.execution.runId, "manifests/discovery-manifest.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(path.resolve("."), output), ...manifest, files: undefined }, null, 2));
