import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { withProductSpend } from "../src/lib/billing/context";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";
import { embedTextsWithUsage } from "../src/lib/rag/openai-provider";
import { getRagConfig } from "../src/lib/rag/config";

nextEnv.loadEnvConfig(process.cwd());

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));
const apply = args.get("apply") === "true";
const activateGeneration = args.get("activate-generation");
const rollbackGeneration = args.get("rollback-generation");
const embedGeneration = args.get("embed-generation");
const batchSize = Math.min(1000, Math.max(1, Number(args.get("batch-size") ?? 100)));
const maxChunks = args.get("max-chunks") === undefined ? undefined : Number(args.get("max-chunks"));
const resumeAfter = args.get("resume-after") === "true" ? undefined : args.get("resume-after");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if ([activateGeneration, rollbackGeneration, embedGeneration].filter(Boolean).length > 1) throw new Error("Choose one generation action");
const target = activateGeneration ?? rollbackGeneration;
const requestedGeneration = target ?? embedGeneration;
if (requestedGeneration && !uuid.test(requestedGeneration)) throw new Error("Generation id must be a UUID");
if (requestedGeneration && !apply) throw new Error("Embedding and generation switches require the explicit --apply flag");
if (resumeAfter && !uuid.test(resumeAfter)) throw new Error("resume-after must be a chunk UUID");
if (maxChunks !== undefined && (!Number.isSafeInteger(maxChunks) || maxChunks < 1)) throw new Error("max-chunks must be a positive integer");

function vectorLiteral(vector: number[]): string { return `[${vector.join(",")}]`; }

