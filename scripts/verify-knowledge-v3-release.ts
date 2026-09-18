import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const releaseKey = process.argv.find((value) => value.startsWith("--release="))?.slice(10)
  ?? "rag-v3-shadow-2026-09-18";

type Verification = {
  releaseId: string;
  status: string;
  sourceRevisions: number;
  sourceUnits: number;
  chunks: number;
  entityBoundChunks: number;
  orphanChunks: number;
  releaseAssets: number;
  expectedChunks: number;
  openReviews: number;
  unitOpenReviews: number;
  factOpenReviews: number;
  unacceptedCandidateChunks: number;
  qwenEmbeddings: number;
  bgeEmbeddings: number;
  activePointers: number;
};

const rows = await tenantQuery<Verification>(OWNER_USER_ID, `
  select r.id as "releaseId",r.status,
    (select count(*)::int from knowledge_source_revision_v3 sr where sr.release_id=r.id) as "sourceRevisions",
    (select count(*)::int from knowledge_source_unit_v3 su join knowledge_source_revision_v3 sr on sr.id=su.source_revision_id where sr.release_id=r.id) as "sourceUnits",
    (select count(*)::int from knowledge_chunk_v3 c where c.release_id=r.id) as chunks,
    (select count(distinct ce.chunk_id)::int from knowledge_chunk_entity_v3 ce join knowledge_chunk_v3 c on c.id=ce.chunk_id where c.release_id=r.id) as "entityBoundChunks",
    (select count(*)::int from knowledge_chunk_v3 c where c.release_id=r.id and not exists(select 1 from knowledge_chunk_entity_v3 ce where ce.chunk_id=c.id)) as "orphanChunks",
    (select count(*)::int from knowledge_release_asset_v3 ra where ra.release_id=r.id) as "releaseAssets",
    (select coalesce(sum(ra.actual_chunks),0)::int from knowledge_release_asset_v3 ra where ra.release_id=r.id) as "expectedChunks",
    (select count(*)::int from knowledge_review_queue_v3 q where q.release_id=r.id and q.status='open') as "openReviews",
    (select count(*)::int from knowledge_review_queue_v3 q where q.release_id=r.id and q.status='open' and q.source_unit_id is not null) as "unitOpenReviews",
    (select count(*)::int from knowledge_review_queue_v3 q where q.release_id=r.id and q.status='open' and q.fact_id is not null) as "factOpenReviews",
    (select count(*)::int from knowledge_chunk_v3 c join knowledge_source_unit_v3 su on su.id=c.source_unit_id
      where c.release_id=r.id and c.metadata->>'evidenceStatus'='candidate'
        and coalesce(su.metrics->>'humanReviewDecision','')<>'accept-candidate') as "unacceptedCandidateChunks",
    (select count(*)::int from knowledge_chunk_embedding_v3 e join knowledge_chunk_v3 c on c.id=e.chunk_id
      join knowledge_embedding_profile_v3 p on p.id=e.profile_id where c.release_id=r.id and p.profile_key='qwen-v4-1536') as "qwenEmbeddings",
    (select count(*)::int from knowledge_chunk_embedding_v3 e join knowledge_chunk_v3 c on c.id=e.chunk_id
      join knowledge_embedding_profile_v3 p on p.id=e.profile_id where c.release_id=r.id and p.profile_key='bge-m3-1024') as "bgeEmbeddings",
    (select count(*)::int from knowledge_release_pointer_v3 p where p.release_id=r.id) as "activePointers"
  from knowledge_release_v3 r where r.release_key=$1
`, [releaseKey], "admin");
if (!rows[0]) throw new Error(`Release not found: ${releaseKey}`);
const result = rows[0];
const violations = [
  result.unacceptedCandidateChunks ? `${result.unacceptedCandidateChunks} unaccepted candidate chunks entered the release` : null,
  result.sourceRevisions !== result.releaseAssets ? `revision/asset mismatch ${result.sourceRevisions}/${result.releaseAssets}` : null,
  result.chunks !== result.expectedChunks ? `chunk count mismatch ${result.chunks}/${result.expectedChunks}` : null,
].filter(Boolean);
console.log(JSON.stringify({ mode: "read-only", releaseKey, ...result, violations,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 } }, null, 2));
await getPool().end();
if (violations.length) process.exitCode = 2;
