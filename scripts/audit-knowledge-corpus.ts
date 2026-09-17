import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getRagConfig } from "../src/lib/rag/config";
import { knowledgeEvaluationCorpusHash } from "../src/lib/knowledge/evaluation/corpus";

nextEnv.loadEnvConfig(process.cwd());
const config = getRagConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required for the read-only corpus audit");

const manifests = [
  "knowledge/product/processed/product-catalog.json",
  "knowledge/company/processed/company-manifest.json",
  "knowledge/industry/processed/industry-manifest.json",
];
const manifestHashes: Record<string, string> = {};
for (const file of manifests) {
  const content = await readFile(resolve(file));
  manifestHashes[file] = createHash("sha256").update(content).digest("hex");
}

const productCatalog = JSON.parse(await readFile(resolve(manifests[0]), "utf8")) as {
  allProducts: Array<{ model: string; description: string }>;
  datasheets: Array<{ sourceFile: string; knowledgeFile?: string; pageCount?: number; relatedModels?: string[] }>;
  catalogDocuments: unknown[];
  references: unknown[];
};
let missingSourceFiles = 0;
let missingProcessedFiles = 0;
let omittedTextPages = 0;
for (const sheet of productCatalog.datasheets) {
  await stat(resolve("knowledge/product", sheet.sourceFile)).catch(() => { missingSourceFiles += 1; });
  if (!sheet.knowledgeFile) { missingProcessedFiles += 1; continue; }
  const processed = await readFile(resolve(sheet.knowledgeFile), "utf8").catch(() => undefined);
  if (!processed) { missingProcessedFiles += 1; continue; }
  const extractedPages = [...processed.matchAll(/^## Page \d+/gm)].length;
  omittedTextPages += Math.max(0, (sheet.pageCount ?? 0) - extractedPages);
}

const pool = new Pool({
  connectionString: databaseConnectionString(config.databaseUrl),
  ssl: databaseSslConfiguration(config.databaseUrl), connectionTimeoutMillis: 5_000,
});
const client = await pool.connect();
try {
  await client.query("begin read only");
  const role = process.env.DATABASE_APPLICATION_ROLE?.trim() || "network_copilot_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(role)) throw new Error("Invalid DATABASE_APPLICATION_ROLE");
  await client.query(`set local role "${role}"`);
  await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)", [OWNER_USER_ID]);
  const corpus = await client.query(`select c.slug,d.source_type,count(distinct d.id)::int documents,
    count(ch.id)::int chunks,count(ch.embedding)::int embedded,
    count(distinct d.id) filter(where d.source_url is null)::int missing_source_url
    from knowledge_document d join knowledge_collection c on c.id=d.collection_id
    left join knowledge_chunk ch on ch.document_id=d.id
    where d.status='active' and d.visibility='shared'
    group by c.slug,d.source_type order by c.slug,d.source_type`);
  const facts = await client.query(`select count(*)::int facts,count(distinct model)::int models,
    count(distinct fact_key)::int fact_keys,
    count(*) filter(where verification_status='verified')::int verified
    from product_fact`);
  const quality = await client.query(`select
    count(distinct d.id) filter(where ch.content ilike '%Visual-only or no extractable text%'
      or ch.content ilike '%No extractable text.%')::int documents_with_placeholders,
    count(distinct d.product_id) filter(where d.source_type='public-product-datasheet')::int datasheet_entities
    from knowledge_document d left join knowledge_chunk ch on ch.document_id=d.id
    where d.status='active' and d.visibility='shared'`);
  const versions = await client.query(`select count(*)::int entities_with_multiple_datasheets from (
    select d.product_id from knowledge_document d where d.status='active' and d.visibility='shared'
      and d.source_type='public-product-datasheet' group by d.product_id having count(*)>1) versions`);
  await client.query("rollback");
  console.log(JSON.stringify({
    mode: "read-only", generatedAt: new Date().toISOString(), corpus: corpus.rows,
    structuredFacts: facts.rows[0], quality: quality.rows[0], versions: versions.rows[0],
    manifests: { hashes: manifestHashes, products: productCatalog.allProducts.length,
      datasheets: productCatalog.datasheets.length, catalogDocuments: productCatalog.catalogDocuments.length,
      references: productCatalog.references.length, missingSourceFiles, missingProcessedFiles, omittedTextPages },
    evaluationCorpusSha256: knowledgeEvaluationCorpusHash(),
    externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
