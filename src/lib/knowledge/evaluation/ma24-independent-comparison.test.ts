import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertMa24FrozenSnapshotBytes, ma24ManifestSha256, ma24RunSha256, scoreMa24IndependentComparison,
  type Ma24FrozenManifest, type Ma24GoldSnapshot, type Ma24Run, type Ma24Verdict } from "./ma24-independent-comparison";

const manifest: Ma24FrozenManifest = {
  schema: "ma24-g16-frozen-comparison-v1",
  sourceSetSha256: "a".repeat(64), goldSnapshotSha256: "b".repeat(64),
  codeAndConfigSha256: "c".repeat(64),
  requiredImprovementTags: ["long-document", "cross-document", "new-or-revised"],
  protectedNoRegressionTags: ["official-fact", "no-answer", "permission"],
  cases: [
    { caseId: "long", caseSha256: "d".repeat(64), group: "pdf", tags: ["long-document", "official-fact"], expectedOutcome: "route" },
    { caseId: "cross", caseSha256: "e".repeat(64), group: "multi-source", tags: ["cross-document", "permission"], expectedOutcome: "route" },
    { caseId: "new", caseSha256: "f".repeat(64), group: "revision", tags: ["new-or-revised", "no-answer"], expectedOutcome: "no-answer" },
    { caseId: "permission-deny", caseSha256: "2".repeat(64), group: "security", tags: ["permission"], expectedOutcome: "deny" },
  ],
};
const runs: Ma24Run[] = manifest.cases.flatMap(item => (["baseline", "candidate"] as const).map(arm => ({
  caseId: item.caseId, arm, caseSha256: item.caseSha256, manifestSha256: ma24ManifestSha256(manifest),
  status: "completed" as const, answer: `Recorded ${item.caseId} ${arm} answer`,
  citations: item.expectedOutcome === "route" ?
    [{ assetSha256: "1".repeat(64), unitIndex: 1, excerpt: "Original source fact" }] : [],
  receiptIds: [`${item.caseId}-${arm}-receipt`], modelId: "frozen-model",
})));
const gold: Ma24GoldSnapshot = { schema: "ma24-g16-gold-snapshot-v1",
  cases: manifest.cases.map(item => ({ caseId: item.caseId, caseSha256: item.caseSha256,
    expectedAnswer: `Expected ${item.caseId} answer`,
    expectedSources: item.expectedOutcome === "route" ?
      [{ assetSha256: "1".repeat(64), unitIndex: 1, excerpt: "Original source fact" }] : [],
    reviewer: "gold-reviewer", reviewedAt: "2026-10-15T00:00:00Z", note: "Original checked" })) };
const verdicts: Ma24Verdict[] = runs.map(run => ({
  caseId: run.caseId, arm: run.arm, runSha256: ma24RunSha256(run),
  observedOutcome: manifest.cases.find(item => item.caseId === run.caseId)!.expectedOutcome,
  answerCorrect: run.arm === "candidate", preciseCitationCorrect: run.arm === "candidate",
  permissionLeak: false, unapprovedOfficialFact: false,
  reviewer: "reviewer", reviewedAt: "2026-10-15T00:00:00Z", note: "Original checked",
}));
const score = (input: { manifest: Ma24FrozenManifest; runs: Ma24Run[]; verdicts: Ma24Verdict[] }) =>
  scoreMa24IndependentComparison({ ...input, gold });

