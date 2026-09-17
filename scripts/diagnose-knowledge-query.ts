import { createHash } from "node:crypto";
import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { parseKnowledgeRequest } from "../src/lib/knowledge/request";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());

const questionIndex = process.argv.indexOf("--question");
const question = questionIndex >= 0 ? process.argv[questionIndex + 1]?.trim() : undefined;
if (!question) throw new Error("Usage: npm run knowledge:diagnose -- --question \"...\"");

const request = await parseKnowledgeRequest(OWNER_USER_ID, { question, entry: "knowledge-page" });
const facts = request.entityKeys.length ? await tenantQuery<{
  entity: string; attribute: string; status: string; matches: number; assets: number;
}>(OWNER_USER_ID, `select e.canonical_key as entity,f.attribute_key as attribute,
    f.verification_status as status,count(*)::int as matches,count(distinct a.id)::int as assets
  from knowledge_fact f
  join knowledge_entity e on e.id=f.entity_id
  join knowledge_source_revision r on r.id=f.source_revision_id
  join knowledge_asset a on a.id=r.asset_id
  join knowledge_document d on d.id=a.document_id
  where e.canonical_key=any($1::text[]) and (cardinality($2::text[])=0 or f.attribute_key=any($2::text[]))
    and (d.visibility='shared' or d.owner_id=$3)
  group by e.canonical_key,f.attribute_key,f.verification_status
  order by e.canonical_key,f.attribute_key,f.verification_status`, [request.entityKeys, request.attributeKeys, OWNER_USER_ID]) : [];

const legacyLexical = await tenantQuery<{ id: string; documentId: string; rank: number }>(OWNER_USER_ID,
  `select ch.id,ch.document_id as "documentId",
      ts_rank_cd(ch.search_vector,websearch_to_tsquery('simple',$1))::float8 as rank
    from knowledge_chunk ch join knowledge_document d on d.id=ch.document_id
   where d.status='active' and (d.visibility='shared' or d.owner_id=$2)
     and ch.search_vector @@ websearch_to_tsquery('simple',$1)
   order by rank desc,ch.id limit 40`, [question, OWNER_USER_ID]);

const shadowLexical = await tenantQuery<{ id: string; documentId: string; releaseId: string; rank: number }>(OWNER_USER_ID,
  `select ch.id,ch.document_id as "documentId",ch.generation_id as "releaseId",
      ts_rank_cd(to_tsvector('simple',coalesce(ch.normalized_text,ch.content)),websearch_to_tsquery('simple',$1))::float8 as rank
    from knowledge_chunk_v2 ch join knowledge_document d on d.id=ch.document_id
   where ch.generation_id=d.active_generation_id and d.status='active'
     and (d.visibility='shared' or d.owner_id=$2)
     and to_tsvector('simple',coalesce(ch.normalized_text,ch.content)) @@ websearch_to_tsquery('simple',$1)
   order by rank desc,ch.id limit 40`, [question, OWNER_USER_ID]);

console.log(JSON.stringify({
  mode: "read-only-no-paid-models",
  querySha256: createHash("sha256").update(question).digest("hex"),
  queryLength: question.length,
  request: {
    action: request.action,
    entities: request.parsedEntities,
    attributes: request.attributeKeys,
    comparisonMode: request.comparisonMode,
    comparisonProfile: request.comparisonProfile,
  },
  lanes: {
    facts,
    legacyLexical,
    activeStructuredLexical: shadowLexical,
    qwenDense: { status: "not-run", reason: "R0 forbids paid query embeddings" },
    bgeDense: { status: "not-run", reason: "v3 local embedding lane is not implemented yet" },
  },
  traceBodyRecorded: false,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
}, null, 2));

await getPool().end();
