import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({start:vi.fn().mockResolvedValue("id"),finish:vi.fn()}));
vi.mock("@/lib/operation-metrics",()=>({startOperation:m.start,finishOperation:m.finish,bestEffortMetric:async(run:()=>Promise<void>)=>{try{await run();return true;}catch{return false;}}}));
import {recordBudgetDenial} from "./denial-metrics";
import {BudgetDeniedError} from "./policy";
it("records only a zero-cost denied attempt, not a zero-cost operation",async()=>{
  await recordBudgetDenial({userId:"owner",stage:"score",operationId:"op"},new BudgetDeniedError("missing-tariff"),4);
  expect(m.finish).toHaveBeenCalledWith("owner","id","failed",expect.objectContaining({costUsd:0,usageBoundary:"blocked-http-attempt-only-not-entire-operation",discardedReasonCounts:{"missing-tariff":1}}));
});
it("telemetry failure cannot replace the original budget failure",async()=>{
  m.start.mockRejectedValueOnce(new Error("private db error"));
  await expect(recordBudgetDenial({userId:"owner",stage:"score",operationId:"op"},new BudgetDeniedError("budget-frozen"),1)).resolves.toBeUndefined();
});
