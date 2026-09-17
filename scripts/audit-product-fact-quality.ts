import nextEnv from "@next/env";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { getRagConfig } from "../src/lib/rag/config";

nextEnv.loadEnvConfig(process.cwd());
const config = getRagConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required for the read-only product fact audit");

const pool = new Pool({
  connectionString: databaseConnectionString(config.databaseUrl),
  ssl: databaseSslConfiguration(config.databaseUrl),
  connectionTimeoutMillis: 5_000,
});
const client = await pool.connect();
try {
  await client.query("begin read only");
  const role = process.env.DATABASE_APPLICATION_ROLE?.trim() || "network_copilot_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(role)) throw new Error("Invalid DATABASE_APPLICATION_ROLE");
  await client.query(`set local role "${role}"`);
  const result = await client.query<{ id: string; reason: string }>(`
    select id, reason from (
      select id, 'decimal-rate-as-cellular'::text reason from product_fact
      where fact_key='cellular_generation' and fact_value='5G'
        and evidence_excerpt ~* '(^|[^0-9])2\\.5[[:space:]]*G'
      union
      select id, 'plus-interface-reduced'::text reason from product_fact
      where fact_key='interface_type' and fact_value='SFP' and evidence_excerpt ~* 'SFP\\+'
      union
      select id, 'negated-capability-positive'::text reason from product_fact
      where fact_key in ('poe_capability','security_feature','network_feature')
        and evidence_excerpt ~* '(no|not|without|unsupported|不支持|不含|未配备)'
    ) suspect order by reason,id`);
  const counts = result.rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.reason] = (summary[row.reason] ?? 0) + 1;
    return summary;
  }, {});
  await client.query("rollback");
  console.log(JSON.stringify({
    mode: "read-only", legacyFactsRemainUnchanged: true, reembeddingTriggered: false,
    suspectCount: result.rows.length, reasonCounts: counts,
    recomputeIds: result.rows.map((row) => row.id),
    recomputeIdSha256: createHash("sha256").update(result.rows.map((row) => row.id).join("\n")).digest("hex"),
    externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
