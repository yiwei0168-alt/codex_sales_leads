import { createHash } from "node:crypto";
import { tenantTransaction } from "../../rag/db";
import { stableJson } from "../review-types";
import type { Ma24FrozenManifest, Ma24KnowledgeScope } from "./ma24-independent-comparison";

type CorpusDocument = {
  documentId: string; collectionSlug: Ma24KnowledgeScope; ownerId: string;
  visibility: string; title: string; sourceUrl: string | null;
  authorityLevel: number; language: string; market: string | null;
  companyId: string | null; productId: string | null; metadata: Record<string, unknown>;
  contentSha256: string; currentTreeVersionId: string | null;
  activeReleaseId: string | null; assetId: string | null;
  assetSha256: string | null; assetRegistrationStatus: string | null;
};
type CorpusRelease = { scopeKind: string; ownerId: string | null; releaseId: string };
export type Ma24CorpusAccount = {
  userId: string; knowledgeScope: Ma24KnowledgeScope[];
  documents: CorpusDocument[]; releases: CorpusRelease[];
};
export type Ma24CorpusSnapshot = {
  schema: "ma24-g16-corpus-snapshot-v1";
  accounts: Ma24CorpusAccount[];
};

const accountKey = (userId: string, scopes: Ma24KnowledgeScope[]) =>
  `${userId}:${[...scopes].sort().join(",")}`;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Every manifest account/scope pair must have one inventory, with no extra account. */
export function assertMa24CorpusSnapshotShape(manifest: Ma24FrozenManifest,
  snapshot: Ma24CorpusSnapshot) {
  if (snapshot?.schema !== "ma24-g16-corpus-snapshot-v1" || !Array.isArray(snapshot.accounts))
    throw new Error("Incomplete MA24 corpus snapshot");
  const expected = new Set(manifest.cases.map(item => accountKey(item.userId, item.knowledgeScope)));
  const seen = new Set<string>();
  for (const account of snapshot.accounts) {
    const key = accountKey(account?.userId, account?.knowledgeScope ?? []);
    if (!expected.has(key) || seen.has(key) || !Array.isArray(account.documents) ||
      !Array.isArray(account.releases) ||
      stableJson(account.knowledgeScope) !== stableJson([...account.knowledgeScope].sort()))
      throw new Error("MA24 corpus account or scope mismatch");
    seen.add(key);
    const documentKeys = new Set<string>();
    for (const doc of account.documents) {
      const identity = `${doc.documentId}:${doc.assetId ?? ""}`;
      if (documentKeys.has(identity) || !account.knowledgeScope.includes(doc.collectionSlug) ||
        !/^[0-9a-f]{64}$/.test(doc.contentSha256) ||
        (doc.assetSha256 !== null && !/^[0-9a-f]{64}$/.test(doc.assetSha256)) ||
        (doc.visibility !== "shared" && doc.ownerId !== account.userId))
        throw new Error("Invalid MA24 corpus document inventory");
      documentKeys.add(identity);
    }
  }
  if (seen.size !== expected.size)
    throw new Error("MA24 corpus snapshot lacks a frozen account");
}

/** The frozen file is byte-bound; account data stays outside model inputs. */
export function assertMa24CorpusSnapshotBytes(manifest: Ma24FrozenManifest,
  bytes: Uint8Array, expectedSha256: string): Ma24CorpusSnapshot {
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || hash(bytes) !== expectedSha256)
    throw new Error("MA24 frozen corpus snapshot drift");
  const snapshot = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Ma24CorpusSnapshot;
  assertMa24CorpusSnapshotShape(manifest, snapshot);
  return snapshot;
}

/** Read the full visible active document inventory under the actual tenant RLS. */
export async function readMa24LiveCorpusAccount(userId: string,
  knowledgeScope: Ma24KnowledgeScope[]): Promise<Ma24CorpusAccount> {
  return tenantTransaction(userId, async client => {
    const documents = (await client.query<CorpusDocument>(`
      select d.id as "documentId", c.slug as "collectionSlug", d.owner_id as "ownerId",
        d.visibility, d.title, d.source_url as "sourceUrl", d.authority_level as "authorityLevel",
        d.language, d.market, d.company_id as "companyId", d.product_id as "productId",
        d.metadata, d.content_sha256 as "contentSha256",
        d.current_tree_version_id as "currentTreeVersionId",
        d.active_release_v3_id as "activeReleaseId", a.id as "assetId",
        a.source_sha256 as "assetSha256", a.registration_status as "assetRegistrationStatus"
      from knowledge_document d join knowledge_collection c on c.id=d.collection_id
      left join knowledge_asset a on a.document_id=d.id
      where d.status='active' and c.slug=any($1::text[])
      order by d.id,a.id`, [knowledgeScope])).rows;
    const releases = (await client.query<CorpusRelease>(`
      select scope_kind as "scopeKind", owner_id as "ownerId", release_id as "releaseId"
      from knowledge_release_pointer_v3
      where scope_kind='shared' or (scope_kind='owner' and owner_id=$1)
      order by scope_kind,owner_id`, [userId])).rows;
    return { userId, knowledgeScope: [...knowledgeScope].sort(), documents, releases };
  });
}

/** A changed ACL, document, asset, tree version or release pointer blocks the next model step. */
export async function verifyMa24LiveCorpusAccount(snapshot: Ma24CorpusSnapshot,
  userId: string, knowledgeScope: Ma24KnowledgeScope[]) {
  const expected = snapshot.accounts.find(account =>
    accountKey(account.userId, account.knowledgeScope) === accountKey(userId, knowledgeScope));
  if (!expected) throw new Error("MA24 frozen corpus account absent");
  const live = await readMa24LiveCorpusAccount(userId, knowledgeScope);
  if (stableJson(live) !== stableJson(expected))
    throw new Error("MA24 live corpus or ACL differs from frozen snapshot");
}
