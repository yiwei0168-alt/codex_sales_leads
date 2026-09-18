import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { withProductSpend } from "../src/lib/billing/context";
import { embedTextsWithBge } from "../src/lib/rag/bge-client";
import { getPool, tenantQuery, tenantTransaction } from "../src/lib/rag/db";
import { embedTextsWithUsage } from "../src/lib/rag/openai-provider";

nextEnv.loadEnvConfig(process.cwd());
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("="); return [key, rest.join("=") || "true"];
}));
const lane = args.get("lane");
const write = args.get("write") === "true";
const confirmPaidQwen = args.get("confirm-paid-qwen") === "true";
const releaseId = args.get("release-id");
const maxChunks = args.has("max-chunks") ? Number(args.get("max-chunks")) : undefined;
const bgeBatchSize = args.has("bge-batch-size") ? Number(args.get("bge-batch-size")) : 16;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (lane && !["qwen", "bge"].includes(lane)) throw new Error("--lane must be qwen or bge");
if (releaseId && !uuid.test(releaseId)) throw new Error("--release-id must be a UUID");
if (write && !lane) throw new Error("--write requires --lane=qwen or --lane=bge");
if (write && lane === "qwen" && !confirmPaidQwen) {
  throw new Error("Qwen writes require explicit --confirm-paid-qwen after review of this release dry-run");
}
if (maxChunks !== undefined && (!Number.isSafeInteger(maxChunks) || maxChunks < 1)) throw new Error("--max-chunks must be positive");
if (!Number.isSafeInteger(bgeBatchSize) || bgeBatchSize < 1 || bgeBatchSize > 64) throw new Error("--bge-batch-size must be within 1..64");

function vectorLiteral(vector: number[]): string { return `[${vector.join(",")}]`; }

