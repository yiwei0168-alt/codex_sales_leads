import {afterEach,expect,it,vi} from "vitest";
import {collectLeadEvidence} from "./discovery";
import {TavilySearchProvider} from "@/providers/tavily";
import {BudgetDeniedError} from "@/lib/billing/policy";
import {withSpendContext,currentSpendContext} from "@/lib/billing/context";
import {companyCostKey} from "@/lib/billing/company-cost-context";
import type {LeadWorkflowCandidate} from "./types";
import type {LeadSearchPlan} from "@/lib/assistant/types";
afterEach(()=>vi.restoreAllMocks());
const plan:LeadSearchPlan={countryCode:"DE",countryName:"德国",objective:"new-market",roles:["SI"],targetCount:2,queryLanguage:"en",userRequest:"fixture"};
const candidates=["first.de","second.de"].map((domain,index)=>({candidateId:`candidate-${index}`,evidenceSnapshotRunId:"fixture-run",companyName:domain,domain,officialWebsiteUrl:`https://${domain}`,queryRoles:["SI"],queryFamily:"services",providerScore:0.5,evidence:[],evidenceWarnings:[]} as LeadWorkflowCandidate));
const options={allowReusableEvidence:false,persistEvidence:false,concurrency:2};
it("isolates parallel evidence acquisition company attribution without adding model input",async()=>{
  const observed:string[][]=[];
  vi.spyOn(TavilySearchProvider.prototype,"search").mockImplementation(async request=>{
    await Promise.resolve();observed.push(currentSpendContext()!.costAttribution!.companyKeys);
    expect(JSON.stringify(request)).not.toContain("company-cost");
    return {query:request.query,results:[],creditsUsed:1,attempts:1,retries:0,latencyMs:1};
  });
  await withSpendContext({userId:"fixture",operationId:"fixture",stage:"collect-evidence"},async()=>{
    const result=await collectLeadEvidence(candidates,plan,options);
    expect(result.candidates).toHaveLength(2);expect(currentSpendContext()?.costAttribution).toBeUndefined();
  });
  expect(observed.sort()).toEqual(candidates.map(c=>[companyCostKey(c.domain,"DE")]).sort());
});
it("propagates a budget stop instead of treating absent evidence as an ordinary warning",async()=>{
  const denied=new BudgetDeniedError("budget-exhausted");
  const search=vi.spyOn(TavilySearchProvider.prototype,"search").mockRejectedValue(denied);
  await expect(collectLeadEvidence(candidates.slice(0,1),plan,options)).rejects.toBe(denied);
  expect(search).toHaveBeenCalledOnce();
});
it("keeps provider credit reports, estimates and uncertain retry attempts separate",async()=>{
  vi.spyOn(TavilySearchProvider.prototype,"search").mockImplementation(async request=>request.query.includes("first.de")
    ?{query:request.query,results:[],creditsUsed:2,creditSource:"provider-report",reportedCredits:2,
      attempts:2,retries:1,latencyMs:1}
    :{query:request.query,results:[],creditsUsed:1,creditSource:"estimate",reportedCredits:null,
      attempts:1,retries:0,latencyMs:1});
  const result=await collectLeadEvidence(candidates,plan,options);
  expect(result.creditsUsed).toBe(3);
  expect(result.providerMetrics).toMatchObject({reportedCreditCalls:1,estimatedCreditCalls:1,
    reportedCredits:2,estimatedCredits:1,unknownCreditAttempts:1});
});
