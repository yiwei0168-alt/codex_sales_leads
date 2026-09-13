import {expect,it} from "vitest";
import {observationCostAllocation} from "./observation-allocation";
import {withCompanyCostAttribution} from "./company-cost-context";
import {withProductSpend} from "./context";
const reservationMetrics={costAttribution:{version:"company-cost-attribution-v1",kind:"company-inputs",companyKeys:["a".repeat(64),"b".repeat(64)],roundKey:"c".repeat(64)}};
it("keeps estimate, report, invoice and occupancy changes independent",()=>{
  for(const [kind,basis,amountMicros,occupiedBefore,occupiedAfter] of [
    ["usage-estimate","estimate",20,100,100],["provider-report","provider-report",30,100,30],["invoice","invoice",40,30,40],
  ] as const){
    const result=observationCostAllocation({kind,amountMicros,reservationMetrics,occupiedBefore,occupiedAfter});
    expect(result.observation?.basis).toBe(basis);expect(result.observation?.shares.map(row=>row.amountMicros)).toEqual([amountMicros/2,amountMicros/2]);
    expect(result.occupiedBefore.sourceAmountMicros).toBe(occupiedBefore);expect(result.occupiedAfter.sourceAmountMicros).toBe(occupiedAfter);
    expect(result.observation?.additionalSpendMicros).toBe(0);
  }
});
it("does not use the active ingestion task's company to reattribute a late invoice",()=>{
  withProductSpend("owner","invoice-ingestion",()=>withCompanyCostAttribution([{domain:"wrong.example"}],"GB",()=>{
    const result=observationCostAllocation({kind:"invoice",amountMicros:41,reservationMetrics,occupiedBefore:30,occupiedAfter:41});
    expect(result.observation?.shares.map(row=>row.companyKey)).toEqual(reservationMetrics.costAttribution.companyKeys);
    expect(result.observation?.shares.map(row=>row.amountMicros)).toEqual([21,20]);
  }));
});
it("keeps unknown report values null and unbilled verification distinct from an invoice",()=>{
  const unknown=observationCostAllocation({kind:"provider-report",amountMicros:null,reservationMetrics,occupiedBefore:100,occupiedAfter:100});
  expect(unknown.observation).toMatchObject({amountKnown:false,shares:[],unallocatedMicros:null});
  const unbilled=observationCostAllocation({kind:"verified-unbilled",amountMicros:0,reservationMetrics,occupiedBefore:100,occupiedAfter:0});
  expect(unbilled.observation).toBeNull();expect(unbilled.occupiedAfter.sourceAmountMicros).toBe(0);
});
it("retains legacy or malformed provenance as unallocated without blocking reconciliation",()=>{
  for(const metrics of [null,{}, {costAttribution:{...reservationMetrics.costAttribution,companyKeys:["raw sensitive input"]}}]){
    const result=observationCostAllocation({kind:"invoice",amountMicros:40,reservationMetrics:metrics,occupiedBefore:100,occupiedAfter:40});
    expect(result).toMatchObject({attributionStatus:"missing-or-invalid",observation:{unallocatedMicros:40,shares:[]}});
    expect(JSON.stringify(result)).not.toContain("raw sensitive input");
  }
});
