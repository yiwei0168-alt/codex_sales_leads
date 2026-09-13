import { expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { completeTaskCostAllocation } from "./task-cost-completion";
import { observationCostAllocation } from "./observation-allocation";

const roundKey="c".repeat(64), a="a".repeat(64), b="b".repeat(64);
function fixture() {
  const metrics:Record<string,unknown>={costAttribution:{version:"company-cost-attribution-v1",
    roundKey,kind:"task-shared",companyKeys:[]},reservationAllocation:{method:"task-pending"}};
  const query=vi.fn(async(sql:string,args:unknown[])=>{
    if(sql.startsWith("select"))return {rows:[{id:"reservation",reserved_micros:"11",metrics}]};
    Object.assign(metrics,JSON.parse(args[2] as string));return {rows:[]};
  });
  return {metrics,query,client:{query} as unknown as PoolClient};
}
it("records deduplicated processed population and conserved shares without changing any money",async()=>{
  const {client,metrics,query}=fixture();
  await completeTaskCostAllocation(client,"owner","task",roundKey,[b,a,b]);
  expect(query.mock.calls[0][1]).toEqual(["owner","task",roundKey]);
  expect(metrics.completedReservationAllocation).toMatchObject({method:"task-equal",additionalSpendMicros:0,
    shares:[{companyKey:a,amountMicros:6},{companyKey:b,amountMicros:5}],unallocatedMicros:0});
  expect(metrics.reservationAllocation).toEqual({method:"task-pending"});
  expect(query.mock.calls[1][0]).not.toMatch(/set (?:reserved|occupied|settled)_micros/);
  await completeTaskCostAllocation(client,"owner","task",roundKey,[a,b]);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith("update"))).toHaveLength(1);
  await expect(completeTaskCostAllocation(client,"owner","task",roundKey,[a])).rejects.toThrow("population changed");
});
it("keeps legacy missing population unknown and a proven empty population unallocated",async()=>{
  const {client,query,metrics}=fixture();
  expect(await completeTaskCostAllocation(client,"owner","task",roundKey,undefined)).toBeNull();
  expect(query).not.toHaveBeenCalled();
  await completeTaskCostAllocation(client,"owner","task",roundKey,[]);
  expect(metrics.completedReservationAllocation).toMatchObject({method:"zero-company-task",shares:[],unallocatedMicros:11});
});
it("allocates late invoices from stored completed population, preserving unknown reports",async()=>{
  const {client,metrics}=fixture();
  await completeTaskCostAllocation(client,"owner","task",roundKey,[a,b]);
  const base={reservationMetrics:metrics,occupiedBefore:11,occupiedAfter:7};
  expect(observationCostAllocation({...base,kind:"invoice",amountMicros:7}).observation)
    .toMatchObject({method:"task-equal",shares:[{companyKey:a,amountMicros:4},{companyKey:b,amountMicros:3}]});
  expect(observationCostAllocation({...base,kind:"provider-report",amountMicros:null}).observation)
    .toMatchObject({amountKnown:false,shares:[],unallocatedMicros:null});
  metrics.costAllocationCompletion={version:"task-cost-completion-v1",roundKey:a,processedCompanyKeys:[a]};
  expect(observationCostAllocation({...base,kind:"invoice",amountMicros:7}).observation)
    .toMatchObject({method:"task-pending",shares:[],unallocatedMicros:7});
});
