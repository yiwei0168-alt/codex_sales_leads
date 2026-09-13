import { hostname } from "node:os";

import nextEnv from "@next/env";

import { claimNextLeadWorkflow, executeClaimedLeadWorkflow } from "../src/lib/leads/workflow/jobs";
import {refreshBillingFxReference} from "../src/lib/billing/fx-reference-repository";
import {refreshOpenRouterSolRateEvidence} from "../src/lib/billing/openrouter-rate-repository";
import {refreshDeepSeekRateEvidence} from "../src/lib/billing/deepseek-rate-repository";

nextEnv.loadEnvConfig(process.cwd());

const once = process.argv.includes("--once");
const workerId = `${hostname()}:${process.pid}`;
const idleDelayMs = Math.max(1_000, Math.min(Number(process.env.LEAD_WORKFLOW_WORKER_POLL_MS ?? 3_000), 30_000));
let nextReferenceCheck=0;

async function runOnce(): Promise<boolean> {
  if(Date.now()>=nextReferenceCheck){
    nextReferenceCheck=Date.now()+5*60*1000;
    try{await refreshBillingFxReference();}
    catch{console.warn(JSON.stringify({event:"billing-reference-maintenance-unavailable",paidRulesUnchanged:true}));}
    try{await refreshOpenRouterSolRateEvidence();}
    catch{console.warn(JSON.stringify({event:"openrouter-rate-maintenance-unavailable",paidRulesUnchanged:true}));}
    try{await refreshDeepSeekRateEvidence();}
    catch{console.warn(JSON.stringify({event:"deepseek-rate-maintenance-unavailable",paidRulesUnchanged:true}));}
  }
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
