import {withProductSpend} from "@/lib/billing/context";
import type { PoolClient } from "pg";
import { tenantQuery, tenantTransaction, type AppDatabaseRole } from "./db";
import { sha256, chunkDocument } from "./chunker";
import { embedTexts } from "./openai-provider";
import {trackedOperation} from "@/lib/tracked-operation";
import type { KnowledgeBaseType, KnowledgeDocumentInput, KnowledgeStats, KnowledgeVisibility, RetrievedChunk, RetrievalFilters } from "./types";

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export class KnowledgeConflictError extends Error {constructor(){super("知识版本已变化，请重新检查后确认覆盖");}}
export function knowledgeMetadataChanged(current:{source_url:string|null;source_type:string;authority_level:number;language:string;market:string|null;company_id:string|null;product_id:string|null;metadata:Record<string,unknown>},input:KnowledgeDocumentInput):boolean{
  return current.source_url!==(input.sourceUrl??null)||current.source_type!==input.sourceType||current.authority_level!==input.authorityLevel||current.language!==(input.language??"zh-CN")||current.market!==(input.market??null)||current.company_id!==(input.companyId??null)||current.product_id!==(input.productId??null)||JSON.stringify(current.metadata)!==JSON.stringify(input.metadata??{});
}
export async function upsertKnowledgeDocument(userId: string, input: KnowledgeDocumentInput, actorRole: AppDatabaseRole = "member",expectedHash?:string|null): Promise<{ documentId: string; chunks: number; skipped: boolean }> {
  return trackedOperation(userId,"knowledge-document-save",1,input.content.length,()=>upsertKnowledgeDocumentImpl(userId,input,actorRole,expectedHash),result=>({
    outputItems:result.chunks,validOutputItems:result.chunks,downstreamUsedItems:result.chunks,
    costUsd:result.skipped?0:null,inputTokens:result.skipped?0:null,outputTokens:0,retries:result.skipped?0:null,
    usageBoundary:result.skipped?"unchanged-document-cache-reused":"chunks-stored-not-yet-used-by-retrieval",
    optimizationOpportunity:"Skip embedding unchanged content; measure later retrieval use separately from storage",
  }));
}
async function upsertKnowledgeDocumentImpl(userId: string, input: KnowledgeDocumentInput, actorRole: AppDatabaseRole,expectedHash?:string|null): Promise<{ documentId: string; chunks: number; skipped: boolean }> {
  const contentHash = sha256(input.content);
  const visibility = input.visibility ?? "private";
  const existing = await tenantQuery<{ id: string; content_sha256: string; visibility: KnowledgeVisibility; source_url:string|null;source_type:string;authority_level:number;language:string;market:string|null;company_id:string|null;product_id:string|null;metadata:Record<string,unknown> }>(userId,
    `select d.id, d.content_sha256, d.visibility,d.source_url,d.source_type,d.authority_level,d.language,d.market,d.company_id,d.product_id,d.metadata from knowledge_document d
     join knowledge_collection c on c.id = d.collection_id
     where c.slug = $1 and d.external_id = $2 and d.owner_id = $3`,
    [input.collection, input.externalId, userId],
  );
  if (existing[0]?.content_sha256 === contentHash && existing[0]?.visibility === visibility) {
    const current=existing[0];
    const metadataChanged=knowledgeMetadataChanged(current,input);
    if(metadataChanged)await tenantQuery(userId,`update knowledge_document set title=$2,source_url=$3,source_type=$4,authority_level=$5,language=$6,market=$7,company_id=$8,product_id=$9,metadata=$10,updated_at=now() where id=$1`,[current.id,input.title,input.sourceUrl??null,input.sourceType,input.authorityLevel,input.language??"zh-CN",input.market??null,input.companyId??null,input.productId??null,JSON.stringify(input.metadata??{})],actorRole);
    const count = await tenantQuery<{ count: string }>(userId, "select count(*) from knowledge_chunk where document_id = $1", [existing[0].id], actorRole);
    return { documentId: existing[0].id, chunks: Number(count[0]?.count ?? 0), skipped: true };
  }

  const chunks = chunkDocument(input.content);
  if (chunks.length === 0) throw new Error(`Document ${input.externalId} has no ingestible content`);
  const embeddings = await withProductSpend(userId,"knowledge-ingestion",()=>embedTexts(chunks.map((chunk) => chunk.content)));

  return tenantTransaction(userId, async (client: PoolClient) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:${input.collection}:${input.externalId}`]);
    if(expectedHash!==undefined){const current=await client.query<{content_sha256:string}>(`select d.content_sha256 from knowledge_document d join knowledge_collection c on c.id=d.collection_id where d.owner_id=$1 and c.slug=$2 and d.external_id=$3 for update of d`,[userId,input.collection,input.externalId]);
      if((current.rows[0]?.content_sha256??null)!==expectedHash)throw new KnowledgeConflictError();}
    await client.query(`insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed)
      select d.id,d.owner_id,d.content_sha256,d.title,coalesce(string_agg(k.content,E'\n\n' order by k.chunk_index),''),true
      from knowledge_document d join knowledge_collection c on c.id=d.collection_id left join knowledge_chunk k on k.document_id=d.id
      where d.owner_id=$1 and c.slug=$2 and d.external_id=$3 and d.content_sha256<>$4 group by d.id on conflict do nothing`,[userId,input.collection,input.externalId,contentHash]);
    const result = await client.query<{ id: string }>(
      `insert into knowledge_document (
        collection_id, external_id, title, source_url, source_type, authority_level,
        language, market, company_id, product_id, content_sha256, metadata, status,
        captured_at, published_at, updated_at, owner_id, visibility
      ) values (
        (select id from knowledge_collection where slug = $1), $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, 'active', $13, $14, now(), $15, $16
      ) on conflict (owner_id, collection_id, external_id) do update set
        title = excluded.title, source_url = excluded.source_url, source_type = excluded.source_type,
        authority_level = excluded.authority_level, language = excluded.language, market = excluded.market,
        company_id = excluded.company_id, product_id = excluded.product_id,
        content_sha256 = excluded.content_sha256, metadata = excluded.metadata, status = 'active',
        captured_at = excluded.captured_at, published_at = excluded.published_at,
        visibility = excluded.visibility, updated_at = now()
      returning id`,
      [input.collection, input.externalId, input.title, input.sourceUrl ?? null, input.sourceType,
        input.authorityLevel, input.language ?? "zh-CN", input.market ?? null, input.companyId ?? null,
        input.productId ?? null, contentHash, JSON.stringify(input.metadata ?? {}),
        input.capturedAt ?? null, input.publishedAt ?? null, userId, visibility],
    );
    const documentId = result.rows[0].id;
    await client.query("insert into knowledge_document_revision(document_id,user_id,content_sha256,title,content,reconstructed) values($1,$2,$3,$4,$5,false) on conflict do nothing",[documentId,userId,contentHash,input.title,input.content]);
    await client.query("delete from knowledge_chunk where document_id = $1", [documentId]);
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `insert into knowledge_chunk (
          document_id, chunk_index, heading_path, content, token_estimate,
          content_sha256, embedding, metadata
        ) values ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
        [documentId, chunk.index, chunk.headingPath, chunk.content, chunk.tokenEstimate,
          chunk.contentSha256, vectorLiteral(embeddings[index]), JSON.stringify({})],
      );
    }
    return { documentId, chunks: chunks.length, skipped: false };
  }, actorRole);
}

