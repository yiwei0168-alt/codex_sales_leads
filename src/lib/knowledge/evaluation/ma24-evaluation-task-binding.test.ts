import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modeModelConfig } from "../../assistant/main/mode-config";
const mocks = vi.hoisted(() => ({ tenantTransaction: vi.fn() }));
vi.mock("../../rag/db", () => ({ tenantTransaction: mocks.tenantTransaction }));
import { assertMa24EvaluationTaskBinding, verifyMa24EvaluationTaskBinding } from "./ma24-evaluation-task-binding";
import type { Ma24CorpusSnapshot } from "./ma24-corpus-snapshot";
import type { Ma24G15Preview } from "./ma24-g15-runtime-binding";
import { ma24CaseQuerySha256, ma24ManifestSha256,
  type Ma24FrozenManifest, type Ma24GoldSnapshot,
  type Ma24SourceSetSnapshot } from "./ma24-independent-comparison";

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const leaseToken = "33333333-3333-4333-8333-333333333333";
const caseId = "frozen-industry-question";
const query = "What does the publication report?";
const sourceSet: Ma24SourceSetSnapshot = { schema: "ma24-g16-source-set-v1",
  cases: [{ caseId, query }] };
const sourceSetBytes = new TextEncoder().encode(JSON.stringify(sourceSet));
const gold: Ma24GoldSnapshot = { schema: "ma24-g16-gold-snapshot-v1", cases: [{
  caseId, caseSha256: ma24CaseQuerySha256(query), expectedAnswer: "Synthetic answer",
  expectedSources: [{ assetSha256: "c".repeat(64), unitIndex: 1, excerpt: "Synthetic evidence" }],
  reviewer: "Synthetic reviewer", reviewedAt: "2026-10-15T00:00:00Z", note: "Fixture only",
}] };
const goldBytes = new TextEncoder().encode(JSON.stringify(gold));
const loadedModelConfig = modeModelConfig("standard");
const loadedCodeAndConfig: Ma24G15Preview = { schema: "ma24-g15-config-preview-v1",
  productPromptDateUtc: "2026-10-15", requiredRunPromptDateUtc: "2026-10-15",
  mode: "standard", modePromptVersion: "fixture", modePromptSha256: "prompt",
  productVersion: "fixture", modelProfile: loadedModelConfig.profile,
  modelFunctionsSha256: "functions", arms: [{ knowledgeScope: ["industry"],
    baseline: { prompt: "baseline" }, candidate: { prompt: "candidate" },
    addedTools: ["vectorless_read"] }],
  sourceHashes: { "src/graph.ts": "fixture" },
  sourceClosureMethod: "recursive-local-static-imports-v1", sourceClosureFileCount: 1,
  intendedLocalBgeFlagForBothArms: "flag=1", currentLocalBgeFlagEnabled: false,
  sourceSetFrozen: false, goldFrozen: false, runtimeBuildVerified: false,
  transitiveCodeClosureVerified: false, providerTariffsVerified: false,
  paidCallAuthorizationConfirmed: false, readyForPaidEvaluation: false };
const codeAndConfigBytes = new TextEncoder().encode(JSON.stringify(loadedCodeAndConfig));
const sourceDocument = { documentId: "66666666-6666-4666-8666-666666666666",
  collectionSlug: "industry" as const, ownerId: userId, visibility: "private",
  title: "Synthetic evidence", sourceUrl: null, authorityLevel: 2, language: "en",
  market: null, companyId: null, productId: null, metadata: {}, contentSha256: "a".repeat(64),
  currentTreeVersionId: "77777777-7777-4777-8777-777777777777",
  currentTreeStatus: "ready", currentTreeSourceSha256: "c".repeat(64),
  currentTreeAssetId: "88888888-8888-4888-8888-888888888888",
  activeReleaseId: null, assetId: "88888888-8888-4888-8888-888888888888",
  assetSha256: "c".repeat(64), assetRegistrationStatus: "registered" };
const corpus: Ma24CorpusSnapshot = { schema: "ma24-g16-corpus-snapshot-v2",
  accounts: [{ userId, knowledgeScope: ["industry"], documents: [sourceDocument], releases: [] }],
  permissionProofs: [] };
