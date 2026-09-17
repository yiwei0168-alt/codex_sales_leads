import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sql = await readFile(resolve("db/migrations/083_knowledge_rag_v3_release.sql"), "utf8");
const required = [
  "knowledge_release_v3", "knowledge_release_asset_v3", "knowledge_source_unit_v3", "knowledge_chunk_v3",
  "knowledge_chunk_entity_v3", "knowledge_embedding_profile_v3", "knowledge_chunk_embedding_v3",
  "vector(1536)", "vector(1024)", "knowledge_fact_v3", "knowledge_review_queue_v3",
  "activate_knowledge_release_v3", "manifest does not cover every registered asset",
  "qwen_embeddings<>m.actual_chunks", "bge_embeddings<>m.actual_chunks", "enable row level security",
];
const missing = required.filter((fragment) => !sql.includes(fragment));
if (missing.length) throw new Error(`v3 schema contract missing: ${missing.join(", ")}`);
console.log(JSON.stringify({
  migration: "083_knowledge_rag_v3_release.sql", requiredContracts: required.length,
  validContracts: required.length, missing: 0, databaseWrites: 0,
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
}, null, 2));
