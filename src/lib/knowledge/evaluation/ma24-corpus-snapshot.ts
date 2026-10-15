import { createHash } from "node:crypto";
import { tenantTransaction } from "../../rag/db";
import { stableJson } from "../review-types";
import type { Ma24FrozenManifest, Ma24GoldSnapshot, Ma24KnowledgeScope } from "./ma24-independent-comparison";

type CorpusDocument = {
  documentId: string; collectionSlug: Ma24KnowledgeScope; ownerId: string;
  visibility: string; title: string; sourceUrl: string | null;
  authorityLevel: number; language: string; market: string | null;
  companyId: string | null; productId: string | null; metadata: Record<string, unknown>;
  contentSha256: string; currentTreeVersionId: string | null;
  currentTreeStatus: string | null; currentTreeSourceSha256: string | null;
  currentTreeAssetId: string | null;
  activeReleaseId: string | null; assetId: string | null;
  assetSha256: string | null; assetRegistrationStatus: string | null;
};
type CorpusRelease = { scopeKind: string; ownerId: string | null; releaseId: string };
export type Ma24CorpusAccount = {
  userId: string; knowledgeScope: Ma24KnowledgeScope[];
  documents: CorpusDocument[]; releases: CorpusRelease[];
};
export type Ma24CorpusSnapshot = {
  schema: "ma24-g16-corpus-snapshot-v2";
  accounts: Ma24CorpusAccount[];
  permissionProofs: Array<{ denyCaseId: string; ownerCaseId: string; targetAssetSha256: string }>;
};

const accountKey = (userId: string, scopes: Ma24KnowledgeScope[]) =>
  `${userId}:${[...scopes].sort().join(",")}`;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Every manifest account/scope pair must have one inventory, with no extra account. */
export function assertMa24CorpusSnapshotShape(manifest: Ma24FrozenManifest,
  snapshot: Ma24CorpusSnapshot) {
  if (snapshot?.schema !== "ma24-g16-corpus-snapshot-v2" || !Array.isArray(snapshot.accounts) ||
    !Array.isArray(snapshot.permissionProofs))
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
  const cases = new Map(manifest.cases.map(item => [item.caseId, item]));
  const denyCases = manifest.cases.filter(item => item.expectedOutcome === "deny" &&
    item.tags.includes("permission"));
  const proved = new Set<string>();
  for (const proof of snapshot.permissionProofs) {
    const denied = cases.get(proof.denyCaseId);
    const owner = cases.get(proof.ownerCaseId);
    const ownerAccount = snapshot.accounts.find(account => owner &&
      accountKey(account.userId, account.knowledgeScope) ===
      accountKey(owner.userId, owner.knowledgeScope));
    const deniedAccount = snapshot.accounts.find(account => denied &&
      accountKey(account.userId, account.knowledgeScope) ===
      accountKey(denied.userId, denied.knowledgeScope));
    if (!denied || denied.expectedOutcome !== "deny" || !denied.tags.includes("permission") ||
      !owner || owner.expectedOutcome !== "route" || !owner.tags.includes("permission") ||
      denied.userId === owner.userId || denied.caseSha256 !== owner.caseSha256 ||
      accountKey("scope", denied.knowledgeScope) !== accountKey("scope", owner.knowledgeScope) ||
      !/^[0-9a-f]{64}$/.test(proof.targetAssetSha256) || proved.has(proof.denyCaseId) ||
      !ownerAccount?.documents.some(document => document.ownerId === owner.userId &&
        document.visibility === "private" && document.assetSha256 === proof.targetAssetSha256 &&
        document.assetRegistrationStatus === "registered" && document.currentTreeVersionId &&
        document.currentTreeStatus === "ready" &&
        document.currentTreeAssetId === document.assetId &&
        document.currentTreeSourceSha256 === proof.targetAssetSha256) ||
      deniedAccount?.documents.some(document => document.assetSha256 === proof.targetAssetSha256))
      throw new Error(`Invalid MA24 permission control ${proof.denyCaseId}`);
    proved.add(proof.denyCaseId);
  }
  if (proved.size !== denyCases.length)
    throw new Error("MA24 permission denial lacks owner and target proof");
}

/** The positive control must cite the same asset that the denied account cannot read. */
export function assertMa24PermissionGoldControl(manifest: Ma24FrozenManifest,
  snapshot: Ma24CorpusSnapshot, gold: Ma24GoldSnapshot) {
  const goldById = new Map(gold.cases.map(item => [item.caseId, item]));
  for (const proof of snapshot.permissionProofs) {
    if (!goldById.get(proof.ownerCaseId)?.expectedSources.some(source =>
      source.assetSha256 === proof.targetAssetSha256) ||
      !manifest.cases.some(item => item.caseId === proof.ownerCaseId))
      throw new Error(`MA24 permission Gold source mismatch ${proof.denyCaseId}`);
  }
}

