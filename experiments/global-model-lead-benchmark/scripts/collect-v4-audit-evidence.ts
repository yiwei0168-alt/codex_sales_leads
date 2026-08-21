import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { TavilySearchProvider, type TavilySearchResult } from "@/providers/tavily";

nextEnv.loadEnvConfig(process.cwd());

type EvidencePacket = {
  protocolVersion: string;
  candidates: Array<{
    blindCandidateId: string;
    companyName: string;
    mergedOfficialWebsiteUrls: string[];
    submissions: Array<{ claimedCategory: string }>;
  }>;
};

type AuditEvidence = {
  blindCandidateId: string;
  companyName: string;
  query: string;
  claimedCategories: string[];
  submittedOfficialWebsiteUrls: string[];
  results: TavilySearchResult[];
  creditsUsed: number;
  error: string | null;
};

const root = path.resolve("experiments/global-model-lead-benchmark");
const working = path.join(root, "reviews", "working");
const packetPath = path.join(working, "evidence-packet.local.json");
const outputPath = path.join(working, "v4-independent-evidence.local.json");
const temporaryPath = `${outputPath}.tmp`;
const packet = JSON.parse(await readFile(packetPath, "utf8")) as EvidencePacket;
if (packet.protocolVersion !== "native-search-four-channel-categories-v4") throw new Error("Expected a v4 evidence packet");

const provider = new TavilySearchProvider({ maxAttempts: 3 });
const evidence = new Map<string, AuditEvidence>();
try {
  const existing = JSON.parse(await readFile(outputPath, "utf8")) as { protocolVersion?: string; candidates?: AuditEvidence[] };
  if (existing.protocolVersion === packet.protocolVersion) {
    for (const item of existing.candidates ?? []) evidence.set(item.blindCandidateId, item);
  }
} catch { /* Start a new resumable evidence collection. */ }

let completedSinceSave = 0;
async function save(): Promise<void> {
  const candidates = packet.candidates.flatMap((candidate) => {
    const item = evidence.get(candidate.blindCandidateId);
    return item ? [item] : [];
  });
  const totalCredits = candidates.reduce((sum, item) => sum + item.creditsUsed, 0);
  const document = {
    schemaVersion: 1,
    protocolVersion: packet.protocolVersion,
    generatedAt: new Date().toISOString(),
    calibrationBasis: "v3_post_rule_reassessment_human_blind_audit",
    providerIdentityHidden: true,
    totalCandidates: packet.candidates.length,
    completedCandidates: candidates.length,
    failedCandidates: candidates.filter((item) => item.error).length,
    totalCredits,
    estimatedCostUsdPayAsYouGo: Number((totalCredits * 0.008).toFixed(4)),
    candidates,
  };
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  completedSinceSave = 0;
}

const pending = packet.candidates.filter((candidate) => !evidence.has(candidate.blindCandidateId));
let nextIndex = 0;
async function worker(): Promise<void> {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= pending.length) return;
    const candidate = pending[index];
    const categories = [...new Set(candidate.submissions.map((item) => item.claimedCategory).filter((item) => item !== "unclear"))];
    const query = `"${candidate.companyName}" Germany Deutschland networking distributor reseller retailer system integrator Cudy official`;
    let item: AuditEvidence;
    try {
      const response = await provider.search({ query, country: "germany", searchDepth: "basic", maxResults: 5 }, AbortSignal.timeout(45_000));
      item = {
        blindCandidateId: candidate.blindCandidateId,
        companyName: candidate.companyName,
        query,
        claimedCategories: categories,
        submittedOfficialWebsiteUrls: candidate.mergedOfficialWebsiteUrls,
        results: response.results,
        creditsUsed: response.creditsUsed,
        error: null,
      };
    } catch (error) {
      item = {
        blindCandidateId: candidate.blindCandidateId,
        companyName: candidate.companyName,
        query,
        claimedCategories: categories,
        submittedOfficialWebsiteUrls: candidate.mergedOfficialWebsiteUrls,
        results: [],
        creditsUsed: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    evidence.set(candidate.blindCandidateId, item);
    completedSinceSave += 1;
    if (completedSinceSave >= 12) await save();
  }
}

await Promise.all(Array.from({ length: Math.min(8, Math.max(1, pending.length)) }, () => worker()));
await save();
const finalItems = [...evidence.values()];
console.log(JSON.stringify({
  totalCandidates: packet.candidates.length,
  searchedCandidates: finalItems.length,
  failedCandidates: finalItems.filter((item) => item.error).length,
  totalCredits: finalItems.reduce((sum, item) => sum + item.creditsUsed, 0),
}, null, 2));
