import nextEnv from "@next/env";
import { getPool } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { getKnowledgeStats, hybridSearch } from "../src/lib/rag/repository";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const checks = [
  { question: "What are Cudy's company and brand capabilities?", expectedTopic: "company-brand-profile" },
  { question: "What OEM and ODM manufacturing capabilities does Cudy provide?", expectedTopic: "oem-odm-manufacturing" },
];

try {
  const stats = await getKnowledgeStats();
  const company = stats.collections.find((item) => item.type === "company");
  const results = [];
  for (const check of checks) {
    const [embedding] = await embedTexts([check.question]);
    const matches = await hybridSearch(check.question, embedding, { collections: ["company"] }, 3);
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
  console.log(JSON.stringify({ company, checks: results }, null, 2));
  if (company?.documentCount !== 2 || company.embeddedCount !== company.chunkCount || results.some((item) => !item.matched)) process.exitCode = 1;
} finally {
  await getPool().end();
}
