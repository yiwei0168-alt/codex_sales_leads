import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());

const tables = [
  "knowledge_release_v3", "knowledge_release_asset_v3", "knowledge_source_revision_v3",
  "knowledge_source_unit_v3", "knowledge_chunk_v3", "knowledge_chunk_entity_v3",
  "knowledge_embedding_profile_v3", "knowledge_chunk_embedding_v3", "knowledge_fact_v3",
  "knowledge_review_queue_v3", "knowledge_release_pointer_v3",
  "knowledge_embedding_run_v3",
];
const catalog = await tenantQuery<{ name: string; rls: boolean; forced: boolean }>(OWNER_USER_ID,
  `select c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as forced
     from pg_class c where c.relname=any($1::text[]) order by c.relname`, [tables]);
const profiles = await tenantQuery<{ key: string; provider: string; model: string; revision: string; dimensions: number }>(OWNER_USER_ID,
  `select profile_key as key,provider,model,model_revision as revision,dimensions
     from knowledge_embedding_profile_v3 order by dimensions`, []);
const indexes = await tenantQuery<{ name: string }>(OWNER_USER_ID,
  `select indexname as name from pg_indexes where schemaname=current_schema()
     and indexname in('knowledge_chunk_embedding_v3_qwen_hnsw','knowledge_chunk_embedding_v3_bge_hnsw') order by indexname`, []);
const functions = await tenantQuery<{ count: number }>(OWNER_USER_ID,
  `select count(*)::int as count from pg_proc where proname='activate_knowledge_release_v3'`, []);
const releaseCounts = await tenantQuery<{ releases: number; pointers: number }>(OWNER_USER_ID,
  `select (select count(*)::int from knowledge_release_v3) as releases,
          (select count(*)::int from knowledge_release_pointer_v3) as pointers`, []);

if (catalog.length !== tables.length || catalog.some((row) => !row.rls || !row.forced)) {
  throw new Error(`v3 RLS mismatch: ${JSON.stringify(catalog)}`);
}
if (profiles.length !== 2
  || !profiles.some((row) => row.model === "text-embedding-v4" && row.dimensions === 1536)
  || !profiles.some((row) => row.model === "BAAI/bge-m3" && row.dimensions === 1024
    && row.revision === "5617a9f61b028005a4858fdac845db406aefb181")) {
  throw new Error(`v3 embedding profile mismatch: ${JSON.stringify(profiles)}`);
}
if (indexes.length !== 2 || functions[0]?.count !== 1) throw new Error("v3 index or activation function missing");

console.log(JSON.stringify({
  mode: "read-only", tables: catalog.length, rlsForced: catalog.filter((row) => row.rls && row.forced).length,
  profiles, hnswIndexes: indexes.map((row) => row.name), activationFunctions: functions[0].count,
  currentState: releaseCounts[0], externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
}, null, 2));
await getPool().end();
