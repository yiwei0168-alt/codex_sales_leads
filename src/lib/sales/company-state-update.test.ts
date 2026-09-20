import {describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({transaction:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:mocks.transaction}));
import {updateCompanyState} from "./repository";
import {companyStatePatchSchema,safeCompanyRevision} from "./company-state-input";

describe("versioned company state update",()=>{
  it("rejects a stale Agent revision under the company lock before writing",async()=>{
    const query=vi.fn().mockResolvedValueOnce({rows:[{revision:"3"}]});
    mocks.transaction.mockImplementationOnce(async(_user:string,run:(client:{query:typeof query})=>Promise<unknown>)=>run({query}));
    await expect(updateCompanyState("company-1",{nextAction:"Call tomorrow"},"account-1",2)).rejects.toThrow("Company state changed");
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0][0])).toContain("for update of locked");
  });
  it("accepts only supported, non-empty page and Agent patches",()=>{
    expect(companyStatePatchSchema.safeParse({nextAction:"Call tomorrow"}).success).toBe(true);
    expect(companyStatePatchSchema.safeParse({}).success).toBe(false);
    expect(companyStatePatchSchema.safeParse({priority:"Critical"}).success).toBe(false);
    expect(companyStatePatchSchema.safeParse({nextAction:"Call",userId:"forged"}).success).toBe(false);
  });
  it("converts PostgreSQL bigint revisions without losing concurrency precision",()=>{
    expect(safeCompanyRevision("3")).toBe(3);
    expect(()=>safeCompanyRevision("9007199254740993")).toThrow("safe integer");
  });
});
