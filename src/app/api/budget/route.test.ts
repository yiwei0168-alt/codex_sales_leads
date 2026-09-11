import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),set:vi.fn(),taskRead:vi.fn(),taskSet:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/billing/repository",()=>({readSpendBudget:m.read,setSpendBudget:m.set,readTaskSpendBudget:m.taskRead,setTaskSpendBudget:m.taskSet}));
import {GET,PUT} from "./route";
const actionId="00000000-0000-4000-8000-000000000002";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});m.taskRead.mockResolvedValue({taskLimit:null,stages:[]});});
it("does not expose budget data without a session",async()=>{
  m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET(new Request("http://localhost/api/budget"))).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
});
it("reads a task budget under its authenticated owner",async()=>{
  const response=await GET(new Request(`http://localhost/api/budget?actionId=${actionId}`));expect(response.status).toBe(200);expect(m.taskRead).toHaveBeenCalledWith("owner",actionId);expect(m.read).not.toHaveBeenCalled();
});
it("routes confirmed task edits separately from the global ceiling",async()=>{
  const response=await PUT(new Request("http://localhost/api/budget",{method:"PUT",body:JSON.stringify({actionId,limitUsd:"0.25",confirmed:true})}));
  expect(response.status).toBe(200);expect(m.taskSet).toHaveBeenCalledWith("owner",actionId,250000);expect(m.set).not.toHaveBeenCalled();
});
it("rejects malformed task IDs and missing confirmation without writes",async()=>{
  expect((await GET(new Request("http://localhost/api/budget?actionId=bad"))).status).toBe(400);
  expect((await PUT(new Request("http://localhost/api/budget",{method:"PUT",body:JSON.stringify({actionId,limitUsd:"50"})}))).status).toBe(400);
  expect(m.taskSet).not.toHaveBeenCalled();
});
