import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import {databaseDeadline} from '../src/lib/rag/database-deadline';
import { Client } from "@langchain/langgraph-sdk";
import { claimRun, finishRun } from "../src/lib/assistant/main/repository";
import {withAgentRunLease,settleControlledAgentRun} from '../src/lib/assistant/main/agent-run-lease';
import type { ExecutionContext } from "../src/lib/assistant/main/contracts";
import { dispatchDueSchedule } from "../src/lib/assistant/main/schedules";
import {pollDueModelBatch} from "../src/lib/assistant/main/model-batch";
import {getPool,withDatabaseDeadline} from '../src/lib/rag/db';

nextEnv.loadEnvConfig(process.cwd());
const client = new Client({ apiUrl: process.env.LANGGRAPH_API_URL || "http://127.0.0.1:2024", apiKey: null, callerOptions: { maxRetries: 0 } });
const workerId = `main-agent-${randomUUID()}`;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
try { do {
  await withDatabaseDeadline(databaseDeadline(20_000),()=>pollDueModelBatch());
  await withDatabaseDeadline(databaseDeadline(20_000),()=>dispatchDueSchedule());
  const run = await withDatabaseDeadline(databaseDeadline(20_000),()=>claimRun(workerId));
  if (!run) {
    if (process.argv.includes("--once")) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
    continue;
  }
  const context: ExecutionContext = { userId: run.user_id, runId: run.id, leaseToken: run.lease_token, role: "member" };
  try {
    await withAgentRunLease(context,async lease=>{
      try {
        lease.signal.throwIfAborted();
        // Durable inner thread remains account/run-derived; no transport replay.
        await client.runs.wait(null,"main_agent_workflow",{input:{userId:run.user_id,runId:run.id,leaseToken:run.lease_token},signal:lease.signal});
      } catch {
        lease.stop();
        if(await settleControlledAgentRun(context,lease))return;
        const remaining=lease.remainingMs();
        if(remaining>0)await finishRun(context,"partial","任务运行连接中断，已保存的结果仍可查询。恢复前会核对执行记录。",databaseDeadline(remaining));
      }
    });
  } catch(error) {
    console.warn(JSON.stringify({mainAgentRecovery:'not-confirmed',reason:(error as {code?:string})?.code==='DATABASE_DEADLINE_EXCEEDED'?'DATABASE_DEADLINE_EXCEEDED':'unavailable'}));
  }
} while (!stopping && !process.argv.includes("--once"));
} finally {await getPool().end();}
