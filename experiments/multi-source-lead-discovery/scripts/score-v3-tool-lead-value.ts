import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ChannelRole } from "../../../src/lib/domain";
import { isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import { scoringPolicyChecksum, ACTIVE_LEAD_SCORING_POLICY } from "../../../src/lib/leads/scoring-policy";
import { buildModelEvidencePacket } from "../../../src/lib/leads/workflow/evidence-packet";
import type { CorrectedLeadWorkflowCandidate } from "../../../src/lib/leads/workflow/types";
import type { StructuredAiResponse } from "../../../src/providers/contracts";
import { DeepSeekProvider } from "../../../src/providers/deepseek";

const SOURCE_RUN_ID = "2026-08-30-de-v2-tools-full";
const RUN_ID = "2026-08-30-de-v3-tools-frozen-v2";
const PROMPT_VERSION = "tool-lead-value-v3.0-no-paths";
const artifactRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs");
const sourceRoot = path.join(artifactRoot, SOURCE_RUN_ID, "role-aware-v2");
const outputRoot = path.join(artifactRoot, RUN_ID, "role-aware-v3");
const checkpointPath = path.join(outputRoot, "tool-assessment-checkpoint.v3.0.json");
const resultPath = path.join(outputRoot, "tool-company-scores.v3.0.json");

const roleSchema = z.enum(["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer",
  "SI", "Installer", "MSP", "ISP", "Unresolved"]);
const statusSchema = z.enum(["supported", "not-supported", "unknown", "conflicting"]);
const rationale = (max: number) => z.object({ score: z.number().min(0).max(max), reason: z.string().max(360),
  evidenceIds: z.array(z.string()).max(3) });
const assessmentSchema = z.object({
  candidateId: z.string(),
  toolPrimaryRole: roleSchema,
  primaryRoleReason: z.string().max(360),
  gates: z.object({ companyExists: statusSchema, targetCountryPresence: statusSchema,
    networkingRelevant: statusSchema, independentProspect: statusSchema,
    roleAppropriateCustomerReach: statusSchema }),
  dimensions: z.object({
    productFamilyMatch: rationale(25),
    customerAndScenarioOverlap: rationale(15),
    positioningCompatibility: rationale(10),
    buyingInfluence: rationale(15),
    sameRoleScaleAndCoverage: rationale(15),
    executionAndEnablement: rationale(10),
    opportunityAndRisk: rationale(10),
  }),
  eligibilityRecommendation: z.enum(["eligible", "research-required", "ineligible-for-current-task",
    "insufficient-evidence-for-recommendation"]),
  evidenceSufficiency: z.number().min(0).max(100),
  summary: z.string().max(420),
  unknowns: z.array(z.string().max(240)).max(3),
});
const batchSchema = z.object({ assessments: z.array(assessmentSchema) });
type ModelAssessment = z.infer<typeof assessmentSchema>;

interface Usage { requestedModel: string; actualModel: string; promptTokens: number; completionTokens: number;
  reasoningTokens: number; totalTokens: number; latencyMs: number; fallback: boolean }
interface StoredAssessment extends ModelAssessment {
  totalScore: number;
  eligibilityStatus: ModelAssessment["eligibilityRecommendation"];
  evidenceReferenceValid: boolean;
  invalidEvidenceIdsRemoved: string[];
  model: string;
  promptVersion: string;
}
interface Checkpoint { schemaVersion: 1; runId: string; sourceRunId: string; inputFingerprint: string;
  promptVersion: string; updatedAt: string; assessments: StoredAssessment[]; usage: Usage[]; failures: string[] }

const sourceFiles = ["corrected-candidates.json", "assessment-results.json", "run-manifest.json"];
const sourceBuffers = await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceRoot, file))));
const inputFingerprint = createHash("sha256").update(JSON.stringify({ sourceRunId: SOURCE_RUN_ID,
  promptVersion: PROMPT_VERSION, scoringChecksum: scoringPolicyChecksum(),
  files: sourceBuffers.map((buffer, index) => ({ file: sourceFiles[index], sha256: createHash("sha256").update(buffer).digest("hex") }))
})).digest("hex");
const corrected = JSON.parse(sourceBuffers[0].toString("utf8")) as { candidates: CorrectedLeadWorkflowCandidate[] };
if (corrected.candidates.length !== 207) throw new Error(`Expected 207 frozen candidates, received ${corrected.candidates.length}`);

