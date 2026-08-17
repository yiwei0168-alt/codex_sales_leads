import nextEnv from "@next/env";
import { getPool } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";
import { OWNER_USER_ID } from "../src/lib/auth/config";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const checks = [
  { question: "为什么网络产品出口销售需要认证与合规？", expectedTopic: "certification-compliance" },
  { question: "路由器、交换机、LAN 和 WAN 分别是什么？", expectedTopic: "network-foundations" },
  { question: "如何用 4P 方法制定网络产品渠道市场策略？", expectedTopic: "channel-go-to-market" },
];

try {
  const stats = await getKnowledgeStats(OWNER_USER_ID);
  const industry = stats.collections.find((item) => item.type === "industry");
  const results = [];
  for (const check of checks) {
    const [embedding] = await embedTexts([check.question]);
    const matches = await hybridSearch(OWNER_USER_ID, check.question, embedding, { collections: ["industry"] }, 3);
    results.push({
      question: check.question,
      expectedTopic: check.expectedTopic,
      matched: matches.some((match) => match.metadata.topic === check.expectedTopic),
      topResults: matches.map((match) => ({
        title: match.title,
        topic: match.metadata.topic,
        score: Number(match.score.toFixed(4)),
        headings: match.headingPath,
        excerpt: match.content.replace(/\s+/g, " ").slice(0, 180),
      })),
    });
  }
  console.log(JSON.stringify({ industry, checks: results }, null, 2));
  if (industry?.documentCount !== 6 || industry.embeddedCount !== industry.chunkCount || results.some((item) => !item.matched)) {
    process.exitCode = 1;
  }
} finally {
  await getPool().end();
}
