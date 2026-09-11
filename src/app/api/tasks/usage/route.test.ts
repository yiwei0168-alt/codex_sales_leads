import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});});
it("does not read data without a session",async()=>{m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET()).status).toBe(401);expect(m.query).not.toHaveBeenCalled();});
it("keeps absent cash unknown and labels coverage incomplete",async()=>{
  m.query.mockResolvedValue([{stage:"assistant-intent",unknown_cost_operations:1,known_cost_usd:null}]);
  const response=await GET();expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toMatchObject({totalCostComplete:false,stages:[{known_cost_usd:null}]});expect(m.query).toHaveBeenCalledWith("owner",expect.stringContaining("where user_id=$1"),["owner"]);
});
it("returns unavailable rather than zero on a database error",async()=>{m.query.mockRejectedValue(new Error("private"));const response=await GET();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private");});
