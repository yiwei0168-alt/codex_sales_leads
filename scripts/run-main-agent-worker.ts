import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import {performance} from 'node:perf_hooks';
import {databaseDeadline} from '../src/lib/rag/database-deadline';
import { Client } from "@langchain/langgraph-sdk";
import { claimRun, heartbeat, finishRun } from "../src/lib/assistant/main/repository";
import type { ExecutionContext } from "../src/lib/assistant/main/contracts";
import { dispatchDueSchedule } from "../src/lib/assistant/main/schedules";
import {pollDueModelBatch} from "../src/lib/assistant/main/model-batch";
import {getPool} from '../src/lib/rag/db';

nextEnv.loadEnvConfig(process.cwd());
const client = new Client({ apiUrl: process.env.LANGGRAPH_API_URL || "http://127.0.0.1:2024", apiKey: null, callerOptions: { maxRetries: 0 } });
const workerId = `main-agent-${randomUUID()}`;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
try { do {
  await pollDueModelBatch();
  await dispatchDueSchedule();
  const claimStarted=performance.now();
  const run = await claimRun(workerId);
  if (!run) {
    if (process.argv.includes("--once")) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
    continue;
  }
  const context: ExecutionContext = { userId: run.user_id, runId: run.id, leaseToken: run.lease_token, role: "member" };
  // Existing DB lease: 90s, refreshed every 20s. Anchor confirmations before
  // each request so slow responses cannot lengthen the known safe window.
  let confirmedAt=claimStarted,heartbeatPending=false;
  const execution=new AbortController();
  const timer = setInterval(() => {
    if(heartbeatPending)return;heartbeatPending=true;const started=performance.now();
    void heartbeat(context,databaseDeadline(20_000)).then(alive=>{
      if(alive)confirmedAt=started;else execution.abort();
    }).catch(()=>execution.abort()).finally(()=>{heartbeatPending=false;});
  }, 20_000);
  try {
    // A durable inner Postgres Thread is derived from account/run, never from model input.
    await client.runs.wait(null, "main_agent_workflow", { input: { userId: run.user_id, runId: run.id, leaseToken: run.lease_token },signal:execution.signal });
  } catch {
    // No automatic task replay after transport loss; the inner graph may still be running.
    clearInterval(timer);
    const remaining=Math.floor(confirmedAt+90_000-performance.now());
    if(remaining>0)await finishRun(context, "partial", "任务运行连接中断，已保存的结果仍可查询。恢复前会核对执行记录。",databaseDeadline(remaining)).catch(error=>{
      console.warn(JSON.stringify({mainAgentRecovery:'not-confirmed',reason:error?.code==='DATABASE_DEADLINE_EXCEEDED'?'DATABASE_DEADLINE_EXCEEDED':'unavailable'}));
    });
  } finally { clearInterval(timer); }
} while (!stopping && !process.argv.includes("--once"));
} finally {await getPool().end();}