export async function hybridSearch(userId: string, question: string, queryEmbedding: number[] | null, filters: RetrievalFilters = {}, limit = 8): Promise<RetrievedChunk[]> {
  const collections = filters.collections?.length ? filters.collections : ["industry", "company", "product"];
  const structuredQuery = filters.structuredProductTerms?.length
    ? filters.structuredProductTerms.map((term) => `"${term.replace(/["\\]/g, " ").trim()}"`).filter((term) => term !== '""').join(" OR ")
    : question;
  const rows = await tenantQuery<{
    id: string; document_id: string; collection: KnowledgeBaseType; title: string; content: string;
    source_url: string | null; source_type: string; authority_level: number; captured_at: string | null;
    visibility: KnowledgeVisibility;
    heading_path: string[]; vector_rank: string | null; keyword_rank: string | null;
    structured_rank: string | null; structured_evidence: Array<{
      model: string; factKey: string; factValue: string; status: string;
    }> | null;
    vector_similarity: number | null; score: number; metadata: Record<string, unknown>;
  }>(userId,
    `with eligible as (
       select ch.*, d.title, d.source_url, d.source_type, d.authority_level, d.captured_at,
              d.market, d.company_id, d.product_id, d.metadata as document_metadata,
              d.visibility, c.slug as collection
       from knowledge_chunk ch
       join knowledge_document d on d.id = ch.document_id
       join knowledge_collection c on c.id = d.collection_id
       where d.status = 'active'
         and (d.visibility = 'shared' or (d.visibility = 'private' and d.owner_id = $9))
         and c.slug = any($3::text[])
         and ($4::text is null or d.market = $4)
         and ($5::text is null or d.company_id = $5)
         and ($6::text is null or d.product_id = $6)
         and d.authority_level >= $7
     ), vector_results as (
       select id, row_number() over (order by embedding <=> $1::vector) as rank,
              (1 - (embedding <=> $1::vector))::float8 as similarity
       from eligible
       where $1::vector is not null and embedding is not null
       order by embedding <=> $1::vector limit 30
     ), keyword_results as (
       select id, row_number() over (order by ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) desc) as rank
       from eligible
       where search_vector @@ websearch_to_tsquery('simple', $2)
       order by ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) desc limit 30
     ), raw_structured_matches as (
       select pc.model, pc.category, 'catalog_identity'::text as fact_key,
              (pc.product_name || ' / ' || pc.category)::text as fact_value,
              'verified'::text as verification_status,
              ts_rank_cd(pc.search_vector, websearch_to_tsquery('simple', $10))::float8 as relevance
       from product_catalog pc
       where pc.search_vector @@ websearch_to_tsquery('simple', $10)
       union all
       select pf.model, pc.category, pf.fact_key, pf.fact_value, pf.verification_status,
              (ts_rank_cd(pf.search_vector, websearch_to_tsquery('simple', $10))
               * (pf.source_authority::float8 / 5.0)
               * case pf.verification_status when 'verified' then 1.0 when 'provisional' then 0.6 else 0.2 end)::float8
       from product_fact pf
       join product_catalog pc on pc.model = pf.model
       where pf.search_vector @@ websearch_to_tsquery('simple', $10)
     ), structured_matches as (
       select *, row_number() over (order by relevance desc, model) as rank
       from raw_structured_matches
       where 'product' = any($3::text[])
       order by relevance desc, model limit 40
     ), structured_results as (
       select e.id, min(sm.rank) as rank,
              jsonb_agg(jsonb_build_object(
                'model', sm.model, 'factKey', sm.fact_key, 'factValue', sm.fact_value,
                'status', sm.verification_status
              ) order by sm.rank) as evidence
       from eligible e
       join structured_matches sm on e.collection = 'product' and (
         e.product_id = sm.model
         or e.document_metadata->'relatedModels' ? sm.model
       )
       group by e.id
     ), evidence_windows as (
       select e.id,
              left(string_agg(n.content, E'\n\n' order by n.chunk_index), 6000) as content
       from eligible e
       join eligible n on n.document_id = e.document_id
        and n.chunk_index between e.chunk_index - 1 and e.chunk_index + 1
        and (n.heading_path = e.heading_path or n.id = e.id)
       group by e.id
     )
     select e.id, e.document_id, e.collection, e.title, coalesce(w.content, e.content) as content, e.source_url, e.source_type,
            e.visibility,
            e.authority_level, e.captured_at, e.heading_path, v.rank as vector_rank, k.rank as keyword_rank,
            s.rank as structured_rank, coalesce(s.evidence, '[]'::jsonb) as structured_evidence,
            v.similarity as vector_similarity,
            greatest(
              greatest(coalesce(v.similarity, 0), 0) * 0.65
                + least((coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + k.rank), 0)
                  + coalesce(1.0 / (60 + s.rank), 0)) * 8, 0.25),
              case when s.id is not null then 0.50 when k.id is not null then 0.42 else 0 end
            )::float8 as score,
            e.document_metadata as metadata
     from eligible e
     left join vector_results v on v.id = e.id
     left join keyword_results k on k.id = e.id
     left join structured_results s on s.id = e.id
     left join evidence_windows w on w.id = e.id
     where v.id is not null or k.id is not null or s.id is not null
     order by score desc limit $8`,
    [queryEmbedding ? vectorLiteral(queryEmbedding) : null, filters.lexicalQuery ?? question, collections, filters.market ?? null, filters.companyId ?? null,
      filters.productId ?? null, filters.minAuthority ?? 1, limit, userId,
      structuredQuery],
  );
  return rows.map((row) => {
    const retrievalSignals: RetrievedChunk["retrievalSignals"] = [];
    if (row.vector_rank) retrievalSignals.push("vector");
    if (row.keyword_rank) retrievalSignals.push("keyword");
    if (row.structured_rank) retrievalSignals.push("structured");
    return {
      id: row.id, documentId: row.document_id, collection: row.collection, title: row.title,
      content: row.content, sourceUrl: row.source_url ?? undefined, sourceType: row.source_type,
      authorityLevel: row.authority_level, capturedAt: row.captured_at ?? undefined,
      headingPath: row.heading_path, vectorRank: row.vector_rank ? Number(row.vector_rank) : undefined,
      keywordRank: row.keyword_rank ? Number(row.keyword_rank) : undefined,
      structuredRank: row.structured_rank ? Number(row.structured_rank) : undefined,
      retrievalSignals,
      corroborated: (row.structured_evidence ?? []).some((fact) =>
        fact.status === "verified" && fact.factKey !== "catalog_identity")
        && (retrievalSignals.includes("vector") || retrievalSignals.includes("keyword")),
      score: Math.max(0, Math.min(row.score, 1)), rankingScore: Math.max(0, Math.min(row.score, 1)), visibility: row.visibility,
      metadata: { ...row.metadata, visibility: row.visibility, vectorSimilarity: row.vector_similarity,
        structuredFacts: row.structured_evidence ?? [] },
    };
  });
}

