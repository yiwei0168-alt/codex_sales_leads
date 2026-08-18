import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { getPool, transaction } from "../src/lib/rag/db";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

class VerificationRollback extends Error {}
let verified: { category: string; status: string; current: boolean; shadow: boolean } | undefined;

try {
  await transaction(async (client) => {
    const workspace = await client.query<{ id: string }>(
      `select id from market_workspace where slug = 'global-sales' and status = 'active' order by created_at limit 1`,
    );
    if (!workspace.rows[0]) throw new Error("Production verification requires a global workspace");
    const suffix = randomUUID();
    const company = await client.query<{ id: string }>(
      `insert into sales_company (external_id, canonical_name, domain, country_code, source_kind, record)
       values ($1, 'Verification Fixture', $2, 'ZZ', 'verification-fixture', '{}') returning id`,
      [`verification-${suffix}`, `verification-${suffix}.invalid`],
    );
    await client.query(
      `insert into workspace_company (workspace_id, company_id, account_tier, supply_model, brand_involvement,
         opportunity_stage, priority, market_country_code)
       values ($1, $2, 'Standard', 'TBD', 'Standard', 'Discovered', 'Low', 'ZZ')`,
      [workspace.rows[0].id, company.rows[0].id],
    );
    const email = await client.query<{ id: string }>(
      `insert into company_email_candidate
         (workspace_id, company_id, email, status, source_status, source_provider, confidence)
       values ($1, $2, $3, 'Public', 'Public', 'verification-fixture', 80) returning id`,
      [workspace.rows[0].id, company.rows[0].id, `sales@verification-${suffix}.invalid`],
    );
    const run = await client.query<{ id: string }>(
      `insert into contact_verification_run
         (workspace_id, mode, routine_model, escalation_model, prompt_version, target_count, timeout_ms)
       values ($1, 'automatic', 'fixture', 'fixture', 'fixture-v1', 1, 1000) returning id`,
      [workspace.rows[0].id],
    );
    const decision = await client.query<{ id: string }>(
      `insert into contact_verification_decision
         (run_id, company_id, email_candidate_id, shadow, current, category, lifecycle_status, contact_type,
          confidence_score, role_relevance_score, reachability_score, development_priority, employment_status,
          email_evidence_status, delivery_status, decided_at, published_at)
       values ($1, $2, $3, false, true, 'Official', 'Active', 'GeneralMailbox',
         95, 50, 60, 66, 'Unknown', 'OfficialPublic', 'NotTested', now(), now()) returning id`,
      [run.rows[0].id, company.rows[0].id, email.rows[0].id],
    );
    await client.query(
      `update company_email_candidate set status = 'Verified', verification_decision_id = $2 where id = $1`,
      [email.rows[0].id, decision.rows[0].id],
    );
    const result = await client.query<{ category: string; status: string; current: boolean; shadow: boolean }>(
      `select d.category, em.status, d.current, d.shadow from company_email_candidate em
       join contact_verification_decision d on d.id = em.verification_decision_id where em.id = $1`,
      [email.rows[0].id],
    );
    verified = result.rows[0];
    throw new VerificationRollback("rollback verification fixture");
  });
} catch (error) {
  if (!(error instanceof VerificationRollback)) throw error;
} finally {
  await getPool().end();
}

if (!verified || verified.category !== "Official" || verified.status !== "Verified" || !verified.current || verified.shadow) {
  throw new Error("Production contact verification publication failed");
}
console.log("Production contact verification publication verified in a rolled-back transaction.");
