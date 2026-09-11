import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn(),start:vi.fn(),finish:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("@/lib/operation-metrics",()=>({startOperation:m.start,finishOperation:m.finish,bestEffortMetric:(write:()=>Promise<unknown>)=>write()}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});m.start.mockResolvedValue("metric");m.finish.mockResolvedValue(undefined);});
it("does not query without authentication",async()=>{m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET()).status).toBe(401);expect(m.query).not.toHaveBeenCalled();});
it("aggregates whole task history, not the first page",async()=>{
  m.query.mockResolvedValue([{country:"GB",active:60},{country:"unknown",active:2}]);const response=await GET();expect((await response.json()).markets[0].active).toBe(60);
  const sql=m.query.mock.calls[0][1] as string;expect(sql).not.toMatch(/limit 51|offset/);expect(sql).toContain("'running','confirmed','sending'");expect(m.query.mock.calls[0][2]).toEqual(["owner"]);
  expect(m.finish).toHaveBeenCalledWith("owner","metric","completed",expect.objectContaining({downstreamUsedItems:2,costUsd:0}));
});
it("records failures without returning an empty success",async()=>{m.query.mockRejectedValue(new Error("private"));expect((await GET()).status).toBe(503);expect(m.finish).toHaveBeenCalledWith("owner","metric","failed",expect.objectContaining({discardedReasonCounts:{readFailure:1}}));});