const productBrief = {
  positioning: "Cudy is a value-oriented networking brand spanning consumer/home connectivity, SMB one-stop networking, ISP/FWA/last-mile access, and light industrial connectivity.",
  enabledTracks: {
    homeRetail: "Wi-Fi routers, mesh/repeaters, 4G/5G retail connectivity and adapters/accessories",
    smb: "AP/controller/cloud, PoE/fiber switching, gateway/VPN and outdoor/FWA backup",
    ispFwa: "xPON/ONT, 4G/5G FWA, ISP routers/EasyMesh and outdoor/fiber access",
    industrial: "industrial 4G/5G routing, industrial switching and outdoor PoE/fiber",
  },
  marketPosition: "Strong value-for-money and practical feature coverage below premium enterprise pricing; do not require premium-enterprise-only specifications.",
  competitors: ["TP-Link/Omada", "Mercusys", "Tenda", "D-Link", "Netgear", "Ubiquiti",
    "MikroTik", "AVM", "DrayTek"],
};

function candidatePayload(candidate: CorrectedLeadWorkflowCandidate) {
  const currentEvidence = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
  const evidenceIds = new Set(currentEvidence.map((item) => item.id));
  const findings = candidate.correction.findings.flatMap((finding) => {
    const validIds = finding.evidenceIds.filter((id) => evidenceIds.has(id));
    return validIds.length > 0 ? [{ ...finding, evidenceIds: validIds }] : [];
  });
  const packet = buildModelEvidencePacket(candidate, { requiredEvidenceIds: findings.flatMap((item) => item.evidenceIds),
    maxUnlinkedItems: 2, maxExcerptCharacters: 900,
    relevanceText: findings.map((item) => item.statement).join(" ") });
  return { candidateId: candidate.candidateId, companyName: candidate.companyName, domain: candidate.domain,
    supportedRoles: candidate.correction.resolvedRoles, correctedPrimaryRole: candidate.correction.primaryRole,
    correctionReason: candidate.correction.primaryChannelReason, findings,
    evidence: packet.map((item) => ({ evidenceId: item.evidenceId, sourceType: item.sourceType,
      title: item.title, url: item.url, excerpt: item.excerpt })) };
}

const instructions = [
  "Evaluate search-result lead value for Cudy in Germany. This is a tool benchmark, not a development plan.",
  "Use only supplied frozen v2 evidence. Do not request, suggest or infer any new search, citation, website content or company fact.",
  "Do not generate cooperation paths, supply-route recommendations, outreach strategy, contacts, emails, CTAs or next actions.",
  "Ignore discovery provider, original search lane, rank and previous score.",
  "Choose exactly one toolPrimaryRole. For a corrected Hybrid company choose the single role that best represents the evidenced business relevant to this benchmark; do not use a cooperation path as a tie-breaker.",
  "Product/use-case fit is 50 points: best enabled product family 25, role-appropriate customer/scenario overlap 15, Cudy positioning compatibility 10. Never average all product tracks and never penalize a focused SMB specialist merely for specialization.",
  "Buying influence is 15 points and measures evidenced procurement/category/specification influence for the chosen role without proposing a route to market.",
  "Scale/coverage is 15 points and must be role-relative: compare distributors with distributors, retailers/e-tailers with consumer sellers, SI/MSP/installers with project-service peers, and ISPs with operators. Broadline complexity is not a penalty; score the relevant networking business and reach.",
  "Execution/enablement is 10 and opportunity/risk is 10. Competitor sales normally prove category capability; penalize only evidenced exclusivity, own-brand structural conflict or lack of entry space.",
  "Role-specific customers differ: distribution serves downstream channel partners; SI/MSP/installer serves B2B project customers; retail/e-tail serves consumers/SOHO; ISP serves subscribers and mass-deployment use cases.",
  "Missing evidence is unknown, not zero and not a negative fact. A sparse web footprint does not prove small scale.",
  "Each dimension must have one short rationale and up to three supplied evidence IDs. Evidence sufficiency has no score weight.",
  "Recommend ineligible only for a supported hard blocker. Use research-required or insufficient-evidence when the frozen packet cannot resolve a material fact.",
];

