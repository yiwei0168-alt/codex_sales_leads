import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CompanyRecord } from "@/lib/domain";
import { marketCode } from "./market-navigation";

export type CompanyMarketRow = {
  workspace_id: string; company_id: string; country_code: string; candidate_id: string;
  record: CompanyRecord; user_overrides: Partial<CompanyRecord>; search_run_id: string | null;
  provenance: "legacy-snapshot" | "legacy-country-conflict" | "assessment" | "user-added";
  revision: string; created_at: string; updated_at: string;
};

export function companyMarketCountry(value: string): string {
  const code = marketCode(value);
  if (!/^[A-Z]{2}$/.test(code) || ["WW", "ZZ"].includes(code)) throw new Error("公司国家必须明确");
  return code;
}

// Opaque candidate IDs are distinct from the reusable company identity ID.
// Resolve IDs in the owner's workspace; never parse an ID to authorize access.
export function companyMarketCandidateId(companyId: string, country: string): string {
  return `market-${companyMarketCountry(country).toLowerCase()}-${createHash("sha256").update(companyId).digest("hex").slice(0, 24)}`;
}

export function materializeCompanyMarket(row: CompanyMarketRow): CompanyRecord {
  return {
    ...row.record, ...row.user_overrides,
    // Identity/market keys cannot be changed by stale legacy overrides.
    id: row.candidate_id, country: row.country_code,
    searchRunId: row.search_run_id ?? undefined,
    recordCreatedAt: row.created_at, updatedAt: row.updated_at,
    assessmentNeedsRefresh: row.provenance === "legacy-country-conflict"
      || Boolean(row.user_overrides.assessmentNeedsRefresh ?? row.record.assessmentNeedsRefresh),
  };
}

export async function findCompanyMarket(client: PoolClient, workspaceId: string, candidateId: string): Promise<CompanyMarketRow | null> {
  const result = await client.query<CompanyMarketRow>(
    `select * from workspace_company_market where workspace_id=$1 and candidate_id=$2`, [workspaceId, candidateId]);
  return result.rows[0] ?? null;
}

// Called inside a tenant transaction. Membership must already exist. Serialize at
// the stable membership row so concurrent first assessments cannot lose edits.
export async function saveCompanyMarketAssessment(client: PoolClient, input: {
  workspaceId: string; companyId: string; country: string; record: CompanyRecord; runId: string;
}): Promise<{ candidateId: string; added: number; updated: number; roleChanged: number }> {
  const country = companyMarketCountry(input.country);
  const membership = await client.query(`select company_id from workspace_company where workspace_id=$1 and company_id=$2 for update`,
    [input.workspaceId, input.companyId]);
  if (!membership.rows[0]) throw new Error("Company membership not found");
  const previous = await client.query<CompanyMarketRow>(
    `select * from workspace_company_market where workspace_id=$1 and company_id=$2 and country_code=$3 for update`,
    [input.workspaceId, input.companyId, country]);
  const current = previous.rows[0];
  const candidateId = current?.candidate_id ?? companyMarketCandidateId(input.companyId, country);
  const record = { ...input.record, id: candidateId, country };
  if (current) {
    // New assessments never reset development activity, even if no classification edit exists.
    record.opportunityStage = current.record.opportunityStage;
    record.nextAction = current.record.nextAction;
    record.nextActionDueAt = current.record.nextActionDueAt;
  }
  await client.query(`insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,search_run_id,provenance)
    values($1,$2,$3,$4,$5,$6,'assessment') on conflict(workspace_id,company_id,country_code) do update set
    record=excluded.record,search_run_id=excluded.search_run_id,provenance='assessment',revision=workspace_company_market.revision+1,updated_at=now()`,
    [input.workspaceId, input.companyId, country, candidateId, JSON.stringify(record), input.runId]);
  return { candidateId, added: current ? 0 : 1, updated: current ? 1 : 0,
    roleChanged: current && !Object.hasOwn(current.user_overrides, "primaryBusinessRole")
      && current.record.primaryBusinessRole !== record.primaryBusinessRole ? 1 : 0 };
}
