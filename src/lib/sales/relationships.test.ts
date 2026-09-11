import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:vi.fn()}));
import { relationshipSchema } from "./relationships";
import { manualCompanySchema, manualDomain } from "./manual-company";

describe("manual channel inputs",()=>{
  const valid={country:"CO",from:"a",to:"b",type:"供货",status:"pending",basis:"用户提供的关系说明",sourceUrl:""};
  it("rejects self edges, unsupported states and executable source links",()=>{
    expect(relationshipSchema.safeParse(valid).success).toBe(true);
    expect(relationshipSchema.safeParse({...valid,to:"a"}).success).toBe(false);
    expect(relationshipSchema.safeParse({...valid,status:"evidence-supported"}).success).toBe(false);
    expect(relationshipSchema.safeParse({...valid,sourceUrl:"javascript:alert(1)"}).success).toBe(false);
  });
  it("requires country and a nonempty basis and rejects unexpected fields",()=>{
    expect(relationshipSchema.safeParse({...valid,country:"all"}).success).toBe(false);
    expect(relationshipSchema.safeParse({...valid,basis:" "}).success).toBe(false);
    expect(relationshipSchema.safeParse({...valid,userId:"other"}).success).toBe(false);
  });
  it("allows a company without a website and normalizes real domains",()=>{
    expect(manualCompanySchema.safeParse({name:"Example",country:"CO"}).success).toBe(true);
    expect(manualDomain("")).toBe("");
    expect(manualDomain("https://www.Example.com/about")).toBe("example.com");
    expect(()=>manualDomain("https://user:password@example.com")).toThrow();
  });
});
