import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));
const apply = args.get("apply") === "true";
const activateGeneration = args.get("activate-generation");
const rollbackGeneration = args.get("rollback-generation");
const batchSize = Math.min(1000, Math.max(1, Number(args.get("batch-size") ?? 100)));
const resumeAfter = args.get("resume-after") === "true" ? undefined : args.get("resume-after");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (activateGeneration && rollbackGeneration) throw new Error("Choose activate-generation or rollback-generation, not both");
const target = activateGeneration ?? rollbackGeneration;
if (target && !uuid.test(target)) throw new Error("Generation id must be a UUID");
if (target && !apply) throw new Error("Generation switches require the explicit --apply flag");

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

  if (!target) {
    console.log(JSON.stringify({ mode: "dry-run", writes: 0, batchSize, resumeAfter: resumeAfter ?? null,
      generations: summary, modelCalls: 0, embeddingCalls: 0, cashCost: 0 }, null, 2));
  } else {
    const mode = activateGeneration ? "activate" : "rollback";
    const selected = summary.find((row) => row.generationId === target);
    if (!selected) throw new Error("Target generation does not exist");
    if (!(["validated", "active"].includes(selected.status))) throw new Error("Target generation must be validated or active");
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
