import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalPublicUrl, sanitizeText, type ChannelId } from "../lib/evaluation";

type SystemId = string;

interface BenchmarkConfig {
  protocolVersion: string;
  execution: { runId: string; runOrder: SystemId[] };
}

interface InputsConfig {
  promptVersion: string;
  cudyBrief: string;
  compactRoleRules: string[];
  commonDiscoveryBrief: string;
  channels: Array<{ id: ChannelId; label: string; eligibleRoles: string[] }>;
  primaryEvaluator: Record<string, unknown>;
  downstreamEvaluator: {
    systemPrompt: string;
    taskPrompt: string;
    fixedListEvaluationPrompt: string;
  };
}

interface DiscoveryItem {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
}

interface DiscoveryArtifact {
  systemId: SystemId;
  channelId: ChannelId;
  candidates?: unknown[];
  queryOutputs?: Array<{ result?: { items?: DiscoveryItem[] } }>;
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const [benchmark, inputs] = await Promise.all([
  readJson<BenchmarkConfig>(path.join(root, "config/benchmark.json")),
  readJson<InputsConfig>(path.join(root, "config/inputs.json")),
]);
const runId = benchmark.execution.runId;
const artifactRoot = path.join(root, "artifacts/runs", runId);
const packetRoot = path.join(artifactRoot, "codex-review/packets");
const localRoot = path.join(root, "runs/raw", runId, "codex-review");

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

async function writeJson(filename: string, value: unknown): Promise<string> {
  await mkdir(path.dirname(filename), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filename, content, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

await mkdir(localRoot, { recursive: true });
const saltPath = path.join(localRoot, ".codex-review-salt");
let salt: string;
try {
  salt = (await readFile(saltPath, "utf8")).trim();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  salt = randomBytes(32).toString("hex");
  await writeFile(saltPath, salt, "utf8");
}

const rubric = {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  promptVersion: inputs.promptVersion,
  reviewer: inputs.primaryEvaluator,
  cudyBrief: inputs.cudyBrief,
  commonDiscoveryBrief: inputs.commonDiscoveryBrief,
  compactRoleRules: inputs.compactRoleRules,
  prompts: {
    system: inputs.downstreamEvaluator.systemPrompt,
    discoveryPool: inputs.downstreamEvaluator.taskPrompt,
    fixedOutput: inputs.downstreamEvaluator.fixedListEvaluationPrompt,
  },
  scoreFormula: "productUseCaseFit*9 + cooperationPath*7 + evidenceReliability*4; any failed eligibility gate forces zero",
  reviewerConstraints: [
    "Use only the supplied packet evidence; do not browse or use another batch.",
    "Do not infer quality from company size, traffic, revenue, employees or geographic coverage.",
    "Do not try to identify the search system or provider.",
    "For fixed-output packets preserve all submitted companies and order; failed gates score zero.",
    "For discovery-pool packets merge duplicate evidence, select at most ten unique eligible companies and rank by score.",
    "Every selected company must cite one or more packet evidenceEntryIds.",
  ],
};
await writeJson(path.join(artifactRoot, "codex-review/rubric.json"), rubric);

const manifestEntries: Array<Record<string, unknown>> = [];
const identities: Array<Record<string, unknown>> = [];
for (const systemId of benchmark.execution.runOrder) {
  for (const channel of inputs.channels) {
    const sourcePath = path.join(artifactRoot, "discovery", systemId, `${channel.id}.json`);
    const source = await readJson<DiscoveryArtifact>(sourcePath);
    const blindBatchId = `B-${digest(`${salt}:${systemId}:${channel.id}`).slice(0, 12).toUpperCase()}`;
    const fixedOutput = Array.isArray(source.candidates);
    const reviewMode = fixedOutput ? "fixed-output" : "discovery-pool";
    const entries = fixedOutput
      ? source.candidates!.map((candidate, index) => ({
          evidenceEntryId: `F-${String(index + 1).padStart(2, "0")}`,
          submittedCandidate: candidate,
        }))
      : (source.queryOutputs ?? []).flatMap((output) => output.result?.items ?? []).map((item, index) => ({
          evidenceEntryId: `E-${digest(`${salt}:${systemId}:${channel.id}:${index}`).slice(0, 10).toUpperCase()}`,
          title: sanitizeText(typeof item.title === "string" ? item.title : "").slice(0, 300),
          url: canonicalPublicUrl(item.url),
          snippet: sanitizeText(typeof item.snippet === "string" ? item.snippet : "").slice(0, 1_200),
        })).sort((left, right) => digest(`${salt}:${blindBatchId}:${left.evidenceEntryId}`)
          .localeCompare(digest(`${salt}:${blindBatchId}:${right.evidenceEntryId}`)));
    const packet = {
      schemaVersion: 1,
      protocolVersion: benchmark.protocolVersion,
      blindBatchId,
      reviewMode,
      channel: { id: channel.id, label: channel.label, eligibleRoles: channel.eligibleRoles },
      evidenceEntries: entries,
    };
    const relativePacketPath = `codex-review/packets/${blindBatchId}.json`;
    const sha256 = await writeJson(path.join(artifactRoot, relativePacketPath), packet);
    manifestEntries.push({ blindBatchId, reviewMode, channelId: channel.id, evidenceEntryCount: entries.length, packetSha256: sha256 });
    identities.push({ blindBatchId, systemId, channelId: channel.id, reviewMode, sourcePath: path.relative(root, sourcePath).replaceAll("\\", "/") });
  }
}

manifestEntries.sort((left, right) => String(left.blindBatchId).localeCompare(String(right.blindBatchId)));
await writeJson(path.join(artifactRoot, "codex-review/manifest.json"), {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  runId,
  systemIdentityHidden: true,
  providerIdentityHidden: true,
  apiScoresHidden: true,
  batchCount: manifestEntries.length,
  packets: manifestEntries,
});
await writeJson(path.join(localRoot, "blind-identity-map.local.json"), {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  runId,
  identities,
});

console.log(JSON.stringify({
  runId,
  protocolVersion: benchmark.protocolVersion,
  blindBatchCount: manifestEntries.length,
  identityMapCommitted: false,
  packetDirectory: `experiments/multi-source-lead-discovery/artifacts/runs/${runId}/codex-review/packets`,
}, null, 2));
