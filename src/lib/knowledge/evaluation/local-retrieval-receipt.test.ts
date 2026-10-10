import { expect, it } from "vitest";
import { assertDiagnosticSnapshotUnchanged, diagnosticSnapshotHash, localRetrievalDiagnosticIdentity } from "./local-retrieval-receipt";

it("never equates local recall with the frozen four-lane baseline or release acceptance", () => {
  for (const enabled of [false, true]) {
    const receipt = localRetrievalDiagnosticIdentity(enabled);
    expect(receipt.evaluatedProfile.sha256).not.toBe(receipt.frozenReferenceProfile.sha256);
    expect(receipt.evaluatedProfile.weights.qwen).toBe(0);
    expect(receipt).toMatchObject({ fullFrozenBaselineExecuted: false, answerQualityValidated: false,
      preciseCitationValidated: false, releaseGateSatisfied: false });
  }
  expect(localRetrievalDiagnosticIdentity(true).evaluatedProfile.sha256)
    .not.toBe(localRetrievalDiagnosticIdentity(false).evaluatedProfile.sha256);
});
it("refuses mixed Gold, permission, source or release snapshots", () => {
  const initial = { gold: "g1", release: "r1", source: "s1", visibility: "shared" };
  const hash = diagnosticSnapshotHash(initial);
  expect(() => assertDiagnosticSnapshotUnchanged(hash, diagnosticSnapshotHash({ ...initial }))).not.toThrow();
  for (const key of Object.keys(initial)) {
    expect(() => assertDiagnosticSnapshotUnchanged(hash, diagnosticSnapshotHash({ ...initial, [key]: "changed" })))
      .toThrow("inputs changed");
  }
});
