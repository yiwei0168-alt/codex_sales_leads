import { createHash } from "node:crypto";
import { goldSourceIsPrecise, stableJson, type GoldSourceCoordinate } from "../review-types";

export type Ma24Arm = "baseline" | "candidate";
export type Ma24Outcome = "route" | "clarify" | "no-answer" | "deny";
export type Ma24KnowledgeScope = "industry" | "company" | "product";
export type Ma24Case = {
  caseId: string; caseSha256: string; group: string; tags: string[]; expectedOutcome: Ma24Outcome;
  userId: string; knowledgeScope: Ma24KnowledgeScope[];
};
/** The answer key stays outside this manifest; only its locked hash enters model-run inputs. */
export type Ma24FrozenManifest = {
  schema: "ma24-g16-frozen-comparison-v2";
  sourceSetSha256: string; goldSnapshotSha256: string; codeAndConfigSha256: string;
  requiredImprovementTags: string[]; protectedNoRegressionTags: string[];
  cases: Ma24Case[];
};
/** Kept outside model inputs; the scorer reads it only after both arms finish. */
export type Ma24GoldSnapshot = {
  schema: "ma24-g16-gold-snapshot-v1";
  cases: Array<{ caseId: string; caseSha256: string; expectedAnswer: string;
    expectedSources: GoldSourceCoordinate[]; reviewer: string; reviewedAt: string; note: string }>;
};
/** Questions are frozen separately from Gold for the scorer's input checks. */
export type Ma24SourceSetSnapshot = {
  schema: "ma24-g16-source-set-v1";
  cases: Array<{ caseId: string; query: string }>;
};
export type Ma24Run = {
  caseId: string; arm: Ma24Arm; runId: string; caseSha256: string; manifestSha256: string;
  userId: string; knowledgeScope: Ma24KnowledgeScope[];
  status: "completed" | "failed" | "unknown"; answer: string;
  citations: GoldSourceCoordinate[]; receiptIds: string[]; modelCallIds: string[]; modelId: string;
  failureReason?: string;
};
export type Ma24Verdict = {
  caseId: string; arm: Ma24Arm; runSha256: string;
  observedOutcome: Ma24Outcome | null;
  answerCorrect: boolean; preciseCitationCorrect: boolean;
  permissionLeak: boolean; unapprovedOfficialFact: boolean;
  reviewer: string; reviewedAt: string; note: string;
};

const sha = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const hex64 = (value: string) => /^[0-9a-f]{64}$/.test(value);
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const arms = ["baseline", "candidate"] as const;
const requiredImprovement = ["long-document", "cross-document", "new-or-revised"] as const;
const requiredProtection = ["official-fact", "no-answer", "permission"] as const;
const key = (caseId: string, arm: Ma24Arm) => `${caseId}:${arm}`;
export const ma24ManifestSha256 = (manifest: Ma24FrozenManifest) => sha(manifest);
export const ma24RunSha256 = (run: Ma24Run) => sha(run);
export const ma24CaseQuerySha256 = (query: string) =>
  createHash("sha256").update(query, "utf8").digest("hex");
const hasOnlyKeys = (value: unknown, keys: string[]) =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

/** Bind each manifest case to the actual question text in the frozen source set. */
export function assertMa24SourceSetMatchesManifest(manifest: Ma24FrozenManifest, sourceSet: Ma24SourceSetSnapshot) {
  if (!hasOnlyKeys(sourceSet, ["schema", "cases"]) || sourceSet.schema !== "ma24-g16-source-set-v1" ||
    !Array.isArray(sourceSet.cases) || sourceSet.cases.length !== manifest.cases.length)
    throw new Error("Incomplete MA24 frozen source set");
  const byId = new Map(manifest.cases.map(item => [item.caseId, item]));
  const seen = new Set<string>();
  for (const item of sourceSet.cases) {
    const expected = byId.get(item?.caseId);
    if (!hasOnlyKeys(item, ["caseId", "query"]) || !expected || seen.has(item.caseId) || typeof item.query !== "string" ||
      !item.query.trim() || item.query !== item.query.trim() ||
      ma24CaseQuerySha256(item.query) !== expected.caseSha256)
      throw new Error(`MA24 frozen question mismatch ${item?.caseId ?? "<unknown>"}`);
    seen.add(item.caseId);
  }
}