const provider = new DeepSeekProvider({ maxAttempts: 2 });
if (!provider.isConfigured()) throw new Error("DEEPSEEK_API_KEY is required");
await mkdir(outputRoot, { recursive: true });

const checkpoint: Checkpoint = await readFile(checkpointPath, "utf8").then((value) => JSON.parse(value) as Checkpoint)
  .catch(() => ({ schemaVersion: 1, runId: RUN_ID, sourceRunId: SOURCE_RUN_ID, inputFingerprint,
    promptVersion: PROMPT_VERSION, updatedAt: new Date().toISOString(), assessments: [], usage: [], failures: [] }));
if (checkpoint.inputFingerprint !== inputFingerprint || checkpoint.promptVersion !== PROMPT_VERSION) {
  throw new Error("Existing v3 checkpoint does not match the frozen inputs or prompt version");
}
const completed = new Map(checkpoint.assessments.map((item) => [item.candidateId, item]));
let persistQueue = Promise.resolve();
function persistCheckpoint() {
  checkpoint.assessments = [...completed.values()];
  checkpoint.updatedAt = new Date().toISOString();
  const snapshot = JSON.stringify(checkpoint, null, 2) + "\n";
  persistQueue = persistQueue.then(() => writeFile(checkpointPath, snapshot, "utf8"));
  return persistQueue;
}

function normalize(raw: ModelAssessment, candidate: CorrectedLeadWorkflowCandidate,
  response: StructuredAiResponse<unknown>): StoredAssessment {
  const allowedEvidenceIds = new Set(candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).map((item) => item.id));
  const supportedRoles = new Set<ChannelRole>(candidate.correction.resolvedRoles);
  let role = raw.toolPrimaryRole;
  if (candidate.correction.primaryRole !== "Hybrid" && candidate.correction.primaryRole !== "Unresolved") {
    role = candidate.correction.primaryRole;
  } else if (role !== "Unresolved" && !supportedRoles.has(role)) {
    role = candidate.correction.resolvedRoles[0] ?? "Unresolved";
  }
  const invalidEvidenceIdsRemoved: string[] = [];
  const dimensions = Object.fromEntries(Object.entries(raw.dimensions).map(([key, value]) => {
    const evidenceIds = value.evidenceIds.filter((id) => {
      const valid = allowedEvidenceIds.has(id);
      if (!valid) invalidEvidenceIdsRemoved.push(id);
      return valid;
    });
    return [key, { ...value, score: Math.round(value.score), evidenceIds }];
  })) as ModelAssessment["dimensions"];
  const totalScore = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const hardBlocker = [raw.gates.companyExists, raw.gates.targetCountryPresence,
    raw.gates.networkingRelevant, raw.gates.independentProspect].includes("not-supported");
  const criticalUnknown = [raw.gates.companyExists, raw.gates.targetCountryPresence,
    raw.gates.networkingRelevant].some((item) => item === "unknown" || item === "conflicting");
  const eligibilityStatus = hardBlocker ? "ineligible-for-current-task" as const
    : criticalUnknown || role === "Unresolved" ? "research-required" as const
      : raw.eligibilityRecommendation === "ineligible-for-current-task" ? "research-required" as const
        : raw.eligibilityRecommendation;
  return { ...raw, toolPrimaryRole: role, dimensions, totalScore, eligibilityStatus,
    evidenceReferenceValid: invalidEvidenceIdsRemoved.length === 0,
    invalidEvidenceIdsRemoved: [...new Set(invalidEvidenceIdsRemoved)], model: response.modelVersion,
    promptVersion: PROMPT_VERSION };
}

function usageOf(response: StructuredAiResponse<unknown>, requestedModel: string, fallback: boolean): Usage {
  return { requestedModel, actualModel: response.modelVersion, promptTokens: response.usage?.promptTokens ?? 0,
    completionTokens: response.usage?.completionTokens ?? 0, reasoningTokens: response.usage?.reasoningTokens ?? 0,
    totalTokens: response.usage?.totalTokens ?? 0, latencyMs: response.latencyMs, fallback };
}

