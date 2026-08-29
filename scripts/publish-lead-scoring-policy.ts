import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";

import { OWNER_USER_ID } from "../src/lib/auth/config";
import { getPool, tenantTransaction } from "../src/lib/rag/db";
import { leadScoringPolicySchema, scoringPolicyChecksum } from "../src/lib/leads/scoring-policy";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const policyPath = resolve(process.argv[2] ?? "config/lead-scoring/policy-v2.0.0.json");
const policy = leadScoringPolicySchema.parse(JSON.parse(await readFile(policyPath, "utf8")));
const checksum = scoringPolicyChecksum(policy);

try {
  const policyId = await tenantTransaction(OWNER_USER_ID, async (client) => {
    await client.query(
    `update lead_scoring_policy set status='retired'
      where policy_key=$1 and status='active' and version<>$2`,
    [policy.policyKey, policy.version],
    );
    const rows = await client.query<{ id: string }>(
    `insert into lead_scoring_policy (
       policy_key, version, schema_version, status, policy, checksum, change_summary, created_by, activated_at
     ) values ($1,$2,$3,'active',$4,$5,$6,$7,now())
     on conflict (policy_key, version) do update set
       schema_version=excluded.schema_version, status='active', policy=excluded.policy,
       checksum=excluded.checksum, change_summary=excluded.change_summary,
       activated_at=coalesce(lead_scoring_policy.activated_at, now())
     returning id`,
    [policy.policyKey, policy.version, policy.schemaVersion, JSON.stringify(policy), checksum,
      "Confirmed Cudy role-aware 50/15/15/10/10 scoring policy", OWNER_USER_ID],
    );
    return rows.rows[0].id;
  }, "admin");
  console.log(JSON.stringify({ policyId, version: policy.version, checksum }, null, 2));
} finally {
  await getPool().end();
}
