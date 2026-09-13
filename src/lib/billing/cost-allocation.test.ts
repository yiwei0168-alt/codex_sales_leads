import {expect,it} from "vitest";
import {allocateCompanyCost,type CostAttribution,type AllocationBasis} from "./cost-allocation";
const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64),round="d".repeat(64);
const input:CostAttribution={version:"company-cost-attribution-v1",kind:"company-inputs",companyKeys:[b,a,c],roundKey:round};
it("splits actual distinct inputs with deterministic micro-dollar remainder and conservation",()=>{
  const result=allocateCompanyCost({basis:"reservation",amountMicros:10,attribution:input});
  expect(result).toMatchObject({method:"batch-equal",additionalSpendMicros:0,unallocatedMicros:0});
  expect(result.shares).toEqual([{companyKey:a,amountMicros:4},{companyKey:b,amountMicros:3},{companyKey:c,amountMicros:3}]);
  expect(allocateCompanyCost({basis:"reservation",amountMicros:10,attribution:{...input,companyKeys:[c,b,a]}})).toEqual(result);
});
it("attributes a single company directly, preserving null rather than inventing zero costs",()=>{
  const attribution={...input,companyKeys:[a]};
  expect(allocateCompanyCost({basis:"invoice",amountMicros:17,attribution}).shares).toEqual([{companyKey:a,amountMicros:17}]);
  expect(allocateCompanyCost({basis:"invoice",amountMicros:null,attribution})).toMatchObject({amountKnown:false,shares:[],unallocatedMicros:null,method:"direct"});
});
it.each(["reservation","estimate","provider-report","invoice","occupied"] as AllocationBasis[])("keeps %s as a separate non-additive cost basis",basis=>{
  const result=allocateCompanyCost({basis,amountMicros:0,attribution:input});
  expect(result.basis).toBe(basis);expect(result.shares.every(row=>row.amountMicros===0)).toBe(true);
});
it("requires matching completed round and uses all distinct processed companies",()=>{
  const attribution:CostAttribution={...input,kind:"task-shared",companyKeys:[]};
  expect(allocateCompanyCost({basis:"estimate",amountMicros:11,attribution})).toMatchObject({method:"task-pending",shares:[],unallocatedMicros:11});
  expect(()=>allocateCompanyCost({basis:"estimate",amountMicros:11,attribution,completedTask:{roundKey:a,processedCompanyKeys:[a]}})).toThrow("round mismatch");
  const result=allocateCompanyCost({basis:"estimate",amountMicros:11,attribution,completedTask:{roundKey:round,processedCompanyKeys:[a,a,b]}});
  expect(result.shares.map(row=>row.amountMicros)).toEqual([6,5]);expect(result.method).toBe("task-equal");
  expect(allocateCompanyCost({basis:"estimate",amountMicros:11,attribution,completedTask:{roundKey:round,processedCompanyKeys:[]}})).toMatchObject({method:"zero-company-task",shares:[],unallocatedMicros:11});
});
it("does not invent company attribution for legacy or unwired stages",()=>{
  for(const attribution of [null,{...input,kind:"unclassified" as const,companyKeys:[]}]){
    expect(allocateCompanyCost({basis:"reservation",amountMicros:20,attribution})).toMatchObject({method:"unattributed",unallocatedMicros:20,shares:[]});
  }
});
it("rejects duplicate, empty, invalid input identities and invalid monetary amounts",()=>{
  for(const companyKeys of [[a,a],[],["private-raw-identity"]])expect(()=>allocateCompanyCost({basis:"reservation",amountMicros:10,attribution:{...input,companyKeys}})).toThrow();
  for(const amountMicros of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER])expect(()=>allocateCompanyCost({basis:"reservation",amountMicros,attribution:input})).toThrow();
  for(const amountMicros of [1,2,999999999999,1000000000000]){
    const result=allocateCompanyCost({basis:"occupied",amountMicros,attribution:input});
    expect(result.shares.reduce((sum,row)=>sum+row.amountMicros,0)).toBe(amountMicros);
  }
});
