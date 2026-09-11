import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("@/lib/billing/denial-metrics",()=>({recordBudgetDenial:vi.fn().mockResolvedValue(undefined)}));
vi.mock("node:timers/promises",()=>({setTimeout:vi.fn().mockResolvedValue(undefined)}));
import {SnovProvider} from "./snov";
import {withProductSpend} from "@/lib/billing/context";
const resultUrl="https://api.snov.io/v2/domain-search/domain-emails/result/fixture";
beforeEach(()=>{vi.stubEnv("SNOV_USER_ID","fixture");vi.stubEnv("SNOV_API_SECRET","fixture-secret");});
afterEach(()=>vi.unstubAllEnvs());
function transport(result:unknown,url=resultUrl){return vi.fn<typeof fetch>()
  .mockResolvedValueOnce(Response.json({access_token:"fixture-token"}))
  .mockResolvedValueOnce(Response.json({links:{result:url}}))
  .mockImplementation(async()=>Response.json(result));}
it("only accepts a completed response and preserves legitimate empty results",async()=>{
  const fetcher=transport({status:"completed",data:[]});
  expect(await new SnovProvider(fetcher).domainEmails("example.com")).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.every(([,init])=>init?.redirect==="error")).toBe(true);
});
it("never treats pending partial data or poll exhaustion as completed empty",async()=>{
  const fetcher=transport({status:"in_progress",data:[{email:"partial@example.com"}]});
  await expect(new SnovProvider(fetcher).domainEmails("example.com")).rejects.toMatchObject({cause:expect.objectContaining({message:expect.stringContaining("polling incomplete")})});
  expect(fetcher).toHaveBeenCalledTimes(8);
});
it.each(["https://evil.test/result","https://api.snov.io@evil.test/result","https://api.snov.io/v1/other","https://api.snov.io/v2/domain-search/domain-emails/result/x?token=secret"])("rejects an untrusted result link before sending the bearer: %s",async url=>{
  const fetcher=transport({},url);
  await expect(new SnovProvider(fetcher).domainEmails("example.com")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not assume OAuth is free when its request bound is missing",async()=>{
  const fetcher=transport({});
  await expect(withProductSpend("owner","contacts",()=>new SnovProvider(fetcher).domainEmails("example.com"))).rejects.toMatchObject({code:"missing-tariff"});
  expect(fetcher).not.toHaveBeenCalled();
});
