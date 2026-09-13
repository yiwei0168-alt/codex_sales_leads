import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({query:mocks.query,transaction:vi.fn(),tenantTransaction:vi.fn(),tenantQuery:vi.fn()}));
vi.mock("./hybrid-discovery-executor",async original=>({...await original<typeof import("./hybrid-discovery-executor")>(),executeHybridDiscovery:mocks.execute}));
import {discoverLeadCandidates} from "./discovery";
import {BudgetDeniedError} from "@/lib/billing/policy";
import type {LeadSearchPlan} from "@/lib/assistant/types";
import type {LeadMarketPlaybook} from "./types";
const plan:LeadSearchPlan={countryCode:"CO",countryName:"Colombia",objective:"new-market",roles:["SI"],targetCount:2,queryLanguage:"es",userRequest:"fixture"};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.query.mockImplementation(async(sql:string)=>sql.includes("insert into lead_search_run")?[{id:"fixture-run"}]:[]);
  mocks.execute.mockResolvedValue({candidates:[],rejectedCandidates:[],calls:[],modelUsage:[],warnings:[],targetPool:3,stopReason:"route-exhausted"});
});
it("returns the first empty round with its run and explicit empty processed population",async()=>{
  const result=await discoverLeadCandidates("action","workspace",plan,{} as LeadMarketPlaybook,"thread");
  expect(result).toMatchObject({runId:"fixture-run",candidates:[],processedCompanyKeys:[],creditsUsed:0});
  expect(result.sessionSnapshot).toBeDefined();
  expect(mocks.query.mock.calls.some(([sql])=>sql.includes("status='failed'"))).toBe(false);
});
it("continues to propagate budget denial and retain the failed run instead of inventing zero work",async()=>{
  const error=new BudgetDeniedError("budget-exhausted");mocks.execute.mockRejectedValueOnce(error);
  await expect(discoverLeadCandidates("action","workspace",plan,{} as LeadMarketPlaybook,"thread")).rejects.toBe(error);
  expect(mocks.query.mock.calls.some(([sql])=>sql.includes("status='failed'"))).toBe(true);
});