export async function knowledgeRevisionToken(userId: string): Promise<string> {
  const rows = await tenantQuery<{ token: string }>(userId, `select concat_ws(':',
      coalesce(max(d.updated_at)::text, 'none'),
      coalesce(string_agg(distinct d.active_generation_id::text, ',' order by d.active_generation_id::text), 'v1')) as token
    from knowledge_document d
   where d.status='active' and (d.visibility='shared' or d.owner_id=$1)`, [userId]);
  return rows[0]?.token ?? "none:v1";
}

export async function authorizedKnowledgeChunkIds(userId: string, chunkIds: string[]): Promise<Set<string>> {
  if (!chunkIds.length) return new Set();
  const rows = await tenantQuery<{ id: string }>(userId, `select ch.id
      from knowledge_chunk ch join knowledge_document d on d.id=ch.document_id
     where ch.id=any($1::uuid[]) and d.status='active'
       and (d.visibility='shared' or d.owner_id=$2)`, [chunkIds, userId]);
  return new Set(rows.map((row) => row.id));
}

export async function getKnowledgeStats(userId: string): Promise<KnowledgeStats> {
  const rows = await tenantQuery<{
    type: KnowledgeBaseType; document_count: string; chunk_count: string; embedded_count: string; last_updated: string | null;
  }>(userId,
    `select c.slug as type, count(distinct d.id) as document_count, count(ch.id) as chunk_count,
            count(ch.embedding) as embedded_count, max(d.updated_at)::text as last_updated
     from knowledge_collection c
     left join knowledge_document d on d.collection_id = c.id and d.status = 'active'
       and (d.visibility = 'shared' or (d.visibility = 'private' and d.owner_id = $1))
     left join knowledge_chunk ch on ch.document_id = d.id
     group by c.slug order by c.slug`,
    [userId],
  );
  return {
    configured: true,
    provider: "PostgreSQL + pgvector",
    collections: rows.map((row) => ({
      type: row.type, documentCount: Number(row.document_count), chunkCount: Number(row.chunk_count),
      embeddedCount: Number(row.embedded_count), lastUpdated: row.last_updated ?? undefined,
    })),
  };
}

export async function logRagQuery(input: {
  userId: string;
  queryText: string; collections: string[]; filters: RetrievalFilters; chunkIds: string[];
  answer?: string; embeddingModel: string; generationModel: string; latencyMs: number;
}): Promise<void> {
  await tenantQuery(input.userId,
    `insert into rag_query_log (user_id, query, collection_slugs, filters, retrieved_chunk_ids, answer, embedding_model, generation_model, latency_ms)
     values ($1, $2, $3, $4, $5::uuid[], $6, $7, $8, $9)`,
    [input.userId, input.queryText, input.collections, JSON.stringify(input.filters), input.chunkIds,
      input.answer ?? null, input.embeddingModel, input.generationModel, input.latencyMs],
  );
}
