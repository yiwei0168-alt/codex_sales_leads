import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),lookup:vi.fn(),prior:null as unknown}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:async(_id:string,work:(client:unknown)=>unknown)=>work({query:mocks.query})}));
import { lookupAndStoreContacts } from "./lookup-service";
const input={companyId:"c",companyName:"Test",domain:"example.com",websiteUrl:"https://example.com",countryCode:"CO",targetRoles:["Purchasing"]};
const provider={id:"test",isConfigured:()=>true,lookupCompany:mocks.lookup};
beforeEach(()=>{vi.clearAllMocks();mocks.prior=null;mocks.query.mockImplementation(async(sql:string)=>{
  if(sql.includes("select status,result"))return {rows:mocks.prior?[mocks.prior]:[]};
  if(sql.includes("returning id"))return {rows:[{id:"run"}]};return {rows:[]};
});mocks.lookup.mockResolvedValue({provider:"test",contacts:[{fullName:"Test Person",email:"person@example.com",emailStatus:"Unknown"}],creditsUsed:1,warnings:[]});});
it("persists contacts, email candidates and provider cost in the same completion transaction",async()=>{
  expect(await lookupAndStoreContacts("u","w",input,provider)).toMatchObject({cached:false});
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  for(const table of ["company_contact","company_email_candidate","company_web_evidence"])
    expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes(`insert into ${table}`))).toBe(true);
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("set status='completed',result="))).toBe(true);
});
it("reuses completed cache without a paid call",async()=>{
  mocks.prior={status:"completed",run_id:"r",updated_at:"2025-01-01",result:{contacts:[]}};
  expect(await lookupAndStoreContacts("u","w",input,provider)).toMatchObject({cached:true});expect(mocks.lookup).not.toHaveBeenCalled();
});
it("does not duplicate an in-flight call even if refresh is requested",async()=>{
  mocks.prior={status:"running"};await expect(lookupAndStoreContacts("u","w",input,provider,true)).rejects.toThrow("尚未完成");expect(mocks.lookup).not.toHaveBeenCalled();
});
it("requires explicit refresh after an ambiguous failure",async()=>{
  mocks.prior={status:"unknown"};await expect(lookupAndStoreContacts("u","w",input,provider)).rejects.toThrow("不确定");expect(mocks.lookup).not.toHaveBeenCalled();
  await lookupAndStoreContacts("u","w",input,provider,true);expect(mocks.lookup).toHaveBeenCalledTimes(1);
});
it("marks provider failure unknown and never retries",async()=>{
  mocks.lookup.mockRejectedValue(new Error("timeout"));await expect(lookupAndStoreContacts("u","w",input,provider)).rejects.toThrow("timeout");
  expect(mocks.lookup).toHaveBeenCalledTimes(1);expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("set status='unknown'"))).toBe(true);
});
