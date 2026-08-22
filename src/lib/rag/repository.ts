import type { PoolClient } from "pg";
import { tenantQuery, tenantTransaction, type AppDatabaseRole } from "./db";
import { sha256, chunkDocument } from "./chunker";
import { embedTexts } from "./openai-provider";
import type { KnowledgeBaseType, KnowledgeDocumentInput, KnowledgeStats, KnowledgeVisibility, RetrievedChunk, RetrievalFilters } from "./types";

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export async function upsertKnowledgeDocument(userId: string, input: KnowledgeDocumentInput, actorRole: AppDatabaseRole = "member"): Promise<{ documentId: string; chunks: number; skipped: boolean }> {
  const contentHash = sha256(input.content);
  const visibility = input.visibility ?? "private";
  const existing = await tenantQuery<{ id: string; content_sha256: string; visibility: KnowledgeVisibility }>(userId,
    `select d.id, d.content_sha256, d.visibility from knowledge_document d
     join knowledge_collection c on c.id = d.collection_id
     where c.slug = $1 and d.external_id = $2 and d.owner_id = $3`,
    [input.collection, input.externalId, userId],
  );
  if (existing[0]?.content_sha256 === contentHash && existing[0]?.visibility === visibility) {
    const count = await tenantQuery<{ count: string }>(userId, "select count(*) from knowledge_chunk where document_id = $1", [existing[0].id], actorRole);
    return { documentId: existing[0].id, chunks: Number(count[0]?.count ?? 0), skipped: true };
  }

  const chunks = chunkDocument(input.content);
  if (chunks.length === 0) throw new Error(`Document ${input.externalId} has no ingestible content`);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  return tenantTransaction(userId, async (client: PoolClient) => {
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

export async function hybridSearch(userId: string, question: string, queryEmbedding: number[], filters: RetrievalFilters = {}, limit = 8): Promise<RetrievedChunk[]> {
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
       where d.status = 'active' and ch.embedding is not null
         and (d.visibility = 'shared' or (d.visibility = 'private' and d.owner_id = $9))
         and c.slug = any($3::text[])
         and ($4::text is null or d.market = $4)
         and ($5::text is null or d.company_id = $5)
         and ($6::text is null or d.product_id = $6)
         and d.authority_level >= $7
     ), vector_results as (
       select id, row_number() over (order by embedding <=> $1::vector) as rank,
              (1 - (embedding <=> $1::vector))::float8 as similarity
       from eligible order by embedding <=> $1::vector limit 30
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
         or e.document_metadata->>'category' = sm.category
       )
       group by e.id
     )
     select e.id, e.document_id, e.collection, e.title, e.content, e.source_url, e.source_type,
            e.visibility,
            e.authority_level, e.captured_at, e.heading_path, v.rank as vector_rank, k.rank as keyword_rank,
            s.rank as structured_rank, coalesce(s.evidence, '[]'::jsonb) as structured_evidence,
            v.similarity as vector_similarity,
            (greatest(coalesce(v.similarity, 0), 0) * 0.70 +
             least((coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + k.rank), 0)
               + coalesce(1.0 / (60 + s.rank), 0)) * 8, 0.30))::float8 as score,
            e.document_metadata as metadata
     from eligible e
     left join vector_results v on v.id = e.id
     left join keyword_results k on k.id = e.id
     left join structured_results s on s.id = e.id
     where v.id is not null or k.id is not null or s.id is not null
     order by score desc limit $8`,
    [vectorLiteral(queryEmbedding), question, collections, filters.market ?? null, filters.companyId ?? null,
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
      corroborated: retrievalSignals.length >= 2,
      score: Math.max(0, Math.min(row.score, 1)), visibility: row.visibility,
      metadata: { ...row.metadata, visibility: row.visibility, vectorSimilarity: row.vector_similarity,
        structuredFacts: row.structured_evidence ?? [] },
    };
  });
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
