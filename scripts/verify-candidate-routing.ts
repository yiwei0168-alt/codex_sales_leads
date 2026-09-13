import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { persistCandidateRoutes, routeCorrectedCandidates } from "../src/lib/leads/workflow/candidate-routing";
import { correctedCandidate, plan } from "./workflow-recovery-fixtures";
import { saveDiscoveryCheckpoint, loadDiscoveryCheckpoint } from "../src/lib/leads/workflow/discovery-checkpoint";
import { createHybridDiscoverySession, type HybridSearchCallTelemetry } from "../src/lib/leads/workflow/hybrid-discovery-executor";
import { snapshotDiscoverySession } from "../src/lib/leads/workflow/discovery-session";
import { persistHybridSearchCall, persistDiscoveryRoundSummary } from "../src/lib/leads/workflow/discovery";
import { withSpendContext } from "../src/lib/billing/context";

const application = process.env.DATABASE_URL, migration = process.env.DATABASE_MIGRATION_URL;
if (!application || !migration) throw new Error("Both database connections required");
const a = new URL(application), m = new URL(migration);
if (a.hostname !== m.hostname || (a.port || "5432") !== (m.port || "5432") || a.pathname !== m.pathname) throw new Error("Database target mismatch");
const admin = new Pool({ connectionString: databaseConnectionString(migration), ssl: databaseSslConfiguration(migration) });
const userId = randomUUID(), workspaceId = randomUUID(), runId = randomUUID();
const email = `routing-verification-${userId}@example.invalid`;
let created = false;
try {
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Routing fixture','member','disabled')", [userId, email]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Routing fixture','Global','WW','Isolated verification')", [workspaceId, userId]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,metadata) values($1,$2,'synthetic',1,'DE',$3)", [runId, workspaceId, JSON.stringify({ preserved: true })]);
    await client.query("commit"); created = true;
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  const shifted = { ...correctedCandidate, queryFamily: "services" as const };
  const routes = routeCorrectedCandidates([shifted], { ...plan, roles: ["Distributor"] }).routes;
  const input = { userId, workspaceId, runId, countryCode: "DE", routes };
  await persistCandidateRoutes(input);
  await persistCandidateRoutes(input);
  let rows = await tenantQuery<{ metadata: Record<string, unknown> }>(userId, "select metadata from lead_search_run where id=$1", [runId]);
  assert.deepEqual(rows[0].metadata, { preserved: true, candidateRouting: routes });
  for (const changed of [{ countryCode: "CO" }, { workspaceId: randomUUID() }, { userId: randomUUID() }]) {
    await assert.rejects(persistCandidateRoutes({ ...input, ...changed }), /ownership or country mismatch/);
  }
  const outside = routeCorrectedCandidates([shifted], { ...plan, roles: ["SI"] }).routes;
  await persistCandidateRoutes({ ...input, routes: outside });
  rows = await tenantQuery(userId, "select metadata from lead_search_run where id=$1", [runId]);
  assert.deepEqual(rows[0].metadata, { preserved: true, candidateRouting: outside });
  const actionId = randomUUID(), graphThreadId = `fixture:${randomUUID()}`;
  await tenantQuery(userId, "update lead_search_run set metadata=metadata || $2::jsonb where id=$1", [runId, JSON.stringify({ assistantActionId: actionId, graphThreadId })]);
  const owner = { userId, workspaceId, runId, countryCode: "DE", actionId, graphThreadId };
  const saved = { version: "discovery-call-checkpoint-v1" as const, contract: "fixture-contract",
    session: snapshotDiscoverySession(createHybridDiscoverySession(), "fixture-dependency"),
    round: { round: 0, targetPool: 1, initiallyExcludedDomains: [], calls: [], gated: [], rejected: [], modelUsage: [], warnings: [], noValueByTrack: [], failedByTrack: [] } };
  await saveDiscoveryCheckpoint(owner, saved);
  assert.deepEqual(await loadDiscoveryCheckpoint(owner, "fixture-contract", 0), saved);
  await assert.rejects(loadDiscoveryCheckpoint({ ...owner, actionId: randomUUID() }, "fixture-contract", 0), /ownership mismatch/);
  await assert.rejects(loadDiscoveryCheckpoint(owner, "changed-contract", 0), /contract mismatch/);
  assert.equal(await loadDiscoveryCheckpoint(owner, "new-round-contract", 1), undefined);
  const call: HybridSearchCallTelemetry = { callKey: "fixture", callFingerprint: "f".repeat(64), queryClusterKey: "a".repeat(64),
    route: { category: "distribution", track: "strategic", sequence: 0, provider: "brave", engine: "brave", mechanism: "web-index", trigger: "core", invocationReason: "fixture" },
    query: "synthetic fixture", status: "completed", requestedResults: 1, rawResults: 0, normalizedCompanies: 0,
    newUniqueCompanies: 0, existingCompanyHits: 0, rejectedResults: 0, paidSearchCredits: 1, requestCount: 1, groundingQueries: 0,
    inputTokens: 0, outputTokens: 0, latencyMs: 0, retryCount: 0, fallbackUsed: false, cacheStatus: "miss", discardedReasonCounts: {}, items: [] };
  await withSpendContext({ userId, operationId: actionId, stage: "synthetic-discovery-persistence" }, async () => {
    await Promise.all([persistHybridSearchCall(runId, plan, call), persistHybridSearchCall(runId, plan, call)]);
    const summary = [runId, 1, 0, 0, 1, JSON.stringify({ fixtureRoundComplete: true }), "0"];
    await Promise.all([persistDiscoveryRoundSummary(summary), persistDiscoveryRoundSummary(summary)]);
  });
  const totals = await tenantQuery<{ calls: string; queries: number; credits: number }>(userId,
    "select query_count as queries,credits_used as credits,(select count(*)::text from lead_search_provider_call where run_id=$1) as calls from lead_search_run where id=$1", [runId]);
  assert.deepEqual(totals, [{ queries: 1, credits: 1, calls: "1" }]);
  console.log(JSON.stringify({ discoveryCheckpointSql: true, recoveryContractAndOwnershipChecked: true,
    concurrentTelemetryIdempotent: true, roundCreditsCountedOnce: true, realProviderCalls: 0 }));
  console.log(JSON.stringify({ realRoutingSql: true, repeatedWritesIdempotent: true, unrelatedMetadataPreserved: true,
    wrongUserWorkspaceCountryRejected: true, unscoredOutOfScopeRetained: true, realProviderCalls: 0 }));
} finally {
  if (created) {
    const client = await admin.connect();
    try {
      await client.query("begin");
      const owner = await client.query("select id from app_user where id=$1 and email=$2 for update", [userId, email]);
      assert.equal(owner.rowCount, 1);
      await client.query("delete from lead_search_run where id=$1 and workspace_id=$2", [runId, workspaceId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
      await client.query("delete from app_user where id=$1 and email=$2", [userId, email]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  await admin.end(); await getPool().end();
}
