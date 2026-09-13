import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});});
it("does not read data without a session",async()=>{m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET()).status).toBe(401);expect(m.query).not.toHaveBeenCalled();});
it("keeps absent cash unknown and labels coverage incomplete",async()=>{
  m.query.mockResolvedValueOnce([{stage:"assistant-intent",unknown_cost_operations:1,known_cost_usd:null}])
    .mockResolvedValueOnce([{stage:"lead-playbook",unknown_bills:1,reported_micros:null}])
    .mockResolvedValueOnce([{stage:"score_candidates",input_items:"2",generated_artifacts:"2",
      valid_artifacts:"1",downstream_used_artifacts:"1",downstream_utilization:"0.5"}])
    .mockResolvedValueOnce([{stage:"qualification",recorded_total_tokens:"120",fallback_records:0}]);
  const response=await GET();expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({totalCostComplete:false,userAdoptionCoverage:"unknown",
    stages:[{known_cost_usd:null}],billingStages:[{reported_micros:null}],
    workflowStageMetrics:[{input_items:"2",downstream_utilization:"0.5"}],
    workflowModelUsage:[{recorded_total_tokens:"120"}]});
  expect(m.query).toHaveBeenCalledTimes(4);
  for(const call of m.query.mock.calls)expect(call).toEqual(["owner",expect.stringContaining("where user_id=$1"),["owner"]]);
  expect(m.query.mock.calls[2][1]).toContain("sum(downstream_used_artifacts)");
  expect(m.query.mock.calls[3][1]).toContain("from workflow_model_usage");
});
it("returns unavailable rather than zero on a database error",async()=>{m.query.mockRejectedValue(new Error("private"));const response=await GET();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private");});