const corpusSnapshotBytes = new TextEncoder().encode(JSON.stringify(corpus));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v4",
  sourceSetSha256: sha(sourceSetBytes), goldSnapshotSha256: sha(goldBytes),
  codeAndConfigSha256: sha(codeAndConfigBytes),
  corpusSnapshotSha256: sha(corpusSnapshotBytes), requiredImprovementTags: [],
  protectedNoRegressionTags: [], cases: [{ caseId, caseSha256: ma24CaseQuerySha256(query),
    group: "publication", tags: [], expectedOutcome: "route", userId,
    knowledgeScope: ["industry"] }] };
const task = { id: runId, user_id: userId, conversation_id: "55555555-5555-4555-8555-555555555555",
  status: "running" as const,
  lease_token: leaseToken, lease_until: new Date(Date.now() + 600_000),
  execution_kind: "main-agent-evaluation" as const,
  execution_spec: { schema: "ma24-evaluation-run-v1", manifestSha256: ma24ManifestSha256(manifest),
    caseId, arm: "baseline" },
  input: { content: query, requestKey: "evaluation-fixture", attachments: [],
    knowledgeScope: ["industry" as const], mode: "standard" as const },
  model_config: loadedModelConfig };
const conversation = { status: "deleted", message_count: 0, run_count: 1 };
const fixture = { manifest, sourceSetBytes, goldBytes, codeAndConfigBytes, corpusSnapshotBytes,
  loadedCodeAndConfig, nowUtcDate: "2026-10-15",
  task, conversation, runId, leaseToken, caseId,
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
    expect(() => bind({ corpusSnapshotBytes: new TextEncoder().encode("changed corpus") }))
      .toThrow("frozen corpus snapshot drift");
  });
  it("rejects loaded prompt, arm, source and model changes even when the frozen file hash matches", () => {
    for (const change of [
      { modePromptSha256: "changed" },
      { arms: [{ ...loadedCodeAndConfig.arms[0], candidate: { prompt: "changed" } }] },
      { sourceHashes: { "src/graph.ts": "changed" } },
      { modelProfile: { routes: ["other"] } },
    ]) expect(() => bind({ loadedCodeAndConfig: { ...loadedCodeAndConfig, ...change } }))
      .toThrow(/drift/);
    expect(() => bind({ nowUtcDate: "2026-10-16" })).toThrow(/UTC date drift/);
  });
  it("rejects a hash-matching Gold file with a missing reviewed source", () => {
    const invalid = new TextEncoder().encode(JSON.stringify({ ...gold,
      cases: [{ ...gold.cases[0], expectedSources: [] }] }));
    expect(() => bind({ goldBytes: invalid,
      manifest: { ...manifest, goldSnapshotSha256: sha(invalid) } }))
      .toThrow("Invalid MA24 frozen Gold case");
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
  it("rejects a visible, populated or reused evaluation conversation", () => {
    for (const changed of [{ status: "active" }, { message_count: 1 }, { run_count: 2 }])
      expect(() => bind({ conversation: { ...conversation, ...changed } }))
        .toThrow("leased execution");
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
      query: (sql: string, args: string[]) => Promise<{ rows: unknown[] }>;
    }) => Promise<unknown>) => {
      expect(tenant).toBe(userId);
      return callback({ query: async (sql, args) => {
        if (sql.includes("from agent_run where id=$1 and user_id=$2")) {
          expect(args).toEqual([runId, userId]);
          return { rows: [task] };
        }
        if (sql.includes("from assistant_conversation c")) {
          expect(args).toEqual([userId, task.conversation_id]);
          return { rows: [conversation] };
        }
        if (sql.includes("from knowledge_document d")) return { rows: [sourceDocument] };
        expect(sql).toContain("from knowledge_release_pointer_v3");
        return { rows: [] };
      } });
    });
    await expect(verifyMa24EvaluationTaskBinding(fixture)).resolves.toMatchObject({ arm: "baseline", query });
    expect(mocks.tenantTransaction).toHaveBeenCalledTimes(2);
  });
  it("rechecks the owner's private source when a paired account is expected to deny", async () => {
    const ownerId = "44444444-4444-4444-8444-444444444444";
    const deniedCaseId = "paired-permission-deny";
    const source = { documentId: "66666666-6666-4666-8666-666666666666",
      collectionSlug: "industry" as const, ownerId, visibility: "private", title: "Private fixture",
      sourceUrl: null, authorityLevel: 2, language: "en", market: null,
      companyId: null, productId: null, metadata: {}, contentSha256: "a".repeat(64),
      currentTreeVersionId: "77777777-7777-4777-8777-777777777777",
      currentTreeStatus: "ready", currentTreeSourceSha256: "c".repeat(64),
      currentTreeAssetId: "88888888-8888-4888-8888-888888888888",
      activeReleaseId: null, assetId: "88888888-8888-4888-8888-888888888888",
      assetSha256: "c".repeat(64), assetRegistrationStatus: "registered" };
    const pairedSourceSet: Ma24SourceSetSnapshot = { schema: "ma24-g16-source-set-v1",
      cases: [{ caseId, query }, { caseId: deniedCaseId, query }] };
    const pairedGold: Ma24GoldSnapshot = { schema: "ma24-g16-gold-snapshot-v1",
      cases: [gold.cases[0], { caseId: deniedCaseId,
        caseSha256: ma24CaseQuerySha256(query), expectedAnswer: "Access denied",
        expectedSources: [], reviewer: "fixture", reviewedAt: "2026-10-15T00:00:00Z",
        note: "fixture" }] };
    const pairedCorpus: Ma24CorpusSnapshot = { schema: "ma24-g16-corpus-snapshot-v2",
      accounts: [{ userId: ownerId, knowledgeScope: ["industry"], documents: [source],
        releases: [] }, { userId, knowledgeScope: ["industry"], documents: [], releases: [] }],
      permissionProofs: [{ ownerCaseId: caseId, denyCaseId: deniedCaseId,
        targetAssetSha256: source.assetSha256 }] };
    const sourceBytes = new TextEncoder().encode(JSON.stringify(pairedSourceSet));
    const goldBytes = new TextEncoder().encode(JSON.stringify(pairedGold));
    const corpusBytes = new TextEncoder().encode(JSON.stringify(pairedCorpus));
    const pairedManifest: Ma24FrozenManifest = { ...manifest,
      sourceSetSha256: sha(sourceBytes), goldSnapshotSha256: sha(goldBytes),
      corpusSnapshotSha256: sha(corpusBytes), cases: [
        { ...manifest.cases[0], userId: ownerId, tags: ["permission"] },
        { caseId: deniedCaseId, caseSha256: ma24CaseQuerySha256(query),
          group: "security", tags: ["permission"], expectedOutcome: "deny",
          userId, knowledgeScope: ["industry"] },
      ] };
    const deniedTask = { ...task, execution_spec: { ...task.execution_spec,
      caseId: deniedCaseId, manifestSha256: ma24ManifestSha256(pairedManifest) } };
    let ownerDocuments = [source];
    mocks.tenantTransaction.mockImplementation(async (tenant: string, callback: (client: {
      query: (sql: string) => Promise<{ rows: unknown[] }>;
    }) => Promise<unknown>) => callback({ query: async sql => {
      if (sql.includes("from agent_run where")) return { rows: [deniedTask] };
      if (sql.includes("from assistant_conversation")) return { rows: [conversation] };
      if (sql.includes("from knowledge_document d"))
        return { rows: tenant === ownerId ? ownerDocuments : [] };
      return { rows: [] };
    } }));
    const input = { ...fixture, manifest: pairedManifest, sourceSetBytes: sourceBytes,
      goldBytes, corpusSnapshotBytes: corpusBytes, caseId: deniedCaseId };
    await expect(verifyMa24EvaluationTaskBinding(input)).resolves.toMatchObject({
      caseId: deniedCaseId, userId });
    ownerDocuments = [];
    await expect(verifyMa24EvaluationTaskBinding(input))
      .rejects.toThrow(/live corpus or ACL differs/);
  });
});
