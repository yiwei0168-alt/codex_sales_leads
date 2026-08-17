import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";
import { OWNER_USER_ID } from "../src/lib/auth/config";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const stats = await getKnowledgeStats(OWNER_USER_ID);
  const catalog = await query<{ products: string; router_products: string }>(
    `select count(*)::text as products,
            count(*) filter (where category = 'Wi-Fi Router')::text as router_products
     from product_catalog`,
  );
  const indexes = await query<{ indexname: string }>(
    `select indexname from pg_indexes
     where schemaname = 'public' and indexname in ('knowledge_chunk_embedding_idx', 'knowledge_chunk_search_idx')
     order by indexname`,
  );
  const question = "What are the Ethernet port and Wi-Fi specifications of the Cudy WR3000?";
  const [embedding] = await embedTexts([question]);
  const results = await hybridSearch(OWNER_USER_ID, question, embedding, { collections: ["product"], productId: "WR3000" }, 3);

  console.log(JSON.stringify({
    collections: stats.collections,
    catalog: catalog[0],
    indexes: indexes.map((row) => row.indexname),
    query: { productId: "WR3000", resultCount: results.length },
    results: results.map((result) => ({
      title: result.title,
      score: Number(result.score.toFixed(4)),
      headings: result.headingPath,
      excerpt: result.content.replace(/\s+/g, " ").slice(0, 220),
    })),
  }, null, 2));
  if (stats.collections.length !== 3 || catalog[0]?.products !== "270" || results.length === 0) process.exitCode = 1;
} finally {
  await getPool().end();
}
