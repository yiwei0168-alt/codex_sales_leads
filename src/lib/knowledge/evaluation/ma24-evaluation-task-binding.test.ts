import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modeModelConfig } from "../../assistant/main/mode-config";
const mocks = vi.hoisted(() => ({ tenantTransaction: vi.fn() }));
vi.mock("../../rag/db", () => ({ tenantTransaction: mocks.tenantTransaction }));
import { assertMa24EvaluationTaskBinding, verifyMa24EvaluationTaskBinding } from "./ma24-evaluation-task-binding";
import { ma24CaseQuerySha256, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24SourceSetSnapshot } from "./ma24-independent-comparison";

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const leaseToken = "33333333-3333-4333-8333-333333333333";
const caseId = "frozen-industry-question";
const query = "What does the publication report?";
const sourceSet: Ma24SourceSetSnapshot = { schema: "ma24-g16-source-set-v1",
  cases: [{ caseId, query }] };
const sourceSetBytes = new TextEncoder().encode(JSON.stringify(sourceSet));
const goldBytes = new TextEncoder().encode("synthetic Gold kept outside model input");
const codeAndConfigBytes = new TextEncoder().encode("synthetic code and configuration snapshot");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v2",
  sourceSetSha256: sha(sourceSetBytes), goldSnapshotSha256: sha(goldBytes),
  codeAndConfigSha256: sha(codeAndConfigBytes), requiredImprovementTags: [],
  protectedNoRegressionTags: [], cases: [{ caseId, caseSha256: ma24CaseQuerySha256(query),
    group: "publication", tags: [], expectedOutcome: "route", userId,
    knowledgeScope: ["industry"] }] };
const loadedModelConfig = modeModelConfig("standard");
const task = { id: runId, user_id: userId, status: "running" as const,
  lease_token: leaseToken, lease_until: new Date(Date.now() + 600_000),
  execution_kind: "main-agent-evaluation" as const,
  execution_spec: { schema: "ma24-evaluation-run-v1", manifestSha256: ma24ManifestSha256(manifest),
    caseId, arm: "baseline" },
  input: { content: query, requestKey: "evaluation-fixture", attachments: [],
    knowledgeScope: ["industry" as const], mode: "standard" as const },
  model_config: loadedModelConfig };
const fixture = { manifest, sourceSetBytes, goldBytes, codeAndConfigBytes, task, runId, leaseToken, caseId,
  arm: "baseline" as const, loadedModelConfig };
const bind = (changes: Partial<Parameters<typeof assertMa24EvaluationTaskBinding>[0]> = {}) =>
  assertMa24EvaluationTaskBinding({ ...fixture, ...changes });
afterEach(() => mocks.tenantTransaction.mockReset());

describe("MA24 evaluation task admission binding", () => {
  it("binds a leased task to frozen question bytes, account, arm, scope and loaded model", () => {
    expect(bind()).toEqual({ userId, caseId, arm: "baseline", query, knowledgeScope: ["industry"] });
  });
  it("rejects a changed frozen question or a changed byte snapshot", () => {
    expect(() => bind({ sourceSetBytes: new TextEncoder().encode(JSON.stringify({ ...sourceSet,
      cases: [{ caseId, query: "Changed question" }] })) })).toThrow("frozen source set snapshot drift");
    expect(() => bind({ manifest: { ...manifest, cases: [{ ...manifest.cases[0],
      caseSha256: "0".repeat(64) }] } })).toThrow("frozen question mismatch");
  });
  it("rejects Gold and code/config byte drift before returning a model-facing task", () => {
    expect(() => bind({ goldBytes: new TextEncoder().encode("changed Gold") }))
      .toThrow("frozen Gold snapshot drift");
    expect(() => bind({ codeAndConfigBytes: new TextEncoder().encode("changed config") }))
      .toThrow("frozen code and config snapshot drift");
  });
  it("rejects a different principal, task, lease, status or execution kind", () => {
    for (const changed of [
      { user_id: "44444444-4444-4444-8444-444444444444" },
      { id: "44444444-4444-4444-8444-444444444444" },
      { lease_token: "44444444-4444-4444-8444-444444444444" },
      { lease_until: new Date(Date.now() - 1) },
      { status: "queued" }, { execution_kind: "main-agent" },
    ]) expect(() => bind({ task: { ...task, ...changed } as typeof task })).toThrow("leased execution");
  });
  it("rejects case, arm and manifest drift in the persisted task spec", () => {
    for (const changed of [
      { caseId: "other" }, { arm: "candidate" }, { manifestSha256: "0".repeat(64) },
      { extra: "model-visible" },
    ]) expect(() => bind({ task: { ...task, execution_spec: { ...task.execution_spec,
      ...changed } } })).toThrow("leased execution");
    expect(() => bind({ arm: "candidate" })).toThrow("leased execution");
  });
  it("rejects input drift and foreign conversation context", () => {
    for (const changed of [
      { content: "Changed question" }, { knowledgeScope: ["company"] },
      { attachments: [{ assetId: runId }] }, { mode: "quick" },
      { conversationId: runId }, { extra: "model-visible" },
    ]) expect(() => bind({ task: { ...task, input: { ...task.input,
      ...changed } as typeof task.input } })).toThrow("leased execution");
  });
  it("rejects model configuration drift from the loaded standard profile", () => {
    expect(() => bind({ task: { ...task, model_config: { ...loadedModelConfig,
      model: "unfrozen-model" } } })).toThrow("leased execution");
    expect(() => bind({ loadedModelConfig: { ...loadedModelConfig,
      profile: undefined } })).toThrow("leased execution");
  });
  it("reads only the frozen account's live task row before returning the bound arm", async () => {
    mocks.tenantTransaction.mockImplementation(async (tenant: string, callback: (client: {
      query: (sql: string, args: string[]) => Promise<{ rows: typeof task[] }>;
    }) => Promise<unknown>) => {
      expect(tenant).toBe(userId);
      return callback({ query: async (sql, args) => {
        expect(sql).toContain("from agent_run where id=$1 and user_id=$2");
        expect(args).toEqual([runId, userId]);
        return { rows: [task] };
      } });
    });
    await expect(verifyMa24EvaluationTaskBinding(fixture)).resolves.toMatchObject({ arm: "baseline", query });
    expect(mocks.tenantTransaction).toHaveBeenCalledOnce();
  });
});
