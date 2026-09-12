import {beforeEach,expect,it,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/rag/db",()=>({tenantQuery:query}));
import {readProviderUsageSummary} from "./usage-summary";
import {PROVIDER_USAGE_FIELDS} from "./provider-usage";
beforeEach(()=>query.mockReset());
it("scopes aggregate queries to the owner and requested task without returning raw metrics",async()=>{
  const row:Record<string,unknown>={stage:"score",provider:"deepseek",requested_model:"flash",reported_model:null,prompt_version:"v2",gateway_host:"example.test",endpoint_kind:"messages",attempts:3};
  for(let i=0;i<PROVIDER_USAGE_FIELDS.length;i++){row[`f${i}_coverage`]=0;row[`f${i}_total`]=null;}
  row.f0_coverage=2;row.f0_total="0";
  query.mockResolvedValue([row]);
  const result=await readProviderUsageSummary("owner","task");
  expect(query.mock.calls[0][0]).toBe("owner");
  expect(query.mock.calls[0][2]).toEqual(["owner","task"]);
  expect(query.mock.calls[0][1]).toContain("where user_id=$1");
  expect(result[0]).toMatchObject({attempts:3,reportedModel:null,fields:[{field:"prompt_tokens",reportedAttempts:2,total:"0"},...result[0].fields.slice(1)]});
  expect(result[0].fields[1].total).toBeNull();
  expect(result[0]).not.toHaveProperty("metrics");
});
it("user totals use a null task filter and empty results remain empty",async()=>{
  query.mockResolvedValue([]);
  expect(await readProviderUsageSummary("owner")).toEqual([]);
  expect(query.mock.calls[0][2]).toEqual(["owner",null]);
});