try {
  const releases = await tenantQuery<{ id:string; releaseKey:string; status:string }>(OWNER_USER_ID,
    `select id,release_key as "releaseKey",status from knowledge_release_v3
      where ($1::uuid is null or id=$1) and status in('building','validated') order by created_at desc limit 1`,
    [releaseId ?? null], "admin");
  const release = releases[0];
  if (!release) throw new Error("No building/validated v3 release is available");
  const stats = (await tenantQuery<{
    chunks:string; qwenVectors:string; bgeVectors:string; reusableQwen:string; estimatedTokens:string;
  }>(OWNER_USER_ID, `select count(*)::text chunks,
      count(*) filter(where exists(select 1 from knowledge_chunk_embedding_v3 e join knowledge_embedding_profile_v3 p on p.id=e.profile_id where e.chunk_id=c.id and p.profile_key='qwen-v4-1536'))::text as "qwenVectors",
      count(*) filter(where exists(select 1 from knowledge_chunk_embedding_v3 e join knowledge_embedding_profile_v3 p on p.id=e.profile_id where e.chunk_id=c.id and p.profile_key='bge-m3-1024'))::text as "bgeVectors",
      count(*) filter(where not exists(select 1 from knowledge_chunk_embedding_v3 e join knowledge_embedding_profile_v3 p on p.id=e.profile_id where e.chunk_id=c.id and p.profile_key='qwen-v4-1536') and exists(
        select 1 from knowledge_chunk_v2 old join knowledge_index_generation g on g.id=old.generation_id
        where old.content_sha256=encode(digest(c.canonical_embedding_text,'sha256'),'hex') and old.embedding is not null
          and g.embedding_model='text-embedding-v4' and g.embedding_dimensions=1536))::text as "reusableQwen",
      coalesce(sum(c.token_estimate),0)::text as "estimatedTokens"
    from knowledge_chunk_v3 c where c.release_id=$1`, [release.id], "admin"))[0];
  const counts = Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value)]));
  const missingQwen = counts.chunks - counts.qwenVectors;
  const missingBge = counts.chunks - counts.bgeVectors;
  if (!write) {
    const qwenToCall = Math.max(0, missingQwen-counts.reusableQwen);
    const boundedQwen = maxChunks === undefined ? qwenToCall : Math.min(qwenToCall,maxChunks);
    const bounded = maxChunks === undefined ? null : (await tenantQuery<{items:string;estimatedTokens:string}>(OWNER_USER_ID,
      `select count(*)::text items,coalesce(sum(selected.token_estimate),0)::text as "estimatedTokens" from(
        select c.token_estimate from knowledge_chunk_v3 c where c.release_id=$1
          and not exists(select 1 from knowledge_chunk_embedding_v3 e join knowledge_embedding_profile_v3 p on p.id=e.profile_id
            where e.chunk_id=c.id and p.profile_key='qwen-v4-1536')
          and not exists(select 1 from knowledge_chunk_v2 old join knowledge_index_generation g on g.id=old.generation_id
            where old.content_sha256=encode(digest(c.canonical_embedding_text,'sha256'),'hex') and old.embedding is not null
              and g.embedding_model='text-embedding-v4' and g.embedding_dimensions=1536)
        order by c.id limit $2)selected`,[release.id,boundedQwen],"admin"))[0];
    console.log(JSON.stringify({ mode:"dry-run", release, ...counts, missingQwen, missingBge,
      qwenToCall, estimatedQwenRequests: Math.ceil(qwenToCall/10),
      authorizationBound:maxChunks??null,boundedQwenToCall:boundedQwen,
      boundedEstimatedTokens:bounded?Number(bounded.estimatedTokens):counts.estimatedTokens,
      boundedEstimatedQwenRequests:Math.ceil(boundedQwen/10),
      estimatedBgeBatches: Math.ceil(missingBge/bgeBatchSize), bgeBatchSize, qwenCashCost:"unknown",
      bgeApiCashCost:0, bgeInfrastructureCost:"unknown", writes:0 }, null, 2));
    process.exitCode = 0;
  } else {
    const profileKey = lane === "qwen" ? "qwen-v4-1536" : "bge-m3-1024";
    const profiles = await tenantQuery<{id:string;modelRevision:string;dimensions:number;artifactSha256:string|null}>(OWNER_USER_ID,
      `select id,model_revision as "modelRevision",dimensions,artifact_sha256 as "artifactSha256" from knowledge_embedding_profile_v3 where profile_key=$1 and enabled`, [profileKey], "admin");
    const profile = profiles[0]; if (!profile) throw new Error(`Enabled profile ${profileKey} not found`);
    if (lane === "bge" && profile.modelRevision !== "5617a9f61b028005a4858fdac845db406aefb181") throw new Error("BGE profile revision is not pinned");
    if (lane === "bge" && profile.artifactSha256 !== "4f2ef0a2c9b4250206e9ddc202a2bbe01718aacd2a06f87e3e09887b2a076c28") throw new Error("BGE profile artifact hash is not pinned");
    const batchSize = lane === "qwen" ? 10 : bgeBatchSize;
    const run = await tenantTransaction(OWNER_USER_ID, async (client) => (await client.query<{id:string}>(
      `insert into knowledge_embedding_run_v3(release_id,profile_id,status,cash_cost_status,metrics)
       values($1,$2,'running',$3,$4) returning id`, [release.id,profile.id,lane === "bge" ? "zero" : "unknown",
        JSON.stringify({lane,modelRevision:profile.modelRevision,dimensions:profile.dimensions,maxChunks:maxChunks??null})])).rows[0], "admin");
    let processed=0,reusedVectors=0,inputTokens=0,requestCount=0,latencyMs=0,lastId:string|null=null;
    try {
      if(lane==="qwen"){
        const reused=await tenantQuery<{id:string}>(OWNER_USER_ID,`insert into knowledge_chunk_embedding_v3(
            chunk_id,profile_id,content_sha256,qwen_embedding,bge_embedding,input_tokens,latency_ms,retry_count)
          select c.id,$2,encode(digest(c.canonical_embedding_text,'sha256'),'hex'),source.embedding,null,0,0,0 from knowledge_chunk_v3 c
          join lateral(select old.embedding from knowledge_chunk_v2 old join knowledge_index_generation g on g.id=old.generation_id
            where old.content_sha256=encode(digest(c.canonical_embedding_text,'sha256'),'hex') and old.embedding is not null
              and g.embedding_model='text-embedding-v4' and g.embedding_dimensions=1536
            order by(g.status='active')desc,g.created_at desc limit 1)source on true
          where c.release_id=$1 and not exists(select 1 from knowledge_chunk_embedding_v3 e where e.chunk_id=c.id and e.profile_id=$2)
          on conflict(chunk_id,profile_id)do nothing returning chunk_id as id`,[release.id,profile.id],"admin");
        reusedVectors=reused.length;
        await tenantQuery(OWNER_USER_ID,`update knowledge_embedding_run_v3 set metrics=metrics||$2::jsonb,updated_at=now() where id=$1`,
          [run.id,JSON.stringify({reusedVectors})],"admin");
      }
      while (maxChunks === undefined || processed < maxChunks) {
        const limit=Math.min(batchSize,maxChunks===undefined?batchSize:maxChunks-processed);
        const chunks=await tenantQuery<{id:string;text:string;embeddingTextSha256:string}>(OWNER_USER_ID,
          `select c.id,c.canonical_embedding_text as text,encode(digest(c.canonical_embedding_text,'sha256'),'hex') as "embeddingTextSha256" from knowledge_chunk_v3 c
           where c.release_id=$1 and not exists(select 1 from knowledge_chunk_embedding_v3 e where e.chunk_id=c.id and e.profile_id=$2)
             and($3::uuid is null or c.id>$3) order by c.id limit $4`,[release.id,profile.id,lastId,limit],"admin");
        if(!chunks.length)break;
        const started=Date.now();
        const result=lane==="bge"
          ? {embeddings:await embedTextsWithBge(chunks.map(chunk=>chunk.text),fetch,120_000),usage:[]}
          : await withProductSpend(OWNER_USER_ID,"knowledge-v3-qwen-embedding",()=>embedTextsWithUsage(chunks.map(chunk=>chunk.text)),run.id);
        latencyMs+=Date.now()-started;requestCount+=lane==="qwen"?Math.ceil(chunks.length/10):1;
        inputTokens+=result.usage.reduce((sum,item)=>sum+item.inputTokens,0);
        if(result.embeddings.length!==chunks.length||result.embeddings.some(vector=>vector.length!==profile.dimensions))throw new Error("Embedding batch shape mismatch");
        await tenantTransaction(OWNER_USER_ID,async(client)=>{
          for(const [index,chunk] of chunks.entries())await client.query(
            `insert into knowledge_chunk_embedding_v3(chunk_id,profile_id,content_sha256,qwen_embedding,bge_embedding,input_tokens,latency_ms)
             values($1,$2,$3,$4::vector,$5::vector,$6,$7) on conflict(chunk_id,profile_id) do nothing`,
            [chunk.id,profile.id,chunk.embeddingTextSha256,lane==="qwen"?vectorLiteral(result.embeddings[index]):null,lane==="bge"?vectorLiteral(result.embeddings[index]):null,
             lane==="qwen"?result.usage.flatMap(item=>Array(item.inputItems).fill(Math.ceil(item.inputTokens/item.inputItems)))[index]??null:null,Math.ceil((Date.now()-started)/chunks.length)]);
          processed+=chunks.length;lastId=chunks.at(-1)?.id??lastId;
          await client.query(`update knowledge_embedding_run_v3 set resume_after=$2,input_items=$3,valid_vectors=$3,input_tokens=$4,request_count=$5,latency_ms=$6,updated_at=now() where id=$1`,[run.id,lastId,processed,inputTokens,requestCount,latencyMs]);
        },"admin");
      }
      await tenantTransaction(OWNER_USER_ID,async(client)=>{
        await client.query("update knowledge_embedding_run_v3 set status='completed',updated_at=now() where id=$1",[run.id]);
        await client.query(`update knowledge_release_asset_v3 m set qwen_embeddings=x.qwen,bge_embeddings=x.bge,updated_at=now()
          from(select sr.asset_id,count(distinct e.chunk_id)filter(where p.profile_key='qwen-v4-1536')::int qwen,
            count(distinct e.chunk_id)filter(where p.profile_key='bge-m3-1024')::int bge
            from knowledge_source_revision_v3 sr join knowledge_chunk_v3 c on c.source_revision_id=sr.id
            left join knowledge_chunk_embedding_v3 e on e.chunk_id=c.id left join knowledge_embedding_profile_v3 p on p.id=e.profile_id
            where sr.release_id=$1 group by sr.asset_id)x where m.release_id=$1 and m.asset_id=x.asset_id`,[release.id]);
      },"admin");
      console.log(JSON.stringify({mode:"write",lane,releaseId:release.id,runId:run.id,processed,reusedVectors,inputTokens,requestCount,latencyMs,
        retries:0,cashCost:lane==="bge"?0:"unknown",infrastructureCost:lane==="bge"?"unknown":undefined},null,2));
    }catch(error){await tenantQuery(OWNER_USER_ID,`update knowledge_embedding_run_v3 set status='failed',failure_code=$2,updated_at=now() where id=$1`,[run.id,error instanceof Error?error.name:"unknown"],"admin").catch(()=>undefined);throw error;}
  }
} finally { await getPool().end(); }
