import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query}));
import { GET } from "./route";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:"owner"});mocks.query.mockResolvedValue([]);});
it("blocks unauthenticated reads",async()=>{
  mocks.session.mockResolvedValue(new Response(null,{status:401}));
  expect((await GET(new Request("http://localhost/history"))).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects unbounded or invalid offsets",async()=>{
  for(const offset of ["-1","1.5","100001","NaN"])expect((await GET(new Request(`http://localhost/history?offset=${offset}`))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("projects only the owner's audit page and prevents shared caching",async()=>{
  mocks.query.mockResolvedValue(Array.from({length:51},(_,id)=>({id:String(id)})));
  const response=await GET(new Request("http://localhost/history?offset=50"));const data=await response.json();
  expect(data.items).toHaveLength(50);expect(data.hasMore).toBe(true);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.query).toHaveBeenCalledWith("owner",expect.stringContaining("where user_id=$1"),["owner",50]);
});
