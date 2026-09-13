import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getPool, tenantQuery } from "../src/lib/rag/db";
import { persistCandidateRoutes, routeCorrectedCandidates } from "../src/lib/leads/workflow/candidate-routing";
import { correctedCandidate, plan } from "./workflow-recovery-fixtures";

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
