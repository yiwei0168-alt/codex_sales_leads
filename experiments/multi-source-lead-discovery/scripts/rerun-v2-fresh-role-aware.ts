import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { OWNER_USER_ID } from "../../../src/lib/auth/config";
import type { LeadSearchPlan } from "../../../src/lib/assistant/types";
import type { ChannelRole } from "../../../src/lib/domain";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "../../../src/providers/contracts";
import { leadEvidenceContentHash, isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "../../../src/lib/leads/scoring-policy";
import { retrieveLeadRagContext } from "../../../src/lib/leads/workflow/rag-context";
import { buildLeadMarketPlaybook } from "../../../src/lib/leads/workflow/playbook";
import { LeadEvidenceCorrectionAgent } from "../../../src/lib/leads/workflow/evidence-correction-agent";
import { LeadQualificationAgent } from "../../../src/lib/leads/workflow/qualification-agent";
import { LeadAssessmentReviewAgent } from "../../../src/lib/leads/workflow/assessment-review-agent";
import { LeadHandoffAssembler } from "../../../src/lib/leads/workflow/handoff-assembler";
import type { ChannelRoleFamily, LeadCandidateAssessment, LeadEvidenceItem,
  LeadWorkflowCandidate } from "../../../src/lib/leads/workflow/types";
import type { CorrectedLeadWorkflowCandidate } from "../../../src/lib/leads/workflow/types";
import { DeepSeekProvider } from "../../../src/providers/deepseek";
import { TavilySearchProvider, type TavilySearchResult } from "../../../src/providers/tavily";
import { getPool } from "../../../src/lib/rag/db";

interface OldSelectedCandidate {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  score: number;
  primaryRole?: string | null;
  facts?: { supportedRoles?: string[] };
  channelId?: string;
}

interface OldLeaderboard {
  systems: Array<{ systemId: string; channels: Array<{ selected: OldSelectedCandidate[] }> }>;
}

interface FreshEvidenceSnapshot {
  runId: string;
  capturedAt: string;
  creditsUsed: number;
  candidates: LeadWorkflowCandidate[];
}

interface PriorRepairCostAnalysis {
  acquisition?: { initialTavilyCredits?: number; correctionTavilyCredits?: number };
  modelUsage?: ReturnType<typeof summarizeUsage>;
}

interface ModelUsageRecord {
  task: string;
  model: string;
  promptVersion: string;
  success: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  error?: string;
}

class MeteredAiProvider implements AiProvider {
  readonly id: string;
  readonly records: ModelUsageRecord[] = [];

  constructor(private readonly delegate: AiProvider) {
    this.id = `metered-${delegate.id}`;
  }

  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal)
    : Promise<StructuredAiResponse<TOutput>> {
    const startedAt = performance.now();
    try {
      const response = await this.delegate.execute<TInput, TOutput>(request, signal);
      this.records.push({ task: request.task, model: response.modelVersion,
        promptVersion: request.promptVersion, success: true, latencyMs: response.latencyMs,
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        reasoningTokens: response.usage?.reasoningTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0 });
      return response;
    } catch (error) {
      this.records.push({ task: request.task, model: request.modelVersion,
        promptVersion: request.promptVersion, success: false,
        latencyMs: Math.round(performance.now() - startedAt), promptTokens: 0,
        completionTokens: 0, reasoningTokens: 0, totalTokens: 0,
        error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

function positiveRate(name: string): number | null {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function summarizeUsage(records: ModelUsageRecord[]) {
  const groups = new Map<string, ModelUsageRecord[]>();
  for (const record of records) {
    const key = `${record.task}|${record.model}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const [task, model] = key.split("|");
    const sum = (field: "latencyMs" | "promptTokens" | "completionTokens" | "reasoningTokens" | "totalTokens") =>
      items.reduce((total, item) => total + item[field], 0);
    return { task, model, requests: items.length, successful: items.filter((item) => item.success).length,
      failed: items.filter((item) => !item.success).length,
      promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"),
      reasoningTokens: sum("reasoningTokens"), totalTokens: sum("totalTokens"),
      averageLatencyMs: Math.round(sum("latencyMs") / items.length) };
  }).sort((left, right) => left.task.localeCompare(right.task) || left.model.localeCompare(right.model));
}

const oldRunId = process.argv.find((value) => value.startsWith("--old-run-id="))?.slice(13)
  ?? "2026-08-27-de-v1.3";
const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9)
  ?? `2026-08-30-de-v2-fresh`;
const limitArg = process.argv.find((value) => value.startsWith("--limit="))?.slice(8);
const limit = limitArg ? Math.max(1, Number.parseInt(limitArg, 10)) : Number.POSITIVE_INFINITY;
const prepareOnly = process.argv.includes("--prepare-only");
const resumeSnapshot = process.argv.includes("--resume-snapshot");
const repairOnly = process.argv.includes("--repair-only");
const resumeCorrection = process.argv.includes("--resume-correction");
const retryFailedScoresOnly = process.argv.includes("--retry-failed-scores-only");
const resumeAssessments = process.argv.includes("--resume-assessments");
const modelConcurrency = Math.max(1, Math.min(8, Number.parseInt(
  process.argv.find((value) => value.startsWith("--model-concurrency="))?.slice(20) ?? "8", 10)));
const modelBatchSize = Math.max(1, Math.min(5, Number.parseInt(
  process.argv.find((value) => value.startsWith("--model-batch-size="))?.slice(19) ?? "2", 10)));
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs");
const oldLeaderboardPath = path.join(root, oldRunId,
  "scoring/end-to-end-value-v1.7/leaderboard-primary-channel.v1.7.json");
const baseOutputRoot = path.join(root, runId, "role-aware-v2");
const outputRoot = repairOnly ? path.join(root, runId, "role-aware-v2-repair") : baseOutputRoot;
const priorityPattern = /\b(?:td\s*synnex|also|herweck|ingram\s*micro|wave|ecom)\b/i;
const roles = new Set<ChannelRole>([
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP",
]);

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function domainOf(value: string | null): string {
  if (!value) return "";
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function familyFor(candidateRoles: ChannelRole[]): ChannelRoleFamily {
  if (candidateRoles.some((role) => role === "Distributor" || role === "VAD")) return "distribution";
  if (candidateRoles.some((role) => role === "Retailer" || role === "E-tailer")) return "retail";
  if (candidateRoles.some((role) => role === "SI" || role === "Installer" || role === "MSP")) return "services";
  if (candidateRoles.includes("ISP")) return "isp";
  return "resale";
}

function sameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch { return false; }
}

function freshEvidence(result: TavilySearchResult, candidateDomain: string, sourceQuery: string): LeadEvidenceItem | null {
  const excerpt = (result.rawContent || result.content).replace(/\s+/g, " ").trim().slice(0, 4_000);
  if (!excerpt) return null;
  return {
    id: stableId("evidence", `${result.url}|${leadEvidenceContentHash(excerpt)}`),
    url: result.url,
    title: result.title,
    excerpt,
    sourceType: candidateDomain && sameDomain(result.url, candidateDomain) ? "official-website" : "independent-public",
    provider: `tavily-v2:${sourceQuery}`,
    capturedAt: new Date().toISOString(),
    evidenceRunId: runId,
    contentHash: leadEvidenceContentHash(excerpt),
    freshnessStatus: "fresh",
    priorRunId: oldRunId,
  };
}

const oldLeaderboard = JSON.parse(await readFile(oldLeaderboardPath, "utf8")) as OldLeaderboard;
const oldByDossier = new Map<string, OldSelectedCandidate & { systems: string[] }>();
for (const system of oldLeaderboard.systems) {
  for (const channel of system.channels) {
    for (const candidate of channel.selected) {
      const existing = oldByDossier.get(candidate.dossierId);
      if (!existing) oldByDossier.set(candidate.dossierId, { ...candidate, systems: [system.systemId] });
      else {
        existing.score = Math.max(existing.score, candidate.score);
        existing.systems.push(system.systemId);
      }
    }
  }
}
const seeds = [...oldByDossier.values()].sort((left, right) =>
  Number(priorityPattern.test(right.companyName)) - Number(priorityPattern.test(left.companyName))
  || right.score - left.score || left.companyName.localeCompare(right.companyName)).slice(0, limit);
await mkdir(outputRoot, { recursive: true });
const manifest = {
  schemaVersion: 1,
  runId,
  oldRunId,
  createdAt: new Date().toISOString(),
  policy: { key: ACTIVE_LEAD_SCORING_POLICY.policyKey, version: ACTIVE_LEAD_SCORING_POLICY.version,
    checksum: scoringPolicyChecksum(), snapshot: ACTIVE_LEAD_SCORING_POLICY },
  evidenceRules: {
    oldEvidenceUsage: "discovery-seed-only",
    scoringRequirement: "current runId + fresh/revalidated status + matching content hash + non-discovery source",
    priorEvidencePermittedForScoring: false,
  },
  input: { oldSelectedOccurrences: [...oldByDossier.values()].reduce((sum, item) => sum + item.systems.length, 0),
    uniqueSelectedCompanies: oldByDossier.size, scheduledCompanies: seeds.length,
    userNominatedDeepResearch: seeds.filter((item) => priorityPattern.test(item.companyName)).map((item) => item.companyName) },
  seeds: seeds.map((item) => ({ dossierId: item.dossierId, companyName: item.companyName,
    officialUrl: item.officialUrl, oldScore: item.score, sourceSystems: [...new Set(item.systems)] })),
};
if (!resumeSnapshot) {
  await writeFile(path.join(outputRoot, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
if (prepareOnly) {
  console.log(JSON.stringify({ prepared: true, outputRoot, companies: seeds.length,
    priorityCompanies: manifest.input.userNominatedDeepResearch }, null, 2));
  await getPool().end();
  process.exit(0);
}

let candidates: LeadWorkflowCandidate[];
let acquisitionCredits = 0;
let acquisitionWarnings: string[] = [];
if (resumeSnapshot) {
  const snapshot = JSON.parse(await readFile(path.join(repairOnly ? baseOutputRoot : outputRoot,
    "fresh-evidence-snapshot.json"), "utf8")) as FreshEvidenceSnapshot;
  if (snapshot.runId !== runId) {
    throw new Error(`Snapshot runId ${snapshot.runId} does not match requested runId ${runId}.`);
  }
  candidates = snapshot.candidates;
  acquisitionCredits = repairOnly ? 0 : snapshot.creditsUsed;
  if (repairOnly) {
    let targetIds: Set<string>;
    if (resumeCorrection) {
      const repairCheckpoint = JSON.parse(await readFile(path.join(outputRoot, "corrected-candidates.json"), "utf8")) as {
        candidates: Array<{ candidateId: string }> };
      targetIds = new Set(repairCheckpoint.candidates.map((candidate) => candidate.candidateId));
    } else {
      const priorCorrection = JSON.parse(await readFile(path.join(baseOutputRoot, "corrected-candidates.json"), "utf8")) as {
        candidates: Array<LeadWorkflowCandidate & { correction: { model: string;
          findings: Array<{ notes: string[] }> } }> };
      const priorPrimary = JSON.parse(await readFile(path.join(baseOutputRoot, "primary-assessments.json"), "utf8")) as {
        assessments: Array<{ candidateId: string; scoringStatus: string }> };
      targetIds = new Set([
        ...priorCorrection.candidates.filter((candidate) => candidate.correction.model === "deterministic-fallback"
          || candidate.correction.findings.some((finding) => finding.notes.some((note) =>
            note.includes('claim status "confirmed" was normalized to unknown')))).map((candidate) => candidate.candidateId),
        ...priorPrimary.assessments.filter((assessment) => assessment.scoringStatus === "retry-required")
          .map((assessment) => assessment.candidateId),
      ]);
    }
    candidates = candidates.filter((candidate) => targetIds.has(candidate.candidateId));
    if (candidates.length === 0) throw new Error("Targeted repair found no candidates requiring repair.");
    console.log(JSON.stringify({ stage: "repair-targets-selected", companies: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.candidateId), at: new Date().toISOString() }));
  }
} else {
  const tavily = new TavilySearchProvider({ maxAttempts: 3 });
  const acquisition = new Array<{ candidate: LeadWorkflowCandidate; credits: number; warnings: string[] }>(seeds.length);
  let cursor = 0;
  async function acquireWorker() {
    while (true) {
      const index = cursor++;
      if (index >= seeds.length) return;
      const seed = seeds[index];
      const domain = domainOf(seed.officialUrl);
      const submittedRoles = (seed.facts?.supportedRoles ?? []).filter((role): role is ChannelRole => roles.has(role as ChannelRole));
      const queryRoles = submittedRoles.length > 0 ? submittedRoles : ["Reseller" as const];
      const searchSpecs = [
        { name: "official-current", query: domain
          ? `site:${domain} company products networking router Wi-Fi access point switch customers Germany`
          : `"${seed.companyName}" Germany official company networking products`, domains: domain ? [domain] : undefined },
        { name: "independent-current", query: `"${seed.companyName}" Germany distributor reseller system integrator employees revenue customers networking` },
        ...(priorityPattern.test(seed.companyName) ? [
          { name: "deep-business-unit", query: `"${seed.companyName}" Germany networking business unit vendor portfolio channel partners resellers logistics training` },
          { name: "deep-scale", query: `"${seed.companyName}" Germany annual report revenue employees locations acquisitions` },
        ] : []),
      ];
      const evidence: LeadEvidenceItem[] = [{
        id: stableId("seed", `${oldRunId}|${seed.dossierId}`), url: seed.officialUrl ?? "https://invalid.local/",
        title: `Prior-run discovery seed: ${seed.companyName}`,
        excerpt: `${seed.companyName}; prior official URL hint: ${seed.officialUrl ?? "unknown"}.`,
        sourceType: "discovery", provider: `prior-run:${oldRunId}`, capturedAt: manifest.createdAt,
        evidenceRunId: oldRunId, contentHash: leadEvidenceContentHash(
          `${seed.companyName}; prior official URL hint: ${seed.officialUrl ?? "unknown"}.`),
        freshnessStatus: "stale", priorRunId: oldRunId,
      }];
      let credits = 0;
      const warnings: string[] = [];
      for (const spec of searchSpecs) {
        try {
          const response = await tavily.search({ query: spec.query, searchDepth: "advanced", maxResults: 6,
            includeRawContent: true, includeDomains: spec.domains }, AbortSignal.timeout(60_000));
          credits += response.creditsUsed;
          evidence.push(...response.results.flatMap((result) => {
            const item = freshEvidence(result, domain, spec.name);
            return item ? [item] : [];
          }));
        } catch (error) {
          warnings.push(`${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      acquisition[index] = { candidate: {
        candidateId: stableId("lead", seed.dossierId), evidenceSnapshotRunId: runId,
        companyName: seed.companyName, domain, officialWebsiteUrl: seed.officialUrl ?? `https://${domain}/`,
        queryRoles, queryFamily: familyFor(queryRoles), userNominated: priorityPattern.test(seed.companyName),
        providerScore: 0, evidence: [...new Map(evidence.map((item) => [item.url, item])).values()],
        evidenceWarnings: warnings,
      }, credits, warnings };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, seeds.length) }, acquireWorker));
  candidates = acquisition.map((item) => item.candidate);
  acquisitionCredits = acquisition.reduce((sum, item) => sum + item.credits, 0);
  acquisitionWarnings = acquisition.flatMap((item) => item.warnings);
  await writeFile(path.join(outputRoot, "fresh-evidence-snapshot.json"), `${JSON.stringify({ runId,
    capturedAt: new Date().toISOString(), creditsUsed: acquisitionCredits, candidates }, null, 2)}\n`, "utf8");
}

const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "existing-distributor-growth",
  roles: [...roles], targetCount: candidates.length, queryLanguage: "en",
  userRequest: "Reassess the preserved German v1.7 candidate pool using fresh evidence and role-aware Cudy fit." };
const rag = await retrieveLeadRagContext(OWNER_USER_ID, plan);
const playbook = await buildLeadMarketPlaybook(plan, rag);
const deepSeek = new MeteredAiProvider(new DeepSeekProvider({ maxAttempts: 4 }));
let priorRepairCostAnalysis: PriorRepairCostAnalysis | null = null;
let correctedResult: { candidates: CorrectedLeadWorkflowCandidate[]; creditsUsed: number; warnings: string[] };
if (resumeCorrection) {
  correctedResult = JSON.parse(await readFile(path.join(outputRoot, "corrected-candidates.json"), "utf8"));
  try {
    const priorResult = JSON.parse(await readFile(path.join(outputRoot, "assessment-results.json"), "utf8")) as {
      costAnalysis?: PriorRepairCostAnalysis };
    priorRepairCostAnalysis = priorResult.costAnalysis ?? null;
  } catch {
    priorRepairCostAnalysis = null;
  }
  console.log(JSON.stringify({ stage: "correction-resumed", companies: correctedResult.candidates.length,
    at: new Date().toISOString() }));
} else {
  console.log(JSON.stringify({ stage: "correction-started", companies: candidates.length,
    modelConcurrency, modelBatchSize, at: new Date().toISOString() }));
  correctedResult = await new LeadEvidenceCorrectionAgent(deepSeek, new TavilySearchProvider({ maxAttempts: 3 }),
    { concurrency: modelConcurrency, batchSize: modelBatchSize, searchConcurrency: modelConcurrency })
    .correct(candidates, plan);
  await writeFile(path.join(outputRoot, "corrected-candidates.json"), `${JSON.stringify({ runId,
    generatedAt: new Date().toISOString(), candidates: correctedResult.candidates,
    creditsUsed: correctedResult.creditsUsed, warnings: correctedResult.warnings }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ stage: "correction-completed", companies: correctedResult.candidates.length,
    warnings: correctedResult.warnings.length, at: new Date().toISOString() }));
}
let qualificationCandidates = correctedResult.candidates;
let priorAssessments: LeadCandidateAssessment[] | null = null;
if (retryFailedScoresOnly || resumeAssessments) {
  const priorPrimary = JSON.parse(await readFile(path.join(outputRoot, "primary-assessments.json"), "utf8")) as {
    assessments: LeadCandidateAssessment[] };
  priorAssessments = priorPrimary.assessments;
}
if (retryFailedScoresOnly) {
  const retryIds = new Set((priorAssessments ?? []).filter((item) => item.scoringStatus === "retry-required")
    .map((item) => item.candidateId));
  qualificationCandidates = correctedResult.candidates.filter((item) => retryIds.has(item.candidateId));
  if (qualificationCandidates.length === 0) throw new Error("No retry-required scoring candidates remain.");
}
let assessments: LeadCandidateAssessment[];
if (resumeAssessments && priorAssessments) {
  assessments = priorAssessments;
  console.log(JSON.stringify({ stage: "qualification-resumed", assessments: assessments.length,
    at: new Date().toISOString() }));
} else {
  console.log(JSON.stringify({ stage: "qualification-started", companies: qualificationCandidates.length,
    modelConcurrency, modelBatchSize, at: new Date().toISOString() }));
  const newAssessments = await new LeadQualificationAgent(deepSeek,
    { concurrency: modelConcurrency, batchSize: modelBatchSize }).evaluate(qualificationCandidates, playbook,
    plan.countryCode, plan.countryName, plan.objective);
  const repairedById = new Map(newAssessments.map((item) => [item.candidateId, item]));
  assessments = priorAssessments
    ? priorAssessments.map((item) => repairedById.get(item.candidateId) ?? item) : newAssessments;
}
await writeFile(path.join(outputRoot, "primary-assessments.json"), `${JSON.stringify({ runId,
  generatedAt: new Date().toISOString(), assessments }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ stage: "qualification-completed", assessments: assessments.length,
  retryRequired: assessments.filter((item) => item.scoringStatus === "retry-required").length,
  at: new Date().toISOString() }));
console.log(JSON.stringify({ stage: "review-started", assessments: assessments.length,
  reviewConcurrency: modelConcurrency, at: new Date().toISOString() }));
const reviewed = await new LeadAssessmentReviewAgent(undefined, { concurrency: modelConcurrency })
  .review(correctedResult.candidates, assessments, playbook, plan);
console.log(JSON.stringify({ stage: "review-completed", reviews: reviewed.reviews.length,
  required: reviewed.reviews.filter((item) => item.required).length,
  at: new Date().toISOString() }));
const handoffs = new LeadHandoffAssembler().assemble(correctedResult.candidates, reviewed.assessments,
  reviewed.reviews, runId);
const oldScoreByDossier = new Map(seeds.map((item) => [item.dossierId, item.score]));
const dossierByCandidate = new Map(seeds.map((item) => [stableId("lead", item.dossierId), item.dossierId]));
const comparisons = reviewed.assessments.map((assessment) => {
  const corrected = correctedResult.candidates.find((item) => item.candidateId === assessment.candidateId)!;
  const dossierId = dossierByCandidate.get(assessment.candidateId)!;
  const oldScore = oldScoreByDossier.get(dossierId) ?? null;
  return { dossierId, companyName: corrected.companyName, domain: corrected.domain,
    oldV17Score: oldScore, newV2Score: assessment.totalScore,
    delta: oldScore === null ? null : Number((assessment.totalScore - oldScore).toFixed(2)),
    primaryBusinessRole: assessment.primaryRole, supportedRoles: assessment.roles,
    eligibilityStatus: assessment.eligibilityStatus, researchDepth: assessment.researchDepth,
    companyScaleClass: assessment.companyScaleClass, recommendationPriority: assessment.recommendationPriority,
    accountTier: assessment.accountTier, selectedPathId: assessment.selectedPathId,
    cooperationPaths: assessment.cooperationPaths, confidence: assessment.confidence,
    freshness: { currentScoringEvidence: corrected.evidence.filter((item) =>
      isCurrentLeadScoringEvidence(item, runId)).length,
      priorRunSeedsExcluded: corrected.evidence.filter((item) => item.sourceType === "discovery"
        || item.evidenceRunId !== runId).length },
  };
}).sort((left, right) => right.newV2Score - left.newV2Score || left.companyName.localeCompare(right.companyName));
const citedEvidenceIds = new Set([
  ...correctedResult.candidates.flatMap((candidate) => [
    ...candidate.correction.reliedEvidenceIds,
    ...candidate.correction.findings.flatMap((finding) => finding.evidenceIds),
  ]),
  ...reviewed.assessments.flatMap((assessment) => [
    ...assessment.evidenceIds,
    ...assessment.dimensionRationales.flatMap((rationale) => rationale.evidenceIds),
    ...assessment.cooperationPaths.flatMap((cooperationPath) => cooperationPath.evidenceIds),
  ]),
]);
const currentEvidenceIds = new Set(correctedResult.candidates.flatMap((candidate) => candidate.evidence)
  .filter((item) => isCurrentLeadScoringEvidence(item, runId)).map((item) => item.id));
const rejectedCitedEvidenceIds = [...citedEvidenceIds].filter((id) => !currentEvidenceIds.has(id));
const freshnessAudit = {
  oldEvidenceUsedForScoring: rejectedCitedEvidenceIds.length,
  rejectedCitedEvidenceIds,
  currentScoringEvidence: correctedResult.candidates.flatMap((candidate) => candidate.evidence)
    .filter((item) => isCurrentLeadScoringEvidence(item, runId)).length,
  priorRunSeedsExcluded: correctedResult.candidates.flatMap((candidate) => candidate.evidence)
    .filter((item) => item.sourceType === "discovery" || item.evidenceRunId !== runId).length,
  invalidCurrentEvidenceRejected: correctedResult.candidates.flatMap((candidate) => candidate.evidence)
    .filter((item) => item.sourceType !== "discovery" && !isCurrentLeadScoringEvidence(item, runId)).length,
};
if (freshnessAudit.oldEvidenceUsedForScoring > 0) {
  throw new Error(`Fresh-evidence audit failed: ${freshnessAudit.oldEvidenceUsedForScoring} cited evidence IDs are not valid for ${runId}.`);
}
const priorModelUsage = priorRepairCostAnalysis?.modelUsage ?? [];
const deepSeekUsage = [...priorModelUsage.filter((item) => !item.task.startsWith("lead-review-")),
  ...summarizeUsage(deepSeek.records)];
const reviewUsage = [...priorModelUsage.filter((item) => item.task.startsWith("lead-review-")),
  ...(reviewed.usage ?? []).map((record) => ({ task: `lead-review-${record.phase}`, model: record.model,
  requests: 1, successful: 1, failed: 0, promptTokens: record.usage.inputTokens,
  completionTokens: record.usage.outputTokens, reasoningTokens: record.usage.reasoningTokens,
  totalTokens: record.usage.totalTokens, averageLatencyMs: null }))];
const rates = {
  deepSeekInputUsdPerMillion: positiveRate("DEEPSEEK_INPUT_USD_PER_MILLION"),
  deepSeekOutputUsdPerMillion: positiveRate("DEEPSEEK_OUTPUT_USD_PER_MILLION"),
  reviewInputUsdPerMillion: positiveRate("LEAD_REVIEW_INPUT_USD_PER_MILLION"),
  reviewOutputUsdPerMillion: positiveRate("LEAD_REVIEW_OUTPUT_USD_PER_MILLION"),
};
const deepSeekTotals = deepSeekUsage.reduce((total, item) => ({ input: total.input + item.promptTokens,
  output: total.output + item.completionTokens }), { input: 0, output: 0 });
const reviewTotals = reviewUsage.reduce((total, item) => ({ input: total.input + item.promptTokens,
  output: total.output + item.completionTokens }), { input: 0, output: 0 });
const deepSeekEstimatedUsd = rates.deepSeekInputUsdPerMillion !== null && rates.deepSeekOutputUsdPerMillion !== null
  ? deepSeekTotals.input / 1_000_000 * rates.deepSeekInputUsdPerMillion
    + deepSeekTotals.output / 1_000_000 * rates.deepSeekOutputUsdPerMillion : null;
const reviewEstimatedUsd = rates.reviewInputUsdPerMillion !== null && rates.reviewOutputUsdPerMillion !== null
  ? reviewTotals.input / 1_000_000 * rates.reviewInputUsdPerMillion
    + reviewTotals.output / 1_000_000 * rates.reviewOutputUsdPerMillion : null;
const costAnalysis = {
  acquisition: { initialTavilyCredits: priorRepairCostAnalysis?.acquisition?.initialTavilyCredits ?? acquisitionCredits,
    correctionTavilyCredits: priorRepairCostAnalysis?.acquisition?.correctionTavilyCredits ?? correctedResult.creditsUsed,
    totalTavilyCredits: (priorRepairCostAnalysis?.acquisition?.initialTavilyCredits ?? acquisitionCredits)
      + (priorRepairCostAnalysis?.acquisition?.correctionTavilyCredits ?? correctedResult.creditsUsed) },
  modelUsage: [...deepSeekUsage, ...reviewUsage], rates,
  estimatedUsd: { deepSeek: deepSeekEstimatedUsd, independentReview: reviewEstimatedUsd,
    total: deepSeekEstimatedUsd !== null && reviewEstimatedUsd !== null
      ? deepSeekEstimatedUsd + reviewEstimatedUsd : null,
    status: deepSeekEstimatedUsd !== null && reviewEstimatedUsd !== null
      ? "calculated-from-configured-run-rate-card" : "not-calculated-without-deployed-gateway-rate-card" },
  mainCostDrivers: ["raw evidence characters and duplicated page content", "model retries after timeout or schema failure",
    "per-candidate escalation for ambiguity, conflicts and multi-path decisions", "blind secondary review and disagreement judging"],
  costControls: [
    "Reuse immutable current-run evidence and corrected-candidate checkpoints instead of reacquiring or recorrecting unchanged companies.",
    "Select claim-linked evidence per role and scoring dimension before model calls; do not send unrelated raw pages.",
    "Use token-aware batches with a hard prompt budget instead of a fixed company count.",
    "Keep routine-model scoring and trigger high-capability review only for confirmed ambiguity, conflict, multi-path, boundary or audit cases.",
    "Retry only omitted or invalid candidates, never an otherwise valid whole batch.",
    "Use prompt caching for the stable Cudy rubric, JSON schema and confirmed knowledge baseline where the deployed gateway supports it.",
  ],
};
const result = { schemaVersion: 1, runId, generatedAt: new Date().toISOString(),
  policyVersion: ACTIVE_LEAD_SCORING_POLICY.version, policyChecksum: scoringPolicyChecksum(), freshnessAudit, costAnalysis,
  creditsUsed: acquisitionCredits + correctedResult.creditsUsed,
  comparisons, corrections: correctedResult.candidates.map((candidate) => ({ candidateId: candidate.candidateId,
    correction: candidate.correction })), assessments: reviewed.assessments, reviews: reviewed.reviews, handoffs,
  warnings: [...acquisitionWarnings, ...correctedResult.warnings, ...reviewed.warnings] };
await writeFile(path.join(outputRoot, "assessment-results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
const rows = comparisons.map((item) => `| ${item.companyName.replaceAll("|", "\\|")} | ${item.oldV17Score ?? "—"} | ${item.newV2Score} | ${item.delta ?? "—"} | ${item.primaryBusinessRole} | ${item.companyScaleClass} | ${item.researchDepth} | ${item.accountTier} | ${item.eligibilityStatus} |`);
const usageRows = costAnalysis.modelUsage.map((item) => `| ${item.task} | ${item.model} | ${item.requests} | ${item.successful} | ${item.failed} | ${item.promptTokens} | ${item.completionTokens} | ${item.reasoningTokens} | ${item.totalTokens} | ${item.averageLatencyMs ?? "—"} |`);
await writeFile(path.join(outputRoot, "comparison-report.md"), [
  "# Germany v1.7 → v2 fresh-evidence reassessment", "", `Run: ${runId}`, `Generated: ${result.generatedAt}`,
  "", "## Evidence freshness audit", "", `- Old v1.7 evidence used for scoring: ${freshnessAudit.oldEvidenceUsedForScoring}`,
  `- Current-run scoring evidence: ${freshnessAudit.currentScoringEvidence}`,
  `- Prior-run/discovery seeds excluded: ${freshnessAudit.priorRunSeedsExcluded}`,
  `- Invalid current evidence rejected: ${freshnessAudit.invalidCurrentEvidenceRejected}`, "", "## Comparison", "",
  "| Company | v1.7 | v2 | Δ | Primary role | Scale | Research | Account tier | Eligibility |",
  "|---|---:|---:|---:|---|---|---|---|---|", ...rows, "",
  "## Cost analysis", "", `- Initial Tavily credits: ${costAnalysis.acquisition.initialTavilyCredits}`,
  `- Correction-stage Tavily credits: ${costAnalysis.acquisition.correctionTavilyCredits}`,
  `- Monetary estimate status: ${costAnalysis.estimatedUsd.status}`,
  `- Estimated total USD: ${costAnalysis.estimatedUsd.total ?? "not available without the deployed gateway rate card"}`,
  "", "| Task | Model | Requests | Success | Failed | Input tokens | Output tokens | Reasoning tokens | Total tokens | Avg latency ms |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|", ...usageRows, "",
  "### Main cost drivers", "", ...costAnalysis.mainCostDrivers.map((item) => `- ${item}`), "",
  "### Cost controls", "", ...costAnalysis.costControls.map((item) => `- ${item}`), "",
].join("\n"), "utf8");
console.log(JSON.stringify({ runId, outputRoot, companies: comparisons.length, freshnessAudit,
  priority: comparisons.filter((item) => priorityPattern.test(item.companyName)) }, null, 2));
await getPool().end();
