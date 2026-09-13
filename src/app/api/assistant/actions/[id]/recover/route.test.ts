import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),propose:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/assistant/processing-recovery",()=>({proposeProcessingRecovery:mocks.propose}));
import {POST} from "./route";
const id="00000000-0000-4000-8000-000000000001";
const request=(body:unknown)=>new Request("http://localhost/api/recover",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:"owner"});});
it("requires authentication and explicit proposal shape before any database mutation",async()=>{
  mocks.session.mockResolvedValueOnce(new Response(null,{status:401}));
  expect((await POST(request({propose:true}),{params:Promise.resolve({id})})).status).toBe(401);
  for(const body of [{},{propose:false},{propose:true,execute:true}])expect((await POST(request(body),{params:Promise.resolve({id})})).status).toBe(400);
  expect((await POST(request({propose:true}),{params:Promise.resolve({id:"invalid"})})).status).toBe(400);
  expect(mocks.propose).not.toHaveBeenCalled();
});
it("uses session ownership and returns only the saved proposal without executing it",async()=>{
  mocks.propose.mockResolvedValue({actionId:id,reused:false,gap:4,pendingCompanies:2});
  const response=await POST(request({propose:true}),{params:Promise.resolve({id})});
  expect(response.status).toBe(200);expect(mocks.propose).toHaveBeenCalledWith("owner",id);
  expect(await response.json()).toEqual({actionId:id,reused:false,gap:4,pendingCompanies:2});
});
it("preserves source or cost conflicts as refusal",async()=>{
  mocks.propose.mockRejectedValue(new Error("paid-request-already-recorded"));
  expect((await POST(request({propose:true}),{params:Promise.resolve({id})})).status).toBe(409);
});
