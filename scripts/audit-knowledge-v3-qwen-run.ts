import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantQuery } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const runId = process.argv.find(arg => arg.startsWith("--run-id="))?.slice("--run-id=".length);
if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("--run-id UUID is required");
try {
  const run = (await tenantQuery<{
    status:string; inputItems:number; validVectors:number; inputTokens:string; requestCount:number;
    latencyMs:string; retries:number; cashCostStatus:string; failureCode:string|null;
  }>(OWNER_USER_ID, `select status,input_items as "inputItems",valid_vectors as "validVectors",
      input_tokens::text as "inputTokens",request_count as "requestCount",latency_ms::text as "latencyMs",
      retry_count as retries,cash_cost_status as "cashCostStatus",failure_code as "failureCode"
    from knowledge_embedding_run_v3 where id=$1`, [runId], "admin"))[0];
  if (!run) throw new Error("Embedding run not found");
  const ledger = (await tenantQuery<{
    calls:number; reported:number; unknown:number; boundExceeded:number; validOutputs:number;
    inputTokens:string; reservedMicros:string; reportedMicros:string|null; settledMicros:string|null;
  }>(OWNER_USER_ID, `select count(*)::int calls,
      count(*) filter(where status='reported')::int reported,
      count(*) filter(where status='unknown')::int unknown,
      count(*) filter(where status='bound-exceeded')::int as "boundExceeded",
      count(*) filter(where metrics->>'validOutputItems'='1')::int as "validOutputs",
      coalesce(sum((metrics->>'inputTokens')::bigint),0)::text as "inputTokens",
      coalesce(sum(reserved_micros),0)::text as "reservedMicros",
      sum(reported_micros)::text as "reportedMicros",sum(settled_micros)::text as "settledMicros"
    from paid_call_reservation where user_id=$1 and operation_id=$2
      and stage='knowledge-v3-qwen-embedding'`, [OWNER_USER_ID,runId], "admin"))[0];
  console.log(JSON.stringify({mode:"read-only",runId,run,ledger,
    interpretation:"reportedMicros/settledMicros null means cash cost remains unknown; reservations are not provider cash bills."}, null, 2));
} finally { await getPool().end(); }
