import { expect,it,vi } from "vitest";
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:vi.fn()}));
import { externalAddressDomains,matchImportedCompany } from "./company-links";
import type { PoolClient } from "pg";
it("excludes own mailbox domain and deduplicates external addresses",()=>expect(externalAddressDomains(["a@cudy.com","x@CLIENT.com","b@client.com"],"me@cudy.com")).toEqual(["client.com"]));
it("does not choose a company when multiple candidate domains occur",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{id:"a"},{id:"b"}]}).mockResolvedValue({rows:[]});
  await matchImportedCompany({query} as unknown as PoolClient,"u","m",["x@a.com","y@b.com"],"me@cudy.com");
  expect(query.mock.calls[1][1]).toEqual(["u","m",null,"ambiguous"]);expect(query.mock.calls[1][0]).toContain("do nothing");
});
