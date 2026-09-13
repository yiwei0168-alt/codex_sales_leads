import {expect,it} from "vitest";
import {summarizeCompanyCosts,companyCostBases,type CompanyCostSource} from "./company-cost-summary";
import {companyCostKey} from "./company-cost-context";
const a=companyCostKey("example.com","CO"),b=companyCostKey("example.com","DE"),roundKey="c".repeat(64);
const source:CompanyCostSource={reserved_micros:"11",occupied_micros:"7",estimated_micros:null,reported_micros:"0",invoice_micros:"7",
  metrics:{costAttribution:{version:"company-cost-attribution-v1",roundKey,kind:"task-shared",companyKeys:[]},
    costAllocationCompletion:{version:"task-cost-completion-v1",roundKey,processedCompanyKeys:[a,b]}}};
it("projects each independent current basis once and conserves known totals including unallocated costs",()=>{
  const rows=summarizeCompanyCosts([source,{...source,reserved_micros:"5",occupied_micros:null,invoice_micros:null,metrics:null}]);
  expect(rows).toHaveLength(3);
  for(const [basis,total] of [["reservation",16],["occupied",12],["provider-report",0],["invoice",7]] as const){
    expect(rows.reduce((sum,row)=>sum+(row.costs[basis].amountMicros??0),0)).toBe(total);
  }
  expect(rows.every(row=>row.costs.estimate.amountMicros===null)).toBe(true);
  expect(rows.find(row=>row.companyKey===null)?.costs.invoice).toEqual({amountMicros:null,knownCalls:0,calls:1});
  expect(summarizeCompanyCosts([source])).toEqual(summarizeCompanyCosts([source]));
});
it("keeps partial coverage visible, country identities separate, and legacy/shared pending costs independent",()=>{
  const direct={...source,invoice_micros:null,metrics:{costAttribution:{version:"company-cost-attribution-v1",roundKey,kind:"company-inputs",companyKeys:[a]}}};
  const pending={...source,metrics:{costAttribution:{version:"company-cost-attribution-v1",roundKey,kind:"task-shared",companyKeys:[]}}};
  const rows=summarizeCompanyCosts([source,direct,pending]);
  expect(a).not.toBe(b);
  expect(rows.find(row=>row.companyKey===a)?.costs.invoice).toMatchObject({knownCalls:1,calls:2});
  expect(rows.find(row=>row.companyKey===b)?.costs.invoice).toMatchObject({knownCalls:1,calls:1});
  expect(rows.find(row=>row.companyKey===null)?.costs.reservation.amountMicros).toBe(11);
  for(const row of rows)for(const basis of companyCostBases)expect(row.costs[basis].knownCalls).toBeLessThanOrEqual(row.costs[basis].calls);
});
