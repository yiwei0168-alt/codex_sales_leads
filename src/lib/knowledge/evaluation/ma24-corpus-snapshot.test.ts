import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenantTransaction: vi.fn() }));
vi.mock("../../rag/db", () => ({ tenantTransaction: mocks.tenantTransaction }));
import { assertMa24CorpusSnapshotBytes, assertMa24CorpusSnapshotShape,
  verifyMa24LiveCorpusAccount, type Ma24CorpusSnapshot } from "./ma24-corpus-snapshot";
import type { Ma24FrozenManifest } from "./ma24-independent-comparison";

const owner = "11111111-1111-4111-8111-111111111111";
const outsider = "22222222-2222-4222-8222-222222222222";
const document = { documentId: "33333333-3333-4333-8333-333333333333",
  collectionSlug: "industry" as const, ownerId: owner, visibility: "private",
  title: "Synthetic source", sourceUrl: null, authorityLevel: 2, language: "en",
  market: null, companyId: null, productId: null, metadata: {},
  contentSha256: "a".repeat(64), currentTreeVersionId: "44444444-4444-4444-8444-444444444444",
  activeReleaseId: null, assetId: "55555555-5555-4555-8555-555555555555",
  assetSha256: "b".repeat(64), assetRegistrationStatus: "registered" };
const manifest: Ma24FrozenManifest = { schema: "ma24-g16-frozen-comparison-v3",
  sourceSetSha256: "1".repeat(64), goldSnapshotSha256: "2".repeat(64),
  codeAndConfigSha256: "3".repeat(64), corpusSnapshotSha256: "4".repeat(64),
  requiredImprovementTags: [], protectedNoRegressionTags: [], cases: [
    { caseId: "owner", caseSha256: "5".repeat(64), group: "security", tags: [],
      expectedOutcome: "route", userId: owner, knowledgeScope: ["industry"] },
    { caseId: "outsider", caseSha256: "6".repeat(64), group: "security", tags: [],
      expectedOutcome: "deny", userId: outsider, knowledgeScope: ["industry"] },
  ] };
const snapshot: Ma24CorpusSnapshot = { schema: "ma24-g16-corpus-snapshot-v1",
  accounts: [
    { userId: owner, knowledgeScope: ["industry"], documents: [document], releases: [] },
    { userId: outsider, knowledgeScope: ["industry"], documents: [], releases: [] },
  ] };
afterEach(() => mocks.tenantTransaction.mockReset());

describe("MA24 frozen corpus and tenant ACL", () => {
  it("requires one exact account inventory and rejects an outsider's private document", () => {
    expect(() => assertMa24CorpusSnapshotShape(manifest, snapshot)).not.toThrow();
    expect(() => assertMa24CorpusSnapshotShape(manifest,
      { ...snapshot, accounts: [snapshot.accounts[0]] })).toThrow(/lacks a frozen account/);
    expect(() => assertMa24CorpusSnapshotShape(manifest,
      { ...snapshot, accounts: [snapshot.accounts[0], snapshot.accounts[0]] }))
      .toThrow(/account or scope mismatch/);
    expect(() => assertMa24CorpusSnapshotShape(manifest,
      { ...snapshot, accounts: [snapshot.accounts[0],
        { ...snapshot.accounts[1], documents: [document] }] }))
      .toThrow(/document inventory/);
  });
  it("binds the private inventory to its exact bytes", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(assertMa24CorpusSnapshotBytes(manifest, bytes, sha)).toEqual(snapshot);
    expect(() => assertMa24CorpusSnapshotBytes(manifest,
      new TextEncoder().encode(JSON.stringify({ ...snapshot, accounts: [] })), sha))
      .toThrow(/snapshot drift/);
  });
  it("rejects a changed asset or ACL in the live tenant view", async () => {
    let liveDocuments = [document];
    mocks.tenantTransaction.mockImplementation(async (userId: string,
      callback: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      callback({ query: async sql => ({ rows: sql.includes("from knowledge_document d")
        ? (userId === owner ? liveDocuments : []) : [] }) }));
    await expect(verifyMa24LiveCorpusAccount(snapshot, owner, ["industry"]))
      .resolves.toBeUndefined();
    await expect(verifyMa24LiveCorpusAccount(snapshot, outsider, ["industry"]))
      .resolves.toBeUndefined();
    liveDocuments = [{ ...document, assetSha256: "c".repeat(64) }];
    await expect(verifyMa24LiveCorpusAccount(snapshot, owner, ["industry"]))
      .rejects.toThrow(/corpus or ACL differs/);
    liveDocuments = [{ ...document, visibility: "shared" }];
    await expect(verifyMa24LiveCorpusAccount(snapshot, owner, ["industry"]))
      .rejects.toThrow(/corpus or ACL differs/);
  });
});
