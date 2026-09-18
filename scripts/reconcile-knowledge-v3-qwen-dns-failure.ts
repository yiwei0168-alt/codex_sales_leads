import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantTransaction } from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const releaseId = "889a1b5b-9b45-4695-a9b1-e2f2415a028f";
const host = "ws-oknjj10nc0rk5jml.cn-beijing.maas.aliyuncs.com";

let dnsFailure: string | null = null;
try { await lookup(host); }
catch (error) { dnsFailure = error instanceof Error && "code" in error ? String(error.code) : "unknown"; }
assert.ok(dnsFailure === "ENOTFOUND" || dnsFailure === "EAI_AGAIN", `DNS unexpectedly resolved or failed ambiguously: ${dnsFailure}`);

try {
  const result = await tenantTransaction(OWNER_USER_ID, async (client) => {
    const runs = await client.query<{ id:string; status:string; failure_code:string|null }>(
      `select id,status,failure_code from knowledge_embedding_run_v3 where release_id=$1
       and metrics->>'lane'='qwen' order by created_at desc limit 1 for update`, [releaseId]);
    const run = runs.rows[0];
    assert.equal(run?.status, "failed");
    const rows = await client.query<{
      id:string; status:string; reserved_micros:string; settled_micros:string|null;
      occupied_micros:string|null; provider_request_hash:string|null; metrics:Record<string,unknown>;
    }>(`select id,status,reserved_micros::text,settled_micros::text,occupied_micros::text,
        provider_request_hash,metrics from paid_call_reservation where user_id=$1 and operation_id=$2
        and stage='knowledge-v3-qwen-embedding' for update`, [OWNER_USER_ID, run.id]);
    assert.equal(rows.rows.length, 1, "Expected one exact failed first-batch reservation");
    const row = rows.rows[0];
    assert.equal(row.status, "unknown");
    if (row.occupied_micros === "0" && row.settled_micros === "0") return {
      status:"already-reconciled", reservationId:row.id, dnsFailure,
    };
    assert.equal(row.settled_micros, null);
    assert.equal(row.provider_request_hash, null);
    assert.equal(row.metrics.validOutputItems, 0);
    assert.equal(row.metrics.outputBytes, null);
    assert.ok(Number(row.metrics.latencyMs) < 1_000, "Failure was not pre-connect-fast");
    const vectors = await client.query<{ n:number; paid:number }>(`select count(*)::int n,
      count(*) filter(where coalesce(e.input_tokens,0)>0)::int paid from knowledge_chunk_embedding_v3 e
      join knowledge_embedding_profile_v3 p on p.id=e.profile_id join knowledge_chunk_v3 c on c.id=e.chunk_id
      where c.release_id=$1 and p.profile_key='qwen-v4-1536'`, [releaseId]);
    assert.equal(vectors.rows[0].n, 28, "Only the 28 pre-authorized reusable vectors may exist");
    assert.equal(vectors.rows[0].paid, 0, "No provider-generated vector may exist");
    assert.ok(row.occupied_micros === null || row.occupied_micros === row.reserved_micros);
    if (!apply) return { status:"review-only", reservationId:row.id, dnsFailure, reservedMicros:row.reserved_micros };
    const sourceReferenceHash = createHash("sha256").update(
      `knowledge-v3-qwen-dns-no-dispatch:${run.id}:${row.id}:${host}`,
    ).digest("hex");
    await client.query(`insert into paid_cost_observation(user_id,reservation_id,kind,amount_micros,
      source_reference_hash,source_version,complete,uniquely_matched,provider_request_hash,
      occupied_before,occupied_after,metrics) values($1,$2,'verified-unbilled',0,$3,
      'local-dns-no-dispatch-v1',true,true,null,$4,0,$5)`, [OWNER_USER_ID,row.id,sourceReferenceHash,
      row.reserved_micros,JSON.stringify({inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,
        outputTokens:0,apiCredits:0,costUsd:0,retries:0,discardedReasonCounts:{dnsNoDispatch:1},
        utilizationEfficiency:1,usageBoundary:"local-dns-resolution-failed-before-provider-dispatch",
        optimizationOpportunity:"Run authorized provider work only in a network-enabled execution context"})]);
    await client.query(`update paid_call_reservation set settled_micros=0,settled_source='verified-unbilled',
      occupied_micros=0,updated_at=now() where user_id=$1 and id=$2`, [OWNER_USER_ID,row.id]);
    await client.query(`update user_spend_budget set occupied_micros=greatest(0,occupied_micros-$2::bigint),
      updated_at=now() where user_id=$1`, [OWNER_USER_ID,row.reserved_micros]);
    return { status:"reconciled-proven-dns-no-dispatch", reservationId:row.id, dnsFailure,
      releasedMicros:row.reserved_micros };
  }, "admin");
  console.log(JSON.stringify({...result,newProviderCalls:0}));
} finally { await getPool().end(); }
