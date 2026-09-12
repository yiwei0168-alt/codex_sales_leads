import {expect,it} from "vitest";
import {planCostReconciliation,type CostObservation} from "./reconciliation-policy";
const initial={reservedMicros:100,settledMicros:null,settledSource:null};
const report:CostObservation={kind:"provider-report",amountMicros:30,complete:true,uniquelyMatched:true};
it("retains the full reservation for estimates, unknown amounts and incomplete or ambiguous reports",()=>{
  for(const value of [{...report,kind:"usage-estimate" as const},{...report,amountMicros:null},{...report,complete:false},{...report,uniquelyMatched:false}]){
    expect(planCostReconciliation(initial,value)).toMatchObject({occupiedAfter:100,releasedMicros:0,canSettle:false});
  }
});
it("releases only the uniquely matched complete difference and never sums the four amount classes",()=>{
  expect(planCostReconciliation(initial,report)).toMatchObject({occupiedAfter:30,occupiedDelta:-70,releasedMicros:70,settledSource:"provider-report"});
});
it("an invoice takes precedence over later reports and corrections change only the previous occupancy",()=>{
  const settled={...initial,settledMicros:30,settledSource:"provider-report" as const};
  expect(planCostReconciliation(settled,{...report,kind:"invoice",amountMicros:40})).toMatchObject({occupiedAfter:40,occupiedDelta:10});
  expect(planCostReconciliation({...settled,settledSource:"invoice"},{...report,amountMicros:10})).toMatchObject({occupiedAfter:30,releasedMicros:0});
});
it("permits verified free failures, but unknown is not zero and overrun suspends the rule",()=>{
  expect(planCostReconciliation(initial,{...report,kind:"verified-unbilled",amountMicros:0})).toMatchObject({occupiedAfter:0,releasedMicros:100});
  expect(planCostReconciliation(initial,{...report,amountMicros:120})).toMatchObject({occupiedAfter:120,occupiedDelta:20,suspendRule:true});
  expect(()=>planCostReconciliation(initial,{...report,amountMicros:-1})).toThrow();
  expect(()=>planCostReconciliation(initial,{...report,kind:"verified-unbilled",amountMicros:null})).toThrow();
});
it("holds an incomplete overrun conservatively without superseding a verified invoice",()=>{
  expect(planCostReconciliation(initial,{...report,amountMicros:120,complete:false})).toMatchObject({occupiedAfter:120,canSettle:false,suspendRule:true});
  expect(planCostReconciliation({...initial,occupiedMicros:40,settledMicros:40,settledSource:"invoice"},{...report,amountMicros:120,complete:false})).toMatchObject({occupiedAfter:40,canSettle:false,suspendRule:true});
});
