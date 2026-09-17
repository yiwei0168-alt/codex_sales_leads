import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { buildControlledLexicalQuery } from "../src/lib/knowledge/query-normalizer";
import { getPool, query } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";

nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes("--live");
const checks = [
  { model: "GS1010PE", question: "GS1010PE Ethernet PoE ports and power budget" },
  { model: "LT700", question: "LT700 SIM slots" },
  { model: "WU650", question: "WU650 USB version" },
  { model: "RE1200", question: "RE1200 Ethernet interfaces" },
];
try {
  const stats = await getKnowledgeStats(OWNER_USER_ID);
  const catalog = await query<{ products: string; verifiedFactsV2: string }>(`select
    (select count(*) from product_catalog)::text as products,
    (select count(*) from knowledge_fact where verification_status='verified')::text as "verifiedFactsV2"`);
  const results = [];
  for (const check of checks) {
    const embedding = live ? (await embedTexts([check.question]))[0] : null;
    const matches = await hybridSearch(OWNER_USER_ID, check.question, embedding, {
      collections: ["product"], productId: check.model,
      structuredProductTerms: [check.model], lexicalQuery: buildControlledLexicalQuery(check.question),
    }, 8);
    results.push({ ...check, matched: matches.length > 0, evidence: matches.map((match) => ({
      chunkId: match.id, title: match.title, score: match.rankingScore ?? match.score,
      signals: match.retrievalSignals, facts: match.metadata.structuredFacts,
    })) });
  }
  console.log(JSON.stringify({ mode: live ? "live-explicit" : "offline-no-provider", catalog: catalog[0],
    product: stats.collections.find((item) => item.type === "product"), checks: results,
    embeddingCalls: live ? checks.length : 0 }, null, 2));
  if (Number(catalog[0]?.products ?? 0) === 0 || Number(catalog[0]?.verifiedFactsV2 ?? 0) === 0
    || results.some((result) => !result.matched)) process.exitCode = 1;
} finally { await getPool().end(); }
