import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { Client } from "@langchain/langgraph-sdk";
import { claimRun, heartbeat, finishRun } from "../src/lib/assistant/main/repository";
import type { ExecutionContext } from "../src/lib/assistant/main/contracts";

nextEnv.loadEnvConfig(process.cwd());
const client = new Client({ apiUrl: process.env.LANGGRAPH_API_URL || "http://127.0.0.1:2024", apiKey: null, callerOptions: { maxRetries: 0 } });
const workerId = `main-agent-${randomUUID()}`;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
do {
  const run = await claimRun(workerId);
  if (!run) {
    if (process.argv.includes("--once")) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
    continue;
  }
  const context: ExecutionContext = { userId: run.user_id, runId: run.id, leaseToken: run.lease_token, role: "member" };
  const timer = setInterval(() => { void heartbeat(context).catch(() => false); }, 20_000);
  try {
    // A durable inner Postgres Thread is derived from account/run, never from model input.
    await client.runs.wait(null, "main_agent_workflow", { input: { userId: run.user_id, runId: run.id, leaseToken: run.lease_token } });
  } catch {
    // No automatic task replay after transport loss; the inner graph may still be running.
    await finishRun(context, "partial", "任务运行连接中断，已保存的结果仍可查询。恢复前会核对执行记录。").catch(() => undefined);
  } finally { clearInterval(timer); }
} while (!stopping && !process.argv.includes("--once"));
