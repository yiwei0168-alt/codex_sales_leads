import { beforeEach,expect,it,vi } from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/rag/db",()=>({tenantQuery:query}));
import { listKnowledgeLibrary } from "./library-service";

beforeEach(()=>query.mockReset().mockResolvedValue(Array.from({length:13},(_,index)=>({id:String(index)}))));

it("paginates private materials at the requested UI page size",async()=>{
  const result=await listKnowledgeLibrary("user","private","",12,12);
  expect(result.items).toHaveLength(12);
  expect(result.hasMore).toBe(true);
  expect(query.mock.calls[0][0]).toBe("user");
  expect(query.mock.calls[0][1]).toContain("d.owner_id=$1");
  expect(query.mock.calls[0][2]).toEqual(["user","private","",12,13]);
});

it("retains public sharing checks when paginating evidence",async()=>{
  await listKnowledgeLibrary("user","evidence","router",24,12);
  expect(query.mock.calls[0][1]).toContain("s.sharing_status='public'");
  expect(query.mock.calls[0][2]).toEqual(["router",24,13]);
});

it("combines owned private, shared, and public evidence without leaking other users' private documents",async()=>{
  await listKnowledgeLibrary("user","all","router",0,12);
  const sql=String(query.mock.calls[0][1]);
  expect(sql).toContain("d.visibility='shared' or (d.visibility='private' and d.owner_id=$1)");
  expect(sql).toContain("s.sharing_status='public'");
  expect(sql).toContain("union all");
  expect(query.mock.calls[0][2]).toEqual(["user","router",13,0]);
});
