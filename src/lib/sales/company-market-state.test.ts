import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { CompanyRecord } from "@/lib/domain";
import { companyMarketCandidateId, companyMarketCountry, materializeCompanyMarket, saveCompanyMarketAssessment, type CompanyMarketRow } from "./company-market-state";

const record = { id: "legacy", country: "Mexico", primaryBusinessRole: "SI", opportunityStage: "Discovered", nextAction: "review" } as CompanyRecord;
function row(overrides: Partial<CompanyMarketRow> = {}): CompanyMarketRow {
  return { workspace_id: "workspace", company_id: "identity", country_code: "MX", candidate_id: "legacy",
    record, user_overrides: {}, search_run_id: "run", provenance: "assessment", revision: "1",
    created_at: "2026-01-01", updated_at: "2026-02-01", ...overrides };
}
function clientWith(previous: CompanyMarketRow | null) {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ company_id: "identity" }] })
    .mockResolvedValueOnce({ rows: previous ? [previous] : [] }).mockResolvedValue({ rows: [] });
  return { query, client: { query } as unknown as PoolClient };
}
describe("country business state", () => {
  it("normalizes aliases and gives one identity different candidate IDs in different countries", () => {
    expect(companyMarketCountry("UK")).toBe("GB");
    expect(companyMarketCandidateId("identity", "UK")).toBe(companyMarketCandidateId("identity", "GB"));
    expect(companyMarketCandidateId("identity", "MX")).not.toBe(companyMarketCandidateId("identity", "CO"));
    for (const value of ["all", "unknown", "WW", "ZZ", ""]) expect(() => companyMarketCountry(value)).toThrow();
  });
  it("never lets legacy overrides move a country or change the candidate identity", () => {
    const value = materializeCompanyMarket(row({ user_overrides: { id: "other", country: "Colombia", fitScore: 80 }, provenance: "legacy-country-conflict" }));
    expect(value).toMatchObject({ id: "legacy", country: "MX", fitScore: 80, assessmentNeedsRefresh: true });
  });
  it("adds a new market without updating shared company records", async () => {
    const { query, client } = clientWith(null);
    const result = await saveCompanyMarketAssessment(client, { workspaceId: "workspace", companyId: "identity", country: "CO", record, runId: "new-run" });
    expect(result).toMatchObject({ added: 1, updated: 0, roleChanged: 0 });
    expect(query.mock.calls[0][0]).toContain("for update");
    expect(query.mock.calls[1][1]).toEqual(["workspace", "identity", "CO"]);
    expect(JSON.parse(query.mock.calls[2][1][4])).toMatchObject({ country: "CO", id: result.candidateId });
    expect(query.mock.calls.some(([sql]) => /update sales_company/i.test(sql))).toBe(false);
  });
  it("preserves an existing candidate ID and development progress on reassessment", async () => {
    const { query, client } = clientWith(row({ record: { ...record, opportunityStage: "Contacted", nextAction: "Follow up", nextActionDueAt: "2026-10-01" } }));
    const result = await saveCompanyMarketAssessment(client, { workspaceId: "workspace", companyId: "identity", country: "MX", record: { ...record, primaryBusinessRole: "Distributor" }, runId: "new-run" });
    expect(result).toEqual({ candidateId: "legacy", added: 0, updated: 1, roleChanged: 1 });
    expect(JSON.parse(query.mock.calls[2][1][4])).toMatchObject({ opportunityStage: "Contacted", nextAction: "Follow up", nextActionDueAt: "2026-10-01" });
    expect(query.mock.calls[2][0]).toContain("user_overrides=workspace_company_market.user_overrides - 'assessmentNeedsRefresh'");
  });
  it("does not count a model role change as replacing a user-confirmed role", async () => {
    const { client } = clientWith(row({ user_overrides: { primaryBusinessRole: "SI" } }));
    expect(await saveCompanyMarketAssessment(client, { workspaceId: "workspace", companyId: "identity", country: "MX", record: { ...record, primaryBusinessRole: "Distributor" }, runId: "new-run" })).toMatchObject({ roleChanged: 0 });
  });
  it("refuses to attach business state without an owned membership", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(saveCompanyMarketAssessment({ query } as unknown as PoolClient, { workspaceId: "other", companyId: "identity", country: "MX", record, runId: "run" })).rejects.toThrow("membership");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