/** The scoring CLI must bind each claimed snapshot hash to the bytes it actually reads. */
export function assertMa24FrozenSnapshotBytes(manifest: Ma24FrozenManifest, snapshots: {
  sourceSet: Uint8Array; gold: Uint8Array; codeAndConfig: Uint8Array;
}) {
  for (const [name, expected, bytes] of [
    ["source set", manifest.sourceSetSha256, snapshots.sourceSet],
    ["Gold", manifest.goldSnapshotSha256, snapshots.gold],
    ["code and config", manifest.codeAndConfigSha256, snapshots.codeAndConfig],
  ] as const) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) throw new Error(`MA24 frozen ${name} snapshot drift`);
  }
}

function validateManifest(manifest: Ma24FrozenManifest) {
  if (manifest.schema !== "ma24-g16-frozen-comparison-v2" || !manifest.cases.length ||
    ![manifest.sourceSetSha256, manifest.goldSnapshotSha256, manifest.codeAndConfigSha256].every(hex64))
    throw new Error("Incomplete MA24 frozen manifest");
  const ids = new Set<string>();
  for (const item of manifest.cases) {
    if (!item.caseId.trim() || ids.has(item.caseId) || !hex64(item.caseSha256) ||
      !uuid(item.userId) || !Array.isArray(item.knowledgeScope) || !item.knowledgeScope.length ||
      new Set(item.knowledgeScope).size !== item.knowledgeScope.length ||
      item.knowledgeScope.some(scope => !["industry", "company", "product"].includes(scope)) ||
      !item.group.trim() || !["route", "clarify", "no-answer", "deny"].includes(item.expectedOutcome) ||
      new Set(item.tags).size !== item.tags.length || item.tags.some(tag => !tag.trim()))
      throw new Error(`Invalid or duplicate MA24 case ${item.caseId}`);
    if (item.tags.includes("no-answer") !== (item.expectedOutcome === "no-answer"))
      throw new Error(`MA24 no-answer tag/outcome mismatch ${item.caseId}`);
    ids.add(item.caseId);
  }
  for (const tags of [manifest.requiredImprovementTags, manifest.protectedNoRegressionTags]) {
    if (new Set(tags).size !== tags.length || tags.some(tag => !tag.trim() ||
      !manifest.cases.some(item => item.tags.includes(tag))))
      throw new Error("Frozen gate tag has no distinct case coverage");
  }
  if (requiredImprovement.some(tag => !manifest.requiredImprovementTags.includes(tag)) ||
    requiredProtection.some(tag => !manifest.protectedNoRegressionTags.includes(tag)))
    throw new Error("MA24 required quality gates missing from frozen manifest");
  if (!manifest.cases.some(item => item.tags.includes("permission") && item.expectedOutcome === "deny"))
    throw new Error("MA24 permission gate lacks a denied-access case");
}

function validateGold(manifest: Ma24FrozenManifest, gold: Ma24GoldSnapshot) {
  if (gold.schema !== "ma24-g16-gold-snapshot-v1" || gold.cases.length !== manifest.cases.length)
    throw new Error("Incomplete MA24 frozen Gold snapshot");
  const cases = new Map(manifest.cases.map(item => [item.caseId, item]));
  const seen = new Set<string>();
  for (const item of gold.cases) {
    const expected = cases.get(item.caseId);
    if (!expected || seen.has(item.caseId) || item.caseSha256 !== expected.caseSha256 ||
      !item.expectedAnswer.trim() || !item.reviewer.trim() ||
      !Number.isFinite(Date.parse(item.reviewedAt)) || !item.note.trim() ||
      !Array.isArray(item.expectedSources) || item.expectedSources.some(source => !goldSourceIsPrecise(source)) ||
      (expected.expectedOutcome === "route" && !item.expectedSources.length))
      throw new Error(`Invalid MA24 frozen Gold case ${item.caseId}`);
    seen.add(item.caseId);
  }
}

function citationMatchesGold(actual: GoldSourceCoordinate, expected: GoldSourceCoordinate) {
  return actual.assetSha256 === expected.assetSha256 && actual.unitIndex === expected.unitIndex &&
    (expected.row === undefined || actual.row === expected.row) &&
    (expected.version === undefined || actual.version === expected.version) &&
    (expected.blockId === undefined || actual.blockId === expected.blockId);
}

