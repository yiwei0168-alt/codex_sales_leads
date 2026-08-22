import { hostname } from "node:os";

import nextEnv from "@next/env";

import { claimNextLeadWorkflow, executeClaimedLeadWorkflow } from "../src/lib/leads/workflow/jobs";

nextEnv.loadEnvConfig(process.cwd());

const once = process.argv.includes("--once");
const workerId = `${hostname()}:${process.pid}`;
const idleDelayMs = Math.max(1_000, Math.min(Number(process.env.LEAD_WORKFLOW_WORKER_POLL_MS ?? 3_000), 30_000));

async function runOnce(): Promise<boolean> {
  const claim = await claimNextLeadWorkflow(workerId);
  if (!claim) return false;
  try {
    const result = await executeClaimedLeadWorkflow(claim);
    console.log(JSON.stringify({ jobId: claim.jobId, actionId: claim.actionId, status: "completed", result }));
  } catch (error) {
    console.error(JSON.stringify({ jobId: claim.jobId, actionId: claim.actionId, status: "failed",
      error: error instanceof Error ? error.message : String(error) }));
  }
  return true;
}

do {
  const worked = await runOnce();
  if (once) break;
  if (!worked) await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
} while (true);
