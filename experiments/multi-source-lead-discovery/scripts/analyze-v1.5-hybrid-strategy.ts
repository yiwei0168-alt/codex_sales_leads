import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ScoreRow = {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  systemId: string;
  channelId: string;
  score: number;
  hardValueEligibility: {
    companyExists: boolean;
    germanyPresence: boolean;
    activeNetworking: boolean;
  };
};

type ScoreFile = {
  runId: string;
  scores: ScoreRow[];
};

type SelectedRow = ScoreRow & {
  levels: {
    productUseCaseFit: number;
    cooperationPath: number;
    independentInformationConfidence: number;
  };
  scoreComponents: {
    productUseCaseFit: number;
    cooperationPath: number;
    independentInformationConfidence: number;
    roleIdentificationQuality: number;
    channelClassificationQuality: number;
  };
  supportedRoles: string[];
  providerEvidenceComplete: boolean;
  evaluationBasis: string;
  finalRank: number;
};

type LeaderboardFile = {
  systems: Array<{
    systemId: string;
    channels: Array<{
      channelId: string;
      selected: SelectedRow[];
    }>;
  }>;
};

const root = process.cwd();
const inputPath = path.join(
  root,
  "experiments/multi-source-lead-discovery/artifacts/runs/2026-08-27-de-v1.3/scoring/end-to-end-value-v1.5/all-candidate-scores.v1.5.json",
);
const outputPath = path.join(
  root,
  "experiments/multi-source-lead-discovery/artifacts/runs/2026-08-27-de-v1.3/analysis/hybrid-search-strategy-v1.5.json",
);
const leaderboardPath = path.join(
  root,
  "experiments/multi-source-lead-discovery/artifacts/runs/2026-08-27-de-v1.3/scoring/end-to-end-value-v1.5/leaderboard-end-to-end-value.v1.5.json",
);

const systems = [
  "product-gemini",
  "product-tavily",
  "product-exa",
  "product-brave",
  "product-searchapi",
  "product-google-places-local",
] as const;

const channels = ["tier1-distribution", "b2b-resale", "project-services"] as const;