/** Scores reviewed answers only; run receipts and reviewer judgments remain separate inputs. */
export function scoreMa24IndependentComparison(input: {
  manifest: Ma24FrozenManifest; gold: Ma24GoldSnapshot; runs: Ma24Run[]; verdicts: Ma24Verdict[];
}) {
  const { manifest, gold, runs, verdicts } = input;
  validateManifest(manifest);
  validateGold(manifest, gold);
  const manifestHash = ma24ManifestSha256(manifest);
  const cases = new Map(manifest.cases.map(item => [item.caseId, item]));
  const goldCases = new Map(gold.cases.map(item => [item.caseId, item]));
  const runMap = new Map<string, Ma24Run>();
  const runIds = new Set<string>();
  const receiptOwner = new Map<string, string>();
  let answerModelId: string | undefined;
  for (const run of runs) {
    const item = cases.get(run.caseId);
    const id = key(run.caseId, run.arm);
    if (!item || !arms.includes(run.arm) || runMap.has(id) || !uuid(run.runId) || runIds.has(run.runId))
      throw new Error(`Unknown or duplicate MA24 run ${id}`);
    runIds.add(run.runId);
    if (run.caseSha256 !== item.caseSha256 || run.manifestSha256 !== manifestHash)
      throw new Error(`MA24 frozen input drift ${id}`);
    if (run.userId !== item.userId || !Array.isArray(run.knowledgeScope) ||
      run.knowledgeScope.length !== item.knowledgeScope.length ||
      run.knowledgeScope.some((scope, index) => scope !== item.knowledgeScope[index]))
      throw new Error(`MA24 execution context drift ${id}`);
    if (!run.modelId.trim() || !run.receiptIds.length || run.receiptIds.some(receipt => !receipt.trim()) ||
      !Array.isArray(run.modelCallIds) ||
      (run.status === "completed" && !run.modelCallIds.length) ||
      run.modelCallIds.some(callId => !uuid(callId) || !run.receiptIds.includes(callId)) ||
      !["completed", "failed", "unknown"].includes(run.status) ||
      (run.status === "completed" && !run.answer.trim()) ||
      (run.status !== "completed" && (!run.failureReason?.trim() || run.answer !== "" || run.citations.length !== 0)))
      throw new Error(`Incomplete MA24 run receipt ${id}`);
    if (answerModelId !== undefined && run.modelId !== answerModelId)
      throw new Error(`MA24 answer model differs across arms ${id}`);
    answerModelId = run.modelId;
    for (const receipt of run.receiptIds) {
      const prior = receiptOwner.get(receipt);
      if (prior) throw new Error(`MA24 run receipt reused ${receipt}: ${prior}, ${id}`);
      receiptOwner.set(receipt, id);
    }
    runMap.set(id, run);
  }
  const verdictMap = new Map<string, Ma24Verdict>();
  for (const verdict of verdicts) {
    const id = key(verdict.caseId, verdict.arm);
    const run = runMap.get(id);
    if (!run || verdictMap.has(id)) throw new Error(`Unknown or duplicate MA24 verdict ${id}`);
    if (verdict.runSha256 !== ma24RunSha256(run)) throw new Error(`MA24 answer changed after review ${id}`);
    if (!verdict.reviewer.trim() || !Number.isFinite(Date.parse(verdict.reviewedAt)) || !verdict.note.trim() ||
      [verdict.answerCorrect, verdict.preciseCitationCorrect, verdict.permissionLeak,
        verdict.unapprovedOfficialFact].some(value => typeof value !== "boolean"))
      throw new Error(`Incomplete MA24 verdict ${id}`);
    if (run.status === "completed"
      ? !["route", "clarify", "no-answer", "deny"].includes(verdict.observedOutcome as string)
      : verdict.observedOutcome !== null)
      throw new Error(`Invalid MA24 observed outcome ${id}`);
    if (run.status !== "completed" && (verdict.answerCorrect || verdict.preciseCitationCorrect))
      throw new Error(`Failed MA24 run cannot pass review ${id}`);
    if (verdict.answerCorrect && verdict.observedOutcome !== cases.get(verdict.caseId)?.expectedOutcome)
      throw new Error(`MA24 answer verdict contradicts observed outcome ${id}`);
    if (verdict.preciseCitationCorrect && (cases.get(verdict.caseId)?.expectedOutcome !== "route" ||
      !run.citations.length || run.citations.some(source => !goldSourceIsPrecise(source)) ||
      goldCases.get(verdict.caseId)!.expectedSources.some(expected =>
        !run.citations.some(actual => citationMatchesGold(actual, expected)))))
      throw new Error(`MA24 citation verdict contradicts coordinates ${id}`);
    verdictMap.set(id, verdict);
  }
  const missingRuns: string[] = [], missingVerdicts: string[] = [], unknownRuns: string[] = [], failedRuns: string[] = [];
  for (const item of manifest.cases) for (const arm of arms) {
    const id = key(item.caseId, arm);
    const run = runMap.get(id);
    if (!run) missingRuns.push(id);
    else if (run.status === "unknown") unknownRuns.push(id);
    else if (run.status === "failed") failedRuns.push(id);
    if (run && !verdictMap.has(id)) missingVerdicts.push(id);
  }
  const summarize = (selected: Ma24Case[]) => Object.fromEntries(arms.map(arm => {
    const reviewed = selected.flatMap(item => {
      const verdict = verdictMap.get(key(item.caseId, arm));
      return verdict ? [verdict] : [];
    });
    return [arm, { total: selected.length, reviewed: reviewed.length,
      answerCorrect: reviewed.filter(row => row.answerCorrect).length,
      preciseCitationCorrect: reviewed.filter(row => row.preciseCitationCorrect).length }];
  })) as Record<Ma24Arm, { total: number; reviewed: number; answerCorrect: number; preciseCitationCorrect: number }>;
  const totals = summarize(manifest.cases);
  const byGroup = Object.fromEntries([...new Set(manifest.cases.map(item => item.group))].sort().map(group =>
    [group, summarize(manifest.cases.filter(item => item.group === group))]));
  const byTag = Object.fromEntries([...new Set(manifest.cases.flatMap(item => item.tags))].sort().map(tag =>
    [tag, summarize(manifest.cases.filter(item => item.tags.includes(tag)))])) as Record<string, ReturnType<typeof summarize>>;
  const atLeast = (row: ReturnType<typeof summarize>) =>
    row.candidate.answerCorrect >= row.baseline.answerCorrect &&
    row.candidate.preciseCitationCorrect >= row.baseline.preciseCitationCorrect;
  const complete = !missingRuns.length && !missingVerdicts.length && !unknownRuns.length && !failedRuns.length;
  const overallNonRegression = complete && atLeast(totals);
  const protectedResults = Object.fromEntries(manifest.protectedNoRegressionTags.map(tag =>
    [tag, complete && atLeast(byTag[tag])]));
  const improvementResults = Object.fromEntries(manifest.requiredImprovementTags.map(tag => {
    const row = byTag[tag];
    return [tag, complete && atLeast(row) && (row.candidate.answerCorrect > row.baseline.answerCorrect ||
      row.candidate.preciseCitationCorrect > row.baseline.preciseCitationCorrect)];
  }));
  const safetyViolations = verdicts.filter(row => row.permissionLeak || row.unapprovedOfficialFact)
    .map(row => ({ caseId: row.caseId, arm: row.arm,
      permissionLeak: row.permissionLeak, unapprovedOfficialFact: row.unapprovedOfficialFact }));
  const outcomeMismatches = verdicts.filter(row => row.observedOutcome !== null &&
    row.observedOutcome !== cases.get(row.caseId)?.expectedOutcome)
    .map(row => ({ caseId: row.caseId, arm: row.arm,
      expectedOutcome: cases.get(row.caseId)!.expectedOutcome, observedOutcome: row.observedOutcome }));
  const gatePassed = complete && overallNonRegression &&
    Object.values(protectedResults).every(Boolean) && Object.values(improvementResults).every(Boolean) &&
    safetyViolations.length === 0 && !outcomeMismatches.some(row => row.arm === "candidate");
  return { manifestSha256: manifestHash, complete, gatePassed, missingRuns, missingVerdicts, unknownRuns, failedRuns,
    overallNonRegression, protectedResults, improvementResults, safetyViolations, outcomeMismatches,
    totals, byGroup, byTag };
}
