import nextEnv from "@next/env";
import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";

nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes("--live");
const checks = [
  { question: "为什么网络产品出口销售需要认证与合规？", offlineQuery: "compliance", expectedTopic: "certification-compliance" },
  { question: "路由器、交换机、LAN 和 WAN 分别是什么？", offlineQuery: "LAN WAN", expectedTopic: "network-foundations" },
  { question: "如何用 4P 方法制定网络产品渠道市场策略？", offlineQuery: "channel", expectedTopic: "channel-go-to-market" },
];
try {
  const industry = (await getKnowledgeStats(OWNER_USER_ID)).collections.find((item) => item.type === "industry");
  const results = [];
  for (const check of checks) {
    const lookup = live ? check.question : check.offlineQuery;
    const embedding = live ? (await embedTexts([lookup]))[0] : null;
    const matches = await hybridSearch(OWNER_USER_ID, lookup, embedding, { collections: ["industry"] }, 8);
    results.push({ ...check, matched: matches.some((match) => match.metadata.topic === check.expectedTopic),
      evidence: matches.map((match) => ({ chunkId: match.id, title: match.title, topic: match.metadata.topic,
        score: match.rankingScore ?? match.score, signals: match.retrievalSignals })) });
  }
  console.log(JSON.stringify({ mode: live ? "live-explicit" : "offline-no-provider", industry, checks: results,
    embeddingCalls: live ? checks.length : 0 }, null, 2));
  if (!industry?.documentCount || results.some((result) => !result.matched)) process.exitCode = 1;
} finally { await getPool().end(); }