async function invoke(candidates: CorrectedLeadWorkflowCandidate[], model: string, fallback: boolean) {
  const payloads = candidates.map(candidatePayload);
  const response = await provider.execute({ task: "lead-qualification", modelVersion: model,
    promptVersion: PROMPT_VERSION, input: { instructions, market: { country: "Germany",
      benchmarkObjective: "search-result lead value under Cudy product-market fit" }, productBrief,
      roleScorecards: ACTIVE_LEAD_SCORING_POLICY.roleScorecards,
      scoringWeights: ACTIVE_LEAD_SCORING_POLICY.weights, candidates: payloads },
    evidenceIds: payloads.flatMap((candidate) => candidate.evidence.map((item) => item.evidenceId)),
    outputSchema: z.toJSONSchema(batchSchema) as Record<string, unknown>, dataClassification: "private-workspace" },
  AbortSignal.timeout(model.includes("pro") ? 150_000 : 90_000));
  checkpoint.usage.push(usageOf(response, model, fallback));
  const parsed = batchSchema.parse(response.output);
  const byId = new Map(parsed.assessments.map((item) => [item.candidateId, item]));
  if (byId.size !== candidates.length) throw new Error(`Model returned ${byId.size}/${candidates.length} assessments`);
  return candidates.map((candidate) => {
    const assessment = byId.get(candidate.candidateId);
    if (!assessment) throw new Error(`Model omitted ${candidate.candidateId}`);
    return normalize(assessment, candidate, response);
  });
}

async function evaluateBatch(candidates: CorrectedLeadWorkflowCandidate[]) {
  try {
    return await invoke(candidates, "deepseek-v4-flash", false);
  } catch (batchError) {
    const results: StoredAssessment[] = [];
    for (const candidate of candidates) {
      try {
        results.push(...await invoke([candidate], "deepseek-v4-flash", true));
      } catch (retryError) {
        try {
          results.push(...await invoke([candidate], "deepseek-v4-pro", true));
        } catch (proError) {
          checkpoint.failures.push(`${candidate.candidateId}: batch=${String(batchError)}; retry=${String(retryError)}; pro=${String(proError)}`);
        }
      }
    }
    return results;
  }
}

const pending = corrected.candidates.filter((candidate) => !completed.has(candidate.candidateId));
const batches: CorrectedLeadWorkflowCandidate[][] = [];
let batch: CorrectedLeadWorkflowCandidate[] = [];
for (const candidate of pending) {
  const proposed = [...batch, candidate];
  const inputCharacters = JSON.stringify(proposed.map(candidatePayload)).length;
  if (batch.length > 0 && (proposed.length > 3 || inputCharacters > 38_000)) {
    batches.push(batch);
    batch = [candidate];
  } else batch = proposed;
}
if (batch.length > 0) batches.push(batch);

let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= batches.length) return;
    const results = await evaluateBatch(batches[index]);
    for (const assessment of results) completed.set(assessment.candidateId, assessment);
    await persistCheckpoint();
    console.log(JSON.stringify({ event: "batch-completed", batch: index + 1, batches: batches.length,
      completed: completed.size, total: corrected.candidates.length, failures: checkpoint.failures.length }));
  }
}
await Promise.all(Array.from({ length: Math.min(8, Math.max(1, batches.length)) }, worker));
await persistCheckpoint();
if (completed.size !== corrected.candidates.length) {
  throw new Error(`v3 scoring incomplete: ${completed.size}/${corrected.candidates.length}; see checkpoint failures`);
}
const result = { schemaVersion: 1, runId: RUN_ID, sourceRunId: SOURCE_RUN_ID,
  method: "v3-role-aware-tool-lead-value-on-frozen-v2-evidence", generatedAt: new Date().toISOString(),
  restrictions: { newSearchCalls: 0, newEvidenceItems: 0, cooperationPathsGenerated: 0,
    developmentStrategiesGenerated: 0, outreachEmailsGenerated: 0 },
  policy: { key: ACTIVE_LEAD_SCORING_POLICY.policyKey, version: "3.0-tool-evaluation",
    checksum: scoringPolicyChecksum(), promptVersion: PROMPT_VERSION,
    weights: ACTIVE_LEAD_SCORING_POLICY.weights },
  inputFingerprint, inputFiles: sourceFiles, candidates: [...completed.values()], usage: checkpoint.usage,
  failures: checkpoint.failures };
await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ runId: RUN_ID, resultPath, candidates: completed.size,
  requests: checkpoint.usage.length, tokens: checkpoint.usage.reduce((sum, item) => sum + item.totalTokens, 0),
  restrictions: result.restrictions }, null, 2));
