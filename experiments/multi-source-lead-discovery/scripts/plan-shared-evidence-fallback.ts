import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SharedEvidenceDossier } from "../lib/evidence-dossier";

interface CollectionRecord {
  dossierId: string;
  officialPagesAttempted: number;
  officialPagesCollected: number;
  fallbackSourcesCollected: number;
}

interface MasterArtifact {
  schemaVersion: 1;
  policyVersion: string;
  runId: string;
  companies: SharedEvidenceDossier[];
  collectionResults: CollectionRecord[];
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function missingClaims(company: SharedEvidenceDossier): string[] {
  const missing = [];
  if (!company.claimCoverage.identity) missing.push("identity");
  if (!company.claimCoverage.germanyPresence) missing.push("germany-presence");
  if (!company.claimCoverage.activeNetworking) missing.push("active-networking");
  for (const lane of company.requestedLanes) {
    if (!company.claimCoverage.laneMembership[lane].demonstrated) missing.push(`lane:${lane}`);
    if (company.claimCoverage.cooperationPathCaps[lane] < 3) missing.push(`cooperation-path:${lane}`);
  }
  return missing;
}

function priority(company: SharedEvidenceDossier, result: CollectionRecord): { tier: 1 | 2 | 3; reason: string } {
  if (!company.canonicalOfficialUrl) return { tier: 1, reason: "No canonical official URL was available for direct collection." };
  if (result.officialPagesCollected === 0) return { tier: 1, reason: "All attempted official-page retrievals failed." };
  if (result.officialPagesCollected < result.officialPagesAttempted) {
    return { tier: 1, reason: "At least one official target failed and is eligible for extraction fallback." };
  }
  if (company.enrichmentStatus === "seeded-needs-enrichment") {
    return { tier: 2, reason: "Direct pages were collected but did not establish a recognized identity, networking, or requested-lane claim." };
  }
  return { tier: 3, reason: "Direct evidence supports some claims; defer paid expansion until higher-priority gaps are tested." };
}

const runId = argument("run-id") ?? "2026-08-26-de-v1";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId, "evidence");
const masterPath = path.join(root, "shared-evidence-dossiers.v1.json");
const outputPath = path.join(root, "shared-evidence-fallback-queue.json");
const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterArtifact;
const resultsById = new Map(master.collectionResults.map((result) => [result.dossierId, result]));
const queue = master.companies.flatMap((company) => {
  if (company.enrichmentStatus === "ready-for-rescoring" || company.enrichmentStatus === "identity-conflict") return [];
  const result = resultsById.get(company.dossierId);
  if (!result) throw new Error(`Missing collection result for ${company.dossierId}`);
  const classification = priority(company, result);
  return [{
    dossierId: company.dossierId,
    canonicalName: company.canonicalName,
    canonicalOfficialUrl: company.canonicalOfficialUrl,
    requestedLanes: company.requestedLanes,
    enrichmentStatus: company.enrichmentStatus,
    tier: classification.tier,
    reason: classification.reason,
    officialPagesAttempted: result.officialPagesAttempted,
    officialPagesCollected: result.officialPagesCollected,
    fallbackSourcesAlreadyCollected: result.fallbackSourcesCollected,
    actionable: result.fallbackSourcesCollected < company.retrievalPlan.fallbackSourceBudget,
    missingClaims: missingClaims(company),
  }];
}).sort((left, right) => left.tier - right.tier || left.canonicalName.localeCompare(right.canonicalName));

const output = {
  schemaVersion: 1,
  policyVersion: master.policyVersion,
  runId: master.runId,
  generatedAt: new Date().toISOString(),
  policy: {
    tier1: "Run first: missing official URL, zero successful direct pages, or a failed official target.",
    tier2: "Run only after reviewing tier 1 yield: direct pages succeeded but no recognized core claim was established.",
    tier3: "Defer by default: some claims are supported and direct retrieval completed; paid expansion has lower expected marginal value.",
  },
  summary: {
    totalNotReady: queue.length,
    tier1: queue.filter((item) => item.tier === 1).length,
    tier2: queue.filter((item) => item.tier === 2).length,
    tier3: queue.filter((item) => item.tier === 3).length,
    actionable: queue.filter((item) => item.actionable).length,
    tier1Actionable: queue.filter((item) => item.tier === 1 && item.actionable).length,
  },
  queue,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), ...output.summary }, null, 2));