/** Every routed answer key must cite a ready asset visible to its execution account. */
export function assertMa24RouteGoldCorpusAccess(manifest: Ma24FrozenManifest,
  snapshot: Ma24CorpusSnapshot, gold: Ma24GoldSnapshot) {
  const goldById = new Map(gold.cases.map(item => [item.caseId, item]));
  for (const item of manifest.cases) {
    if (item.expectedOutcome !== "route") continue;
    const account = snapshot.accounts.find(entry =>
      accountKey(entry.userId, entry.knowledgeScope) ===
      accountKey(item.userId, item.knowledgeScope));
    for (const source of goldById.get(item.caseId)?.expectedSources ?? []) {
      if (!account?.documents.some(document =>
        document.assetSha256 === source.assetSha256 &&
        document.assetRegistrationStatus === "registered" &&
        document.currentTreeVersionId && document.currentTreeStatus === "ready" &&
        document.currentTreeAssetId === document.assetId &&
        document.currentTreeSourceSha256 === source.assetSha256))
        throw new Error(`MA24 route Gold source unavailable ${item.caseId}`);
    }
  }
}

type RouteEvidence = { blockId: string; content: string; sourceLocation: Record<string, unknown> };
const normalizeExcerpt = (value: string) => value.replace(/\s+/g, " ").trim();

function evidenceMatchesGold(row: RouteEvidence, source: Ma24GoldSnapshot["cases"][number]["expectedSources"][number]) {
  if (source.blockId !== undefined && row.blockId !== source.blockId) return false;
  if (source.version !== undefined) return false; // No versioned coordinate mapping is frozen yet.
  if (source.row === undefined)
    return normalizeExcerpt(row.content).includes(normalizeExcerpt(source.excerpt ?? ""));
  const range = row.sourceLocation.cellRange;
  if (typeof range !== "string") return false;
  const match = /^[A-Z]+([1-9]\d*):[A-Z]+([1-9]\d*)$/.exec(range);
  if (!match || source.row < Number(match[1]) || source.row > Number(match[2])) return false;
  const rowText = row.content.split("\n").filter(line =>
    new RegExp(`^[A-Z]+${source.row}:\\s`).test(line)).join(" ");
  return normalizeExcerpt(rowText).includes(normalizeExcerpt(source.excerpt ?? ""));
}

/** Verify the Gold coordinate against the current RLS-visible evidence tree, not merely its asset. */
export async function verifyMa24LiveRouteGoldEvidence(manifest: Ma24FrozenManifest,
  gold: Ma24GoldSnapshot, caseId: string) {
  const entry = manifest.cases.find(item => item.caseId === caseId);
  if (!entry) throw new Error(`MA24 route Gold case absent ${caseId}`);
  if (entry.expectedOutcome !== "route") return;
  const sources = gold.cases.find(item => item.caseId === caseId)?.expectedSources;
  if (!sources?.length) throw new Error(`MA24 route Gold evidence absent ${caseId}`);
  await tenantTransaction(entry.userId, async client => {
    const cache = new Map<string, RouteEvidence[]>();
    for (const source of sources) {
      const key = `${source.assetSha256}:${source.unitIndex}`;
      let rows = cache.get(key);
      if (!rows) {
        rows = (await client.query<RouteEvidence>(`
          select coalesce(n.source_location->>'blockId',n.source_location->>'v3ChunkId',n.id::text) as "blockId",
            n.content, n.source_location as "sourceLocation"
          from knowledge_document d join knowledge_collection c on c.id=d.collection_id
          join knowledge_asset a on a.document_id=d.id
          join knowledge_tree_version v on v.id=d.current_tree_version_id
            and v.asset_id=a.id and v.source_sha256=a.source_sha256 and v.status='ready'
          join knowledge_tree_node n on n.version_id=v.id and n.node_kind='evidence'
          where d.status='active' and c.slug=any($1::text[])
            and a.registration_status='registered' and a.source_sha256=$2 and n.unit_index=$3
          order by n.ordinal`, [entry.knowledgeScope, source.assetSha256, source.unitIndex])).rows;
        cache.set(key, rows);
      }
      if (!rows.some(row => evidenceMatchesGold(row, source)))
        throw new Error(`MA24 route Gold evidence coordinate unavailable ${caseId}`);
    }
  });
}

/** Keep the positive control's private source present during a denied-account run. */
export async function verifyMa24LivePermissionControl(manifest: Ma24FrozenManifest,
  snapshot: Ma24CorpusSnapshot, caseId: string) {
  const proof = snapshot.permissionProofs.find(item => item.denyCaseId === caseId);
  if (!proof) return;
  const owner = manifest.cases.find(item => item.caseId === proof.ownerCaseId);
  if (!owner) throw new Error("MA24 permission owner case absent");
  await verifyMa24LiveCorpusAccount(snapshot, owner.userId, owner.knowledgeScope);
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
        v.status as "currentTreeStatus", v.source_sha256 as "currentTreeSourceSha256",
        v.asset_id as "currentTreeAssetId",
        d.active_release_v3_id as "activeReleaseId", a.id as "assetId",
        a.source_sha256 as "assetSha256", a.registration_status as "assetRegistrationStatus"
      from knowledge_document d join knowledge_collection c on c.id=d.collection_id
      left join knowledge_tree_version v on v.id=d.current_tree_version_id
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
