import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({start:vi.fn(),finish:vi.fn()}));
vi.mock("./operation-metrics",()=>({startOperation:m.start,finishOperation:m.finish,bestEffortMetric:async(run:()=>Promise<void>)=>{try{await run();return true;}catch{return false;}}}));
import {trackedOperation} from "./tracked-operation";
import {currentSpendContext,withProductSpend} from "./billing/context";
beforeEach(()=>{vi.resetAllMocks();m.start.mockResolvedValue("operation");});
const describe=()=>({outputItems:1,validOutputItems:1,downstreamUsedItems:null,usageBoundary:"returned-not-adopted",optimizationOpportunity:"Reuse output"});
it("preserves the enclosing task budget while recording a separate stage",async()=>{
  await withProductSpend("owner","search",()=>trackedOperation("owner","rag",1,10,async()=>{
    expect(currentSpendContext()?.operationId).toBe("search-action");return "answer";
  },describe),"search-action");
  expect(m.finish.mock.calls[0][1]).toBe("operation");
});
it("binds durable attribution and persists only aggregate output",async()=>{
  const result=await trackedOperation("owner","rag",1,10,async()=>{expect(currentSpendContext()?.operationId).toBe("operation");return "private answer";},describe);
  expect(result).toBe("private answer");expect(JSON.stringify(m.finish.mock.calls)).not.toContain("private answer");expect(m.finish.mock.calls[0][3]).toMatchObject({costUsd:null,downstreamUsedItems:null});
});
it("failed operations keep unknown charges",async()=>{
  await expect(trackedOperation("owner","rag",1,10,async()=>{throw new Error("private failure");},describe)).rejects.toThrow("private failure");
  expect(m.finish.mock.calls[0][3]).toMatchObject({outputItems:0,costUsd:null});expect(JSON.stringify(m.finish.mock.calls)).not.toContain("private failure");
});
it("description or metric failures never replay successful work",async()=>{
  const run=vi.fn().mockResolvedValue("saved");
  expect(await trackedOperation("owner","rag",1,1,run,()=>{throw new Error("metric error");})).toBe("saved");expect(run).toHaveBeenCalledOnce();
});
