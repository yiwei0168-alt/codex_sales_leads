import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query}));
import { GET } from "./route";
import { feedStatus } from "@/lib/assistant/task-feed";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:"owner"});mocks.query.mockResolvedValue([]);});
it("rejects unauthorized and invalid filters without reads",async()=>{
  mocks.session.mockResolvedValueOnce(new Response(null,{status:401}));expect((await GET(new Request("http://localhost/tasks"))).status).toBe(401);
  for(const query of ["kind=invalid","offset=-1","status=invalid","country=invalid"])expect((await GET(new Request(`http://localhost/tasks?${query}`))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("passes all filters and owner into the server projection",async()=>{
  mocks.query.mockResolvedValue(Array.from({length:51},(_,id)=>({id})));
  const response=await GET(new Request("http://localhost/tasks?kind=send&country=GB&status=attention&offset=50"));
  expect(mocks.query).toHaveBeenCalledWith("owner",expect.any(String),["owner","send","GB","attention",50]);
  const data=await response.json();expect(data.items).toHaveLength(50);expect(data.hasMore).toBe(true);
});
it("does not conflate draft approval, sending and delivery",()=>{
  expect(feedStatus({kind:"draft",status:"approved"})).toContain("非发送凭证");
  expect(feedStatus({kind:"send",status:"sent"})).toBe("发信服务器已接受");
  expect(feedStatus({kind:"send",status:"unknown"})).toContain("需核实");
});
