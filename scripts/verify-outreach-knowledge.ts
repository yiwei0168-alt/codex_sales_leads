import nextEnv from "@next/env";

import { searchOutreachKnowledge } from "../src/lib/outreach/knowledge-repository";
import { getPool } from "../src/lib/rag/db";
import { embedTexts } from "../src/lib/rag/openai-provider";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

nextEnv.loadEnvConfig(process.cwd());
const workspace = await resolveTargetWorkspace();
const question = "Cudy distribution partnership strengths and retail market proof for a Dutch distributor";

try {
  const [embedding] = await embedTexts([question]);
  const results = await searchOutreachKnowledge(workspace.ownerId, question, embedding,
    ["NL", "NETHERLANDS", "BENELUX"], ["Distributor", "Retailer"], 5);
  const kinds = new Set(results.map((item) => item.kind));
  for (const required of ["company-profile", "distribution-policy", "market-proof"] as const) {
    if (!kinds.has(required)) throw new Error(`Outreach retrieval omitted required ${required}`);
  }
  if (!results.some((item) => item.marketCodes.includes("NL"))) throw new Error("Dutch market proof was not prioritized");
  console.log(JSON.stringify(results.map((item) => ({
    kind: item.kind, title: item.title, score: Number(item.score.toFixed(3)), priority: item.priorityWeight,
    markets: item.marketCodes,
  })), null, 2));
} finally {
  await getPool().end();
}
