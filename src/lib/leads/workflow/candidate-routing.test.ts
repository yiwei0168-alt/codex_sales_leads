import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rag/db", () => ({ tenantQuery: vi.fn() }));
import { tenantQuery } from "@/lib/rag/db";
import { routeCorrectedCandidates, persistCandidateRoutes } from "./candidate-routing";
import { correctedCandidate, assessment, plan } from "../../../../scripts/workflow-recovery-fixtures";

beforeEach(() => vi.mocked(tenantQuery).mockReset());
describe("requested-scope company routing", () => {
  const shifted = { ...correctedCandidate, queryFamily: "services" as const, queryRoles: ["SI" as const] };
  it("transfers into an originally requested role with the same evidence and correction", () => {
    const result = routeCorrectedCandidates([shifted], { ...plan, roles: ["SI", "Distributor"] });
    expect(result.queued).toEqual([shifted]);
    expect(result.queued[0]).toBe(shifted);
    expect(result.routes[0]).toMatchObject({ sourceFamily: "services", targetFamily: "distribution", status: "transferred" });
  });
  it("retains out-of-scope status and never expands to another subtype in the requested family", () => {
    for (const roles of [["SI"] as const, ["VAD"] as const]) {
      const result = routeCorrectedCandidates([shifted], { ...plan, roles: [...roles] });
      expect(result.queued).toEqual([]); expect(result.routes[0].status).toBe("out-of-scope");
    }
  });
  it("deduplicates across lanes and reuses the already completed company identity", () => {
    const duplicate = { ...shifted, candidateId: "duplicate", domain: "www.example.de" };
    const result = routeCorrectedCandidates([duplicate, shifted], plan, [assessment]);
    expect(result.queued).toEqual([shifted]);
    expect(result.routes.find(route => route.candidateId === "duplicate"))
      .toMatchObject({ status: "duplicate", canonicalCandidateId: shifted.candidateId });
    expect(new Set(result.routes.map(route => route.transferKey)).size).toBe(1);
    expect(routeCorrectedCandidates([shifted], { ...plan, countryCode: "CO" }).routes[0].transferKey)
      .not.toBe(result.routes[0].transferKey);
  });
  it("does not pick a main role from conflicting company corrections", () => {
    const conflict = { ...shifted, candidateId: "conflict", correction: { ...shifted.correction,
      resolvedRoles: ["SI" as const], resolvedFamilies: ["services" as const], primaryRole: "SI" as const, primaryFamily: "services" as const } };
    const result = routeCorrectedCandidates([shifted, conflict], plan);
    expect(result.queued).toEqual([]);
    expect(result.routes.every(route => route.status === "pending-role")).toBe(true);
  });
  it("persists unscored routes with user, workspace, run and country guards", async () => {
    const routes = routeCorrectedCandidates([shifted], { ...plan, roles: ["SI"] }).routes;
    vi.mocked(tenantQuery).mockResolvedValueOnce([{ id: "run" }]).mockResolvedValueOnce([]);
    const input = { userId: "owner", workspaceId: "workspace", runId: "run", countryCode: "DE", routes };
    await persistCandidateRoutes(input);
    expect(tenantQuery).toHaveBeenCalledWith("owner", expect.stringContaining("owner_id=$4"),
      ["run", "workspace", "DE", "owner", JSON.stringify(routes)]);
    await expect(persistCandidateRoutes({ ...input, countryCode: "CO" })).rejects.toThrow("country mismatch");
  });
});