try {
  const summary = (await tenantQuery<{
    generationId: string; name: string; status: string; documents: string; chunks: string;
    reusableVectors: string; missingVectors: string;
  }>(OWNER_USER_ID, `select g.id as "generationId",g.name,g.status,
      count(distinct r.asset_id)::text as documents,count(c.id)::text as chunks,
      count(c.id) filter(where c.embedding is not null or exists(
        select 1 from knowledge_chunk legacy where legacy.document_id=c.document_id
          and legacy.content_sha256=c.content_sha256 and legacy.embedding is not null))::text as "reusableVectors",
      count(c.id) filter(where c.embedding is null and not exists(
        select 1 from knowledge_chunk legacy where legacy.document_id=c.document_id
          and legacy.content_sha256=c.content_sha256 and legacy.embedding is not null))::text as "missingVectors"
    from knowledge_index_generation g
    left join knowledge_source_revision r on r.generation_id=g.id
    left join knowledge_chunk_v2 c on c.source_revision_id=r.id
   group by g.id,g.name,g.status order by g.created_at desc`, [], "admin"))
    .map((row) => ({ ...row, documents: Number(row.documents), chunks: Number(row.chunks),
      reusableVectors: Number(row.reusableVectors), missingVectors: Number(row.missingVectors),
      estimatedEmbeddingRequests: Math.ceil(Number(row.missingVectors) / 10), estimatedCashCost: "unknown" }));

  if (embedGeneration) {
    const selected = summary.find((row) => row.generationId === embedGeneration);
    if (!selected) throw new Error("Target generation does not exist");
    if (selected.status !== "validated") throw new Error("Embedding target must be a validated generation");
    const config = getRagConfig();
    if (!config.embeddingApiKey || !config.embeddingBaseUrl) throw new Error("Embedding endpoint and API key must be configured");
    if (config.embeddingDimensions !== 1536) throw new Error("v2 chunks require EMBEDDING_DIMENSIONS=1536");
    const effectiveBatchSize = Math.min(10, batchSize);
    const job = await tenantTransaction(OWNER_USER_ID, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into knowledge_reindex_job(user_id,generation_id,mode,status,batch_size,resume_after,metrics)
         values($1,$2,'embed','running',$3,$4,$5) returning id`,
        [OWNER_USER_ID, embedGeneration, effectiveBatchSize, resumeAfter ?? null,
          JSON.stringify({ requestedChunks: maxChunks ?? null, embeddingModel: config.embeddingModel,
            embeddingDimensions: config.embeddingDimensions, inputItems: 0, validVectors: 0,
            downstreamUsedVectors: 0, inputTokens: 0, latencyMs: 0, retries: 0, cashCost: "unknown" })],
      );
      return result.rows[0];
    }, "admin");
    let processed = 0;
    let inputTokens = 0;
    let latencyMs = 0;
    let lastChunkId = resumeAfter ?? null;
    try {
      while (maxChunks === undefined || processed < maxChunks) {
        const limit = Math.min(effectiveBatchSize, maxChunks === undefined ? effectiveBatchSize : maxChunks - processed);
        const chunks = await tenantQuery<{ id: string; content: string }>(OWNER_USER_ID,
          `select id,content from knowledge_chunk_v2
            where generation_id=$1 and embedding is null and ($2::uuid is null or id>$2::uuid)
            order by id limit $3`, [embedGeneration, lastChunkId, limit], "admin");
        if (!chunks.length) break;
        const result = await withProductSpend(OWNER_USER_ID, "knowledge-v2-reindex-embedding", () =>
          embedTextsWithUsage(chunks.map((chunk) => chunk.content)), job.id);
        if (result.embeddings.length !== chunks.length || result.embeddings.some((vector) => vector.length !== config.embeddingDimensions)) {
          throw new Error("Embedding response was incomplete or had an unexpected dimension");
        }
        await tenantTransaction(OWNER_USER_ID, async (client) => {
          for (const [index, chunk] of chunks.entries()) {
            await client.query(`update knowledge_chunk_v2 set embedding=$2::vector
              where id=$1 and generation_id=$3 and embedding is null`, [chunk.id, vectorLiteral(result.embeddings[index]), embedGeneration]);
          }
          processed += chunks.length;
          inputTokens += result.usage.reduce((sum, usage) => sum + usage.inputTokens, 0);
          latencyMs += result.usage.reduce((sum, usage) => sum + usage.latencyMs, 0);
          lastChunkId = chunks.at(-1)?.id ?? lastChunkId;
          await client.query(`update knowledge_reindex_job set resume_after=$2,updated_at=now(),metrics=$3 where id=$1`,
            [job.id, lastChunkId, JSON.stringify({ requestedChunks: maxChunks ?? null, embeddingModel: config.embeddingModel,
              embeddingDimensions: config.embeddingDimensions, inputItems: processed, validVectors: processed,
              downstreamUsedVectors: processed, inputTokens, latencyMs, retries: 0, cashCost: "unknown" })]);
          await client.query(`update knowledge_index_generation set embedding_model=$2,embedding_dimensions=$3 where id=$1`,
            [embedGeneration, config.embeddingModel, config.embeddingDimensions]);
        }, "admin");
      }
      await tenantQuery(OWNER_USER_ID, "update knowledge_reindex_job set status='completed',updated_at=now() where id=$1", [job.id], "admin");
      console.log(JSON.stringify({ mode: "embed", generationId: embedGeneration, jobId: job.id, batchSize: effectiveBatchSize,
        processed, inputTokens, latencyMs, resumeAfter: lastChunkId, modelCalls: 0,
        embeddingCalls: Math.ceil(processed / 10), cashCost: "unknown" }, null, 2));
    } catch (error) {
      await tenantQuery(OWNER_USER_ID, "update knowledge_reindex_job set status='failed',updated_at=now(),metrics=metrics || $2::jsonb where id=$1",
        [job.id, JSON.stringify({ failureReason: error instanceof Error ? error.name : "unknown" })], "admin").catch(() => undefined);
      throw error;
    }
  } else if (!target) {
    console.log(JSON.stringify({ mode: "dry-run", writes: 0, batchSize, resumeAfter: resumeAfter ?? null,
      generations: summary, modelCalls: 0, embeddingCalls: 0, cashCost: 0 }, null, 2));
  } else {
    const mode = activateGeneration ? "activate" : "rollback";
    const selected = summary.find((row) => row.generationId === target);
    if (!selected) throw new Error("Target generation does not exist");
    if (!(["validated", "active"].includes(selected.status))) throw new Error("Target generation must be validated or active");
    if (activateGeneration && selected.missingVectors > 0) throw new Error("Cannot activate a generation with missing embeddings");
    await tenantTransaction(OWNER_USER_ID, async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtextextended('knowledge-generation-switch',0))");
      const active = await client.query<{ id: string }>("select id from knowledge_index_generation where status='active' for update");
      await client.query("update knowledge_index_generation set status='validated',activated_at=null where status='active' and id<>$1", [target]);
      await client.query("update knowledge_index_generation set status='active',activated_at=now(),failure_reason=null where id=$1", [target]);
      await client.query(`update knowledge_document d set active_generation_id=$1
        where exists(select 1 from knowledge_asset a join knowledge_source_revision r on r.asset_id=a.id
          where a.document_id=d.id and r.generation_id=$1)`, [target]);
      await client.query(`insert into knowledge_reindex_job(user_id,generation_id,mode,status,batch_size,resume_after,metrics)
        values($1,$2,$3,'completed',$4,$5,$6)`, [OWNER_USER_ID, target, mode, batchSize, resumeAfter ?? null,
        JSON.stringify({ previousGenerationIds: active.rows.map((row) => row.id), selected })]);
    }, "admin");
    console.log(JSON.stringify({ mode, generationId: target, status: "active", batchSize,
      modelCalls: 0, embeddingCalls: 0, cashCost: 0 }, null, 2));
  }
} finally {
  await getPool().end();
}
