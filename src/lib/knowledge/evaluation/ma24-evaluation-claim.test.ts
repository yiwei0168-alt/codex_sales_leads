import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), runtimeBinding: vi.fn(),
  verifyTaskBinding: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFileSync: () => JSON.stringify({ schema: "ma24-g15-config-preview-v1" }),
}));
vi.mock("../../rag/db", () => ({ query: mocks.query }));
vi.mock("../../assistant/main/repository", () => ({ finishRun: vi.fn() }));
vi.mock("../../assistant/main/mode-config", () => ({ modeModelConfig: vi.fn() }));
vi.mock("./ma24-independent-comparison", () => ({
  assertMa24FrozenSnapshotBytes: vi.fn(),
  assertMa24GoldMatchesManifest: vi.fn(),
  assertMa24SourceSetMatchesManifest: vi.fn(),
}));
vi.mock("./ma24-evaluation-task-binding", () => ({
  verifyMa24EvaluationTaskBinding: mocks.verifyTaskBinding,
}));
vi.mock("./ma24-g15-runtime-binding", () => ({
  assertMa24G15RuntimeBinding: mocks.runtimeBinding,
}));
vi.mock("./ma24-corpus-snapshot", () => ({
  assertMa24CorpusSnapshotBytes: () => ({}),
  assertMa24PermissionGoldControl: vi.fn(),
  assertMa24RouteGoldCorpusAccess: vi.fn(),
  verifyMa24LiveCorpusAccount: vi.fn(),
  verifyMa24LivePermissionControl: vi.fn(),
  verifyMa24LivePermissionGoldEvidence: vi.fn(),
  verifyMa24LiveRouteGoldEvidence: vi.fn(),
}));

import { claimAndBindMa24EvaluationRun } from "./ma24-evaluation-claim";

it("binds a synthetic unready task without treating the binding as model admission", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  const leaseToken = "33333333-3333-4333-8333-333333333333";
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  mocks.runtimeBinding.mockReturnValue({ runtimeBindingMatched: true,
    readyForModelCalls: false, missing: ["Gold not frozen"] });
  mocks.query.mockResolvedValueOnce([{ id: runId, user_id: userId, lease_token: leaseToken }]);
  mocks.verifyTaskBinding.mockResolvedValueOnce({ userId, caseId: "case-1",
    arm: "baseline", query: "Synthetic question", knowledgeScope: ["industry"] });
  await expect(claimAndBindMa24EvaluationRun({
    manifest: { cases: [{ caseId: "case-1", userId }] },
    sourceSetBytes: encode({ cases: [] }), goldBytes: encode({ cases: [] }),
    codeAndConfigBytes: encode({ schema: "ma24-g15-config-preview-v1" }),
    corpusSnapshotBytes: encode({}),
    runId,
    caseId: "case-1", arm: "baseline", workerId: "synthetic-worker",
  } as Parameters<typeof claimAndBindMa24EvaluationRun>[0]))
    .resolves.toMatchObject({ id: runId, userId, lease_token: leaseToken });
  expect(mocks.runtimeBinding).toHaveBeenCalledOnce();
  expect(mocks.query).toHaveBeenCalledOnce();
  expect(mocks.verifyTaskBinding).toHaveBeenCalledOnce();
});