const benchmarkRequestsPerLane: Record<(typeof systems)[number], number> = {
  "product-gemini": 3,
  "product-tavily": 3,
  "product-exa": 3,
  "product-brave": 3,
  "product-searchapi": 3,
  "product-google-places-local": 8,
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function isEligible(row: ScoreRow): boolean {
  return row.score > 0
    && row.hardValueEligibility.companyExists
    && row.hardValueEligibility.germanyPresence
    && row.hardValueEligibility.activeNetworking;
}

function dedupeBest(rows: ScoreRow[]): ScoreRow[] {
  const best = new Map<string, ScoreRow>();
  for (const row of rows) {
    const current = best.get(row.dossierId);
    if (!current || row.score > current.score) best.set(row.dossierId, row);
  }
  return [...best.values()].sort((left, right) =>
    right.score - left.score || left.companyName.localeCompare(right.companyName),
  );
}

function combinations<T>(values: readonly T[]): T[][] {
  const output: T[][] = [];
  for (let mask = 1; mask < 2 ** values.length; mask += 1) {
    output.push(values.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return output;
}

const parsed = JSON.parse(await readFile(inputPath, "utf8")) as ScoreFile;
const leaderboard = JSON.parse(await readFile(leaderboardPath, "utf8")) as LeaderboardFile;
const eligibleProductRows = parsed.scores.filter(
  (row) => systems.includes(row.systemId as (typeof systems)[number]) && isEligible(row),
);

const channelAnalyses = channels.map((channelId) => {
  const laneRows = eligibleProductRows.filter((row) => row.channelId === channelId);
  const providerSets = new Map<string, Set<string>>();
  for (const systemId of systems) {
    providerSets.set(systemId, new Set(
      laneRows.filter((row) => row.systemId === systemId).map((row) => row.dossierId),
    ));
  }

  const singleProvider = systems.map((systemId) => {
    const selected = dedupeBest(laneRows.filter((row) => row.systemId === systemId)).slice(0, 10);
    const own = providerSets.get(systemId)!;
    const other = new Set(
      systems.filter((otherId) => otherId !== systemId)
        .flatMap((otherId) => [...providerSets.get(otherId)!]),
    );
    const exclusive = [...own].filter((dossierId) => !other.has(dossierId));
    const requestCount = benchmarkRequestsPerLane[systemId];
    const scoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    return {
      systemId,
      eligibleUniqueCandidates: own.size,
      exclusiveEligibleCandidates: exclusive.length,
      selectedCount: selected.length,
      fixedTenSlotScore: round(scoreSum / 10),
      selectedMean: round(selected.length ? scoreSum / selected.length : 0),
      benchmarkDiscoveryRequests: requestCount,
      fixedTenSlotScorePerRequest: round(scoreSum / 10 / requestCount),
    };
  }).sort((left, right) => right.fixedTenSlotScore - left.fixedTenSlotScore);

  const subsetResults = combinations(systems).map((subset) => {
    const selected = dedupeBest(laneRows.filter((row) => subset.includes(row.systemId as (typeof systems)[number]))).slice(0, 10);
    const scoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    const requestCount = subset.reduce((sum, systemId) => sum + benchmarkRequestsPerLane[systemId], 0);
    return {
      systems: subset,
      providerCount: subset.length,
      eligibleUniqueCandidates: dedupeBest(
        laneRows.filter((row) => subset.includes(row.systemId as (typeof systems)[number])),
      ).length,
      selectedCount: selected.length,
      fixedTenSlotScore: round(scoreSum / 10),
      benchmarkDiscoveryRequests: requestCount,
      fixedTenSlotScorePerRequest: round(scoreSum / 10 / requestCount),
    };
  });

  const bestByProviderCount = [...new Set(subsetResults.map((entry) => entry.providerCount))].map((providerCount) =>
    subsetResults.filter((entry) => entry.providerCount === providerCount)
      .sort((left, right) => right.fixedTenSlotScore - left.fixedTenSlotScore
        || left.benchmarkDiscoveryRequests - right.benchmarkDiscoveryRequests)[0],
  );

  const requestEfficiencyFrontier = subsetResults
    .filter((candidate) => !subsetResults.some((other) =>
      other.benchmarkDiscoveryRequests <= candidate.benchmarkDiscoveryRequests
      && other.fixedTenSlotScore >= candidate.fixedTenSlotScore
      && (other.benchmarkDiscoveryRequests < candidate.benchmarkDiscoveryRequests
        || other.fixedTenSlotScore > candidate.fixedTenSlotScore),
    ))
    .sort((left, right) => left.benchmarkDiscoveryRequests - right.benchmarkDiscoveryRequests
      || right.fixedTenSlotScore - left.fixedTenSlotScore);

  const fullUnion = dedupeBest(laneRows).slice(0, 10);
  const topTenContributions = fullUnion.map((row, index) => ({
    rank: index + 1,
    dossierId: row.dossierId,
    companyName: row.companyName,
    score: row.score,
    discoveredBy: systems.filter((systemId) => providerSets.get(systemId)!.has(row.dossierId)),
  }));

  return {
    channelId,
    singleProvider,
    bestByProviderCount,
    requestEfficiencyFrontier,
    fullProductUnion: {
      eligibleUniqueCandidates: dedupeBest(laneRows).length,
      selectedCount: fullUnion.length,
      fixedTenSlotScore: round(fullUnion.reduce((sum, row) => sum + row.score, 0) / 10),
      topTenContributions,
    },
  };
});

const allSelected = leaderboard.systems.flatMap((system) =>
  system.channels.flatMap((channel) =>
    channel.selected.map((row) => ({
      systemId: system.systemId,
      channelId: channel.channelId,
      finalRank: row.finalRank,
      dossierId: row.dossierId,
      companyName: row.companyName,
      officialUrl: row.officialUrl,
      score: row.score,
      levels: row.levels,
      scoreComponents: row.scoreComponents,
      supportedRoles: row.supportedRoles,
      providerEvidenceComplete: row.providerEvidenceComplete,
      evaluationBasis: row.evaluationBasis,
    })),
  ),
);
const lowScoreSelected = allSelected.filter((row) => row.score > 0 && row.score < 50);

const componentMaximums = {
  productUseCaseFit: 44,
  cooperationPath: 32,
  independentInformationConfidence: 20,
  roleIdentificationQuality: 3,
  channelClassificationQuality: 1,
};

const componentKeys = Object.keys(componentMaximums) as Array<keyof typeof componentMaximums>;
const averageComponents = Object.fromEntries(componentKeys.map((key) => [
  key,
  round(lowScoreSelected.reduce((sum, row) => sum + row.scoreComponents[key], 0) / lowScoreSelected.length),
]));
const averagePointLoss = Object.fromEntries(componentKeys.map((key) => [
  key,
  round(componentMaximums[key] - Number(averageComponents[key])),
]));

const groupCounts = (values: string[]) => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
);

const lowScoreAudit = {
  selectionRule: "Rows in leaderboard channel.selected with 0 < score < 50.",
  selectedOccurrences: lowScoreSelected.length,
  uniqueCompanies: new Set(lowScoreSelected.map((row) => row.dossierId)).size,
  meanScore: round(lowScoreSelected.reduce((sum, row) => sum + row.score, 0) / lowScoreSelected.length),
  bySystem: groupCounts(lowScoreSelected.map((row) => row.systemId)),
  byChannel: groupCounts(lowScoreSelected.map((row) => row.channelId)),
  byLevelPattern: groupCounts(lowScoreSelected.map((row) => [
    row.levels.productUseCaseFit,
    row.levels.cooperationPath,
    row.levels.independentInformationConfidence,
  ].join("/"))),
  averageComponents,
  averagePointLoss,
  missingSupportedRolesOccurrences: lowScoreSelected.filter((row) => row.supportedRoles.length === 0).length,
  providerEvidenceCompleteOccurrences: lowScoreSelected.filter((row) => row.providerEvidenceComplete).length,
  scoringBasisComparison: Object.fromEntries([...new Set(allSelected.map((row) => row.evaluationBasis))].sort()
    .map((basis) => {
      const selected = allSelected.filter((row) => row.evaluationBasis === basis);
      return [basis, {
        selectedOccurrences: selected.length,
        lowScoreOccurrences: selected.filter((row) => row.score > 0 && row.score < 50).length,
      }];
    })),
  rows: lowScoreSelected,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  runId: parsed.runId,
  generatedAt: new Date().toISOString(),
  purpose: "Retrospective product-provider union and cost-efficiency analysis for hybrid search design.",
  caveats: [
    "This is an oracle union over the frozen v1.5 candidate pool, not a prospective live mixed-provider run.",
    "Bing is absent because it was not measured in v1.5; its adaptive role must be validated in a separate branch.",
    "Request efficiency uses benchmark request counts and excludes shared evidence-correction, model, and page-fetch costs.",
  ],
  benchmarkRequestsPerLane,
  channels: channelAnalyses,
  lowScoreSelectedAudit: lowScoreAudit,
}, null, 2)}\n`, "utf8");

console.log(`Wrote ${path.relative(root, outputPath)}`);
