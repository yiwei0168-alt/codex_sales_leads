import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query,tenantTransaction:async(_id:string,work:(client:unknown)=>unknown)=>work({query:mocks.query})}));
import { changeMemory,memoryChangeSchema } from "./memory-management";
import { retrieveCooperationPathMemory } from "@/lib/leads/path-memory";
const id="11111111-1111-4111-8111-111111111111";
beforeEach(()=>vi.clearAllMocks());
it("requires explicit confirmation and rejects arbitrary patches",()=>{
  expect(memoryChangeSchema.safeParse({id,operation:"delete",confirmed:true}).success).toBe(true);
  expect(memoryChangeSchema.safeParse({id,operation:"delete"}).success).toBe(false);
  expect(memoryChangeSchema.safeParse({id,operation:"activate",confirmed:true,userId:"other"}).success).toBe(false);
});
it("cannot mutate missing or other-user memories",async()=>{
  mocks.query.mockResolvedValue({rows:[]});
  expect(await changeMemory("owner",{id,operation:"delete",confirmed:true})).toBe("not-found");
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("user_id=$1"),["owner",id]);
});
it("does not offer lifecycle edits to company source mirrors",async()=>{
  mocks.query.mockResolvedValue({rows:[{kind:"company-classification"}]});
  expect(await changeMemory("owner",{id,operation:"archive",confirmed:true})).toBe("source-managed");
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
it("archives preferences with owner-scoped writes without model calls",async()=>{
  mocks.query.mockResolvedValue({rows:[{kind:"email-style",workspace_id:null}]});
  expect(await changeMemory("owner",{id,operation:"archive",confirmed:true})).toBe("ok");
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("update user_outreach_memory"),["owner",id,"archived"]);
});
it("path learning requires a still-active matching memory, not just history",async()=>{
  mocks.query.mockResolvedValue([]);await retrieveCooperationPathMemory("owner","workspace","GB");
  expect(mocks.query).toHaveBeenCalledWith("owner",expect.stringContaining("m.status='active'"),["owner","workspace","GB",20]);
  expect(mocks.query.mock.calls[0][1]).toContain("m.external_id='path-edit:'");
});
