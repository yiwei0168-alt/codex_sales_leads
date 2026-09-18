import { createHash } from "node:crypto";
import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { parseKnowledgeRequest } from "../src/lib/knowledge/request";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";

nextEnv.loadEnvConfig(process.cwd());

const questionIndex = process.argv.indexOf("--question");
const question = questionIndex >= 0 ? process.argv[questionIndex + 1]?.trim() : undefined;
if (!question) throw new Error("Usage: npm run knowledge:diagnose -- --question \"...\"");

const request = await parseKnowledgeRequest(OWNER_USER_ID, { question, entry: "knowledge-page" });
const withBge = process.argv.includes("--with-bge");
const releases = await tenantQuery<{id:string;key:string;status:string;active:boolean}>(OWNER_USER_ID,`select r.id,r.release_key key,r.status,
  exists(select 1 from knowledge_release_pointer_v3 p where p.release_id=r.id)active
  from knowledge_release_v3 r where r.scope_kind='shared' order by active desc,r.created_at desc limit 1`,[]);
const release = releases[0];
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

const v3Facts=release&&request.entityKeys.length?await tenantQuery<{id:string;entity:string;attribute:string;status:string;chunkId:string;sourceLocation:Record<string,unknown>}>(OWNER_USER_ID,`select f.id,e.canonical_key entity,f.attribute_key attribute,f.verification_status status,f.chunk_id as "chunkId",f.evidence_location as "sourceLocation"
  from knowledge_fact_v3 f join knowledge_entity e on e.id=f.entity_id join knowledge_chunk_v3 c on c.id=f.chunk_id join knowledge_document d on d.id=c.document_id
  where f.release_id=$1 and lower(e.canonical_key) in(select lower(x)from unnest($2::text[])requested(x))
    and(cardinality($3::text[])=0 or f.attribute_key=any($3::text[]))and(d.visibility='shared'or d.owner_id=$4)
  order by(case f.verification_status when'verified'then 0 when'candidate'then 1 else 2 end),f.attribute_key limit 40`,[release.id,request.entityKeys,request.attributeKeys,OWNER_USER_ID]):[];
const v3Lexical=release?await tenantQuery<{id:string;documentId:string;rank:number;sourceLocation:Record<string,unknown>}>(OWNER_USER_ID,`select c.id,c.document_id as "documentId",ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',$2))::float8 rank,c.source_location as "sourceLocation"
  from knowledge_chunk_v3 c join knowledge_document d on d.id=c.document_id where c.release_id=$1 and(d.visibility='shared'or d.owner_id=$3)
    and c.search_vector@@websearch_to_tsquery('simple',$2) order by rank desc,c.id limit 40`,[release.id,question,OWNER_USER_ID]):[];
let bgeDense:unknown={status:"available-not-run",reason:"pass --with-bge to run the loopback-only local lane"};
if(withBge&&release){
  const started=Date.now();const [embedding]=await embedTextsWithBge([question]);
  const candidates=await tenantQuery<{id:string;documentId:string;rank:string;sourceLocation:Record<string,unknown>}>(OWNER_USER_ID,`select c.id,c.document_id as "documentId",row_number()over(order by e.bge_embedding<=>$2::vector)::text rank,c.source_location as "sourceLocation"
    from knowledge_chunk_v3 c join knowledge_document d on d.id=c.document_id join knowledge_chunk_embedding_v3 e on e.chunk_id=c.id
    join knowledge_embedding_profile_v3 p on p.id=e.profile_id and p.profile_key='bge-m3-1024'
    where c.release_id=$1 and e.bge_embedding is not null and(d.visibility='shared'or d.owner_id=$3)
      and(cardinality($4::text[])=0 or exists(select 1 from knowledge_chunk_entity_v3 ce join knowledge_entity ke on ke.id=ce.entity_id where ce.chunk_id=c.id and lower(ke.canonical_key)in(select lower(x)from unnest($4::text[])requested(x))))
    order by e.bge_embedding<=>$2::vector limit 40`,[release.id,`[${embedding.join(",")}]`,OWNER_USER_ID,request.entityKeys]);
  bgeDense={status:"success",dimensions:embedding.length,latencyMs:Date.now()-started,candidates};
}

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
  v3Release: release ?? null,
  lanes: {
    facts,
    legacyLexical,
    activeStructuredLexical: shadowLexical,
    v3Facts,
    v3Fulltext: v3Lexical,
    qwenDense: { status: "not-run", reason: "diagnostic does not authorize paid query embeddings" },
    bgeDense,
  },
  traceBodyRecorded: false,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
  localCalls: { bgeEmbedding: withBge ? 1 : 0 },
}, null, 2));

await getPool().end();
