import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({tenantQuery:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:vi.fn(),tenantQuery:mocks.tenantQuery}));
vi.mock("./hybrid-discovery-executor",async original=>({...await original<typeof import("./hybrid-discovery-executor")>(),executeHybridDiscovery:mocks.execute}));
import {discoverLeadCandidates} from "./discovery";
import {BudgetDeniedError} from "@/lib/billing/policy";
import {withSpendContext} from "@/lib/billing/context";
import type {LeadSearchPlan} from "@/lib/assistant/types";
import type {LeadMarketPlaybook} from "./types";
const plan:LeadSearchPlan={countryCode:"CO",countryName:"Colombia",objective:"new-market",roles:["SI"],targetCount:2,queryLanguage:"es",userRequest:"fixture"};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.tenantQuery.mockImplementation(async(_userId:string,sql:string)=>sql.includes("insert into lead_search_run")
    ?[{id:"fixture-run"}]:sql.includes("as saved from lead_search_run")?[{saved:null}]:[]);
  mocks.execute.mockResolvedValue({candidates:[],rejectedCandidates:[],calls:[],modelUsage:[],warnings:[],targetPool:3,stopReason:"route-exhausted"});
});
it("returns the first empty round with its run and explicit empty processed population",async()=>{
  const result=await withSpendContext({userId:"fixture-user",operationId:"action",stage:"discovery"},
    ()=>discoverLeadCandidates("action","workspace",plan,{} as LeadMarketPlaybook,"thread"));
  expect(result).toMatchObject({runId:"fixture-run",candidates:[],processedCompanyKeys:[],creditsUsed:0});
  expect(result.sessionSnapshot).toBeDefined();
  expect(mocks.tenantQuery.mock.calls.some(([,sql])=>sql.includes("status='failed'"))).toBe(false);
});
it("continues to propagate budget denial and retain the failed run instead of inventing zero work",async()=>{
  const error=new BudgetDeniedError("budget-exhausted");mocks.execute.mockRejectedValueOnce(error);
  await expect(withSpendContext({userId:"fixture-user",operationId:"action",stage:"discovery"},
    ()=>discoverLeadCandidates("action","workspace",plan,{} as LeadMarketPlaybook,"thread"))).rejects.toBe(error);
  expect(mocks.tenantQuery.mock.calls.some(([,sql])=>sql.includes("status='failed'"))).toBe(true);
});
it("refuses discovery without an owning workflow context before a provider or database call",async()=>{
  await expect(discoverLeadCandidates("action","workspace",plan,{} as LeadMarketPlaybook,"thread"))
    .rejects.toThrow("owned workflow context");
  expect(mocks.tenantQuery).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
