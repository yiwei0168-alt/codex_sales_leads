import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";

nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes("--live");
const checks = [
  { question: "What are Cudy's company and brand capabilities?", offlineQuery: "Cudy brand", expectedTopic: "company-brand-profile" },
  { question: "What OEM and ODM manufacturing capabilities does Cudy provide?", offlineQuery: "OEM ODM", expectedTopic: "oem-odm-manufacturing" },
  { question: "What distribution, delivery, margin, marketing and partner support policies does Cudy offer?", offlineQuery: "distribution policy", expectedTopic: "distribution-policy" },
];
try {
  const company = (await getKnowledgeStats(OWNER_USER_ID)).collections.find((item) => item.type === "company");
  const results = [];
  for (const check of checks) {
    const lookup = live ? check.question : check.offlineQuery;
    const embedding = live ? (await embedTexts([lookup]))[0] : null;
    const matches = await hybridSearch(OWNER_USER_ID, lookup, embedding, { collections: ["company"] }, 8);
    results.push({ ...check, matched: matches.some((match) => match.metadata.topic === check.expectedTopic),
      evidence: matches.map((match) => ({ chunkId: match.id, title: match.title, topic: match.metadata.topic,
        score: match.rankingScore ?? match.score, signals: match.retrievalSignals })) });
  }
  console.log(JSON.stringify({ mode: live ? "live-explicit" : "offline-no-provider", company, checks: results,
    embeddingCalls: live ? checks.length : 0 }, null, 2));
  if (!company?.documentCount || results.some((result) => !result.matched)) process.exitCode = 1;
} finally { await getPool().end(); }
