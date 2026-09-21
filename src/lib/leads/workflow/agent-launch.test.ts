import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadSearchPlan } from "@/lib/assistant/types";

const state = vi.hoisted(() => ({
  owner: true, action: null as null | { id: string; payload: unknown; status: string }, jobId: null as string | null, queues: 0,
}));
vi.mock("@/lib/rag/db", () => ({
  tenantTransaction: async (_userId: string, work: (client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => work({
    query: async (sql, params) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("from agent_run r")) return { rows: state.owner && params[0] === "owner" ? [{ conversation_id: "conversation" }] : [] };
      if (sql.includes("select id,payload,status from assistant_action")) return { rows: state.action ? [state.action] : [] };
      if (sql.includes("insert into assistant_action")) {
        state.action = { id: "action", payload: JSON.parse(params[2] as string), status: "proposed" };
        return { rows: [state.action] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  }),
  tenantQuery: async () => state.action ? [{ status: state.action.status, job_id: state.jobId }] : [],
}));
vi.mock("./jobs", () => ({
  confirmAndQueueLeadWorkflow: async () => {
    state.queues++;
    if (state.action) state.action.status = "confirmed";
    state.jobId = "job";
    return { jobId: "job" };
  },
}));
import { queueAgentLeadWorkflow } from "./agent-launch";

const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "new-market", roles: ["VAR"], targetCount: 2, queryLanguage: "de", userRequest: "Find two German VARs" };
beforeEach(() => { state.owner = true; state.action = null; state.jobId = null; state.queues = 0; });
describe("existing lead workflow Agent entry", () => {
  it("reuses the saved action and job on retry after an uncertain parent receipt", async () => {
    const first = await queueAgentLeadWorkflow("owner", "run", "call", plan);
    const second = await queueAgentLeadWorkflow("owner", "run", "call", plan);
    expect(first).toEqual({ actionId: "action", jobId: "job", status: "confirmed" });
    expect(second).toEqual(first);
    expect(state.queues).toBe(1);
  });
  it("rejects a missing owned call before creating an action", async () => {
    state.owner = false;
    expect(await queueAgentLeadWorkflow("outsider", "run", "call", plan)).toBeNull();
    expect(state.action).toBeNull();
    expect(state.queues).toBe(0);
  });
  it("refuses a changed plan under the same call ID", async () => {
    await queueAgentLeadWorkflow("owner", "run", "call", plan);
    await expect(queueAgentLeadWorkflow("owner", "run", "call", { ...plan, targetCount: 3 })).rejects.toThrow("changed");
    expect(state.queues).toBe(1);
  });
});
