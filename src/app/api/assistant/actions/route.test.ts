import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query}));
import { GET } from "./route";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:"owner"});mocks.query.mockResolvedValue([]);});
it("rejects unauthenticated requests without touching data",async()=>{
  mocks.session.mockResolvedValue(new Response(null,{status:401}));
  expect((await GET(new Request("http://localhost/api/assistant/actions"))).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("validates bounded pagination",async()=>{
  for(const offset of ["-1","NaN","1.2","100001"])
    expect((await GET(new Request(`http://localhost/api/assistant/actions?offset=${offset}`))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("scopes the paged projection to the session user and limits output",async()=>{
  mocks.query.mockResolvedValue(Array.from({length:51},(_,id)=>({id:String(id)})));
  const response=await GET(new Request("http://localhost/api/assistant/actions?offset=50"));
  const body=await response.json();expect(body.actions).toHaveLength(50);expect(body.hasMore).toBe(true);
  expect(mocks.query).toHaveBeenCalledWith("owner",expect.stringContaining("where user_id=$1"),["owner",50]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