describe("MA24 independent comparison", () => {
  it("rejects snapshot bytes that differ from the frozen source, Gold or code/config hashes", () => {
    const bytes = { sourceSet: Buffer.from("source"), gold: Buffer.from("gold"),
      codeAndConfig: Buffer.from("config") };
    const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    const bound = { ...manifest, sourceSetSha256: hash(bytes.sourceSet),
      goldSnapshotSha256: hash(bytes.gold), codeAndConfigSha256: hash(bytes.codeAndConfig) };
    expect(() => assertMa24FrozenSnapshotBytes(bound, bytes)).not.toThrow();
    for (const field of ["sourceSet", "gold", "codeAndConfig"] as const) {
      const changed = { ...bytes, [field]: Buffer.from("changed") };
      expect(() => assertMa24FrozenSnapshotBytes(bound, changed)).toThrow(/snapshot drift/);
    }
  });
  it("requires reviewed Gold for every case and all Gold source coordinates for a precise citation verdict", () => {
    expect(() => scoreMa24IndependentComparison({ manifest,
      gold: { ...gold, cases: gold.cases.filter(item => item.caseId !== "cross") }, runs, verdicts }))
      .toThrow("Incomplete MA24 frozen Gold snapshot");
    const secondSource = { assetSha256: "3".repeat(64), unitIndex: 2,
      blockId: "page-2-block-1", excerpt: "Second original" };
    const twoSourceGold: Ma24GoldSnapshot = { ...gold,
      cases: gold.cases.map(item => item.caseId === "cross"
        ? { ...item, expectedSources: [...item.expectedSources, secondSource] } : item) };
    expect(() => scoreMa24IndependentComparison({ manifest, gold: twoSourceGold, runs, verdicts }))
      .toThrow("citation verdict contradicts coordinates cross:candidate");
    const withBoth = runs.map(run => run.caseId === "cross"
      ? { ...run, citations: [...run.citations, secondSource] } : run);
    const reviewed = verdicts.map(row => row.caseId === "cross"
      ? { ...row, runSha256: ma24RunSha256(withBoth.find(run => run.caseId === row.caseId && run.arm === row.arm)!) }
      : row);
    expect(() => scoreMa24IndependentComparison({ manifest, gold: twoSourceGold,
      runs: withBoth, verdicts: reviewed })).not.toThrow();
  });
  it("scores arbitrary frozen case counts and all required improvement groups", () => {
    const result = score({ manifest, runs, verdicts });
    expect(result.complete).toBe(true);
    expect(result.gatePassed).toBe(true);
    expect(result.totals.candidate.answerCorrect).toBe(4);
    expect(result.byGroup.pdf.baseline.total).toBe(1);
    expect(Object.values(result.improvementResults)).toEqual([true, true, true]);
  });
  it("keeps missing and unknown outcomes open", () => {
    const missing = score({ manifest, runs,
      verdicts: verdicts.filter(row => row.caseId !== "new" || row.arm !== "candidate") });
    expect(missing.complete).toBe(false);
    expect(missing.missingVerdicts).toEqual(["new:candidate"]);
    const unknown = runs.map(row => row.caseId === "long" && row.arm === "candidate"
      ? { ...row, status: "unknown" as const, failureReason: "Provider outcome unconfirmed" } : row);
    const reviewed = verdicts.map(row => row.caseId === "long" && row.arm === "candidate"
      ? { ...row, runSha256: ma24RunSha256(unknown.find(item => item.caseId === row.caseId && item.arm === row.arm)!),
        observedOutcome: null, answerCorrect: false, preciseCitationCorrect: false } : row);
    expect(score({ manifest, runs: unknown, verdicts: reviewed }).unknownRuns)
      .toEqual(["long:candidate"]);
  });
  it("does not count a failed baseline as candidate quality improvement", () => {
    const failed = runs.map(row => row.caseId === "long" && row.arm === "baseline"
      ? { ...row, status: "failed" as const, answer: "", failureReason: "Model deadline" } : row);
    const reviewed = verdicts.map(row => row.caseId === "long" && row.arm === "baseline"
      ? { ...row, runSha256: ma24RunSha256(failed.find(item => item.caseId === row.caseId && item.arm === row.arm)!),
        observedOutcome: null, answerCorrect: false, preciseCitationCorrect: false } : row);
    const result = score({ manifest, runs: failed, verdicts: reviewed });
    expect(result.failedRuns).toEqual(["long:baseline"]);
    expect(result.complete).toBe(false);
    expect(result.gatePassed).toBe(false);
  });
  it("rejects changed frozen inputs and changed answers after review", () => {
    expect(() => score({ manifest,
      runs: [{ ...runs[0], manifestSha256: "0".repeat(64) }, ...runs.slice(1)], verdicts }))
      .toThrow("frozen input drift");
    expect(() => score({ manifest,
      runs: [{ ...runs[0], answer: "Edited" }, ...runs.slice(1)], verdicts }))
      .toThrow("answer changed after review");
  });
  it("requires each improvement category and blocks explicit safety violations", () => {
    const noCrossGain = verdicts.map(row => row.caseId === "cross" && row.arm === "candidate"
      ? { ...row, answerCorrect: false, preciseCitationCorrect: false } : row);
    const result = score({ manifest, runs, verdicts: noCrossGain });
    expect(result.complete).toBe(true);
    expect(result.improvementResults["cross-document"]).toBe(false);
    expect(result.gatePassed).toBe(false);
    const leaked = verdicts.map(row => row.caseId === "cross" && row.arm === "candidate"
      ? { ...row, permissionLeak: true } : row);
    expect(score({ manifest, runs, verdicts: leaked }).gatePassed).toBe(false);
    expect(() => score({
      manifest: { ...manifest, requiredImprovementTags: [] }, runs, verdicts,
    })).toThrow("required quality gates missing");
  });
  it("requires honest no-answer labels and an actual denied permission case", () => {
    const mislabeledNoAnswer = { ...manifest, cases: manifest.cases.map(item => item.caseId === "new"
      ? { ...item, expectedOutcome: "route" as const } : item) };
    expect(() => score({ manifest: mislabeledNoAnswer, runs, verdicts }))
      .toThrow("no-answer tag/outcome mismatch");
    const missingNoAnswerTag = { ...manifest, cases: manifest.cases.map(item => item.caseId === "new"
      ? { ...item, tags: ["new-or-revised"] } : item) };
    expect(() => score({ manifest: missingNoAnswerTag, runs, verdicts }))
      .toThrow("no-answer tag/outcome mismatch");
    const authorizedOnly = { ...manifest, cases: manifest.cases.filter(item => item.caseId !== "permission-deny") };
    expect(() => score({ manifest: authorizedOnly, runs: runs.filter(row => row.caseId !== "permission-deny"),
      verdicts: verdicts.filter(row => row.caseId !== "permission-deny") }))
      .toThrow("permission gate lacks a denied-access case");
  });
  it("records the observed behavior and rejects a correct verdict for the wrong outcome", () => {
    const mismatch = verdicts.map(row => row.caseId === "new" && row.arm === "candidate"
      ? { ...row, observedOutcome: "route" as const, answerCorrect: false,
        preciseCitationCorrect: false } : row);
    const result = score({ manifest, runs, verdicts: mismatch });
    expect(result.outcomeMismatches).toEqual([{ caseId: "new", arm: "candidate",
      expectedOutcome: "no-answer", observedOutcome: "route" }]);
    expect(result.gatePassed).toBe(false);
    const incorrectPositive = mismatch.map(row => row.caseId === "new" && row.arm === "candidate"
      ? { ...row, answerCorrect: true } : row);
    expect(() => score({ manifest, runs, verdicts: incorrectPositive }))
      .toThrow("answer verdict contradicts observed outcome");
  });
  it("blocks a candidate outcome mismatch even when its other scores pass", () => {
    const mismatch = verdicts.map(row => row.caseId === "long" && row.arm === "candidate"
      ? { ...row, observedOutcome: "no-answer" as const, answerCorrect: false } : row);
    const result = score({ manifest, runs, verdicts: mismatch });
    expect(result.complete).toBe(true);
    expect(result.overallNonRegression).toBe(true);
    expect(Object.values(result.improvementResults).every(Boolean)).toBe(true);
    expect(result.outcomeMismatches).toHaveLength(1);
    expect(result.gatePassed).toBe(false);
    const baselineMismatch = verdicts.map(row => row.caseId === "new" && row.arm === "baseline"
      ? { ...row, observedOutcome: "route" as const } : row);
    expect(score({ manifest, runs, verdicts: baselineMismatch }).gatePassed)
      .toBe(true);
  });
  it("cannot mark unsupported route citations or non-answer citations precise", () => {
    const missingCitation = runs.map(row => row.caseId === "long" && row.arm === "candidate"
      ? { ...row, citations: [] } : row);
    const reviewed = verdicts.map(row => row.caseId === "long" && row.arm === "candidate"
      ? { ...row, runSha256: ma24RunSha256(missingCitation.find(item => item.caseId === row.caseId && item.arm === row.arm)!) } : row);
    expect(() => score({ manifest, runs: missingCitation, verdicts: reviewed }))
      .toThrow("citation verdict contradicts coordinates");
    const unexpected = runs.map(row => row.caseId === "new" && row.arm === "candidate"
      ? { ...row, citations: [{ assetSha256: "1".repeat(64), unitIndex: 1, excerpt: "Wrong citation" }] } : row);
    const unexpectedReviewed = verdicts.map(row => row.caseId === "new" && row.arm === "candidate"
      ? { ...row, runSha256: ma24RunSha256(unexpected.find(item => item.caseId === row.caseId && item.arm === row.arm)!) } : row);
    expect(() => score({ manifest, runs: unexpected, verdicts: unexpectedReviewed }))
      .toThrow("citation verdict contradicts coordinates");
  });
});
