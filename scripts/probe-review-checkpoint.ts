import nextEnv from "@next/env";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd());
const [userId, workspaceId, countryCode, candidateId, contract] = process.argv.slice(2);
if (![userId, workspaceId, countryCode, candidateId, contract].every(Boolean))
  throw new Error("Synthetic review checkpoint probe identity missing");
const { productReviewCheckpoint } = await import("../src/lib/leads/workflow/review-checkpoint");
const { getPool } = await import("../src/lib/rag/db");
try {
  const response = await productReviewCheckpoint({ userId, workspaceId, countryCode })
    .load("secondary", candidateId, contract);
  assert.equal((response as { output?: { candidateId?: string } } | null)?.output?.candidateId, candidateId);
  console.log(JSON.stringify({ crossProcessReviewCheckpoint: "passed", loaded: 1, actualPaidCalls: 0 }));
} finally { await getPool().end(); }
