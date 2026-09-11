import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({start:vi.fn(),finish:vi.fn()}));
vi.mock("@/lib/operation-metrics",()=>({startOperation:m.start,finishOperation:m.finish,bestEffortMetric:async(write:()=>Promise<unknown>)=>{try{await write();return true;}catch{return false;}}}));
import {recordGenerationAttempt} from "./generation-attempt";
beforeEach(()=>{vi.clearAllMocks();m.start.mockResolvedValue("event");m.finish.mockResolvedValue(undefined);});
it("reserves before generation and links persisted output without claiming delivery",async()=>{
  const run=vi.fn(async()=>{expect(m.start).toHaveBeenCalled();return {body:"private"};});
  expect(await recordGenerationAttempt("u","development-generation",20,run,()=>({modelCalls:2,latencyMs:10,promptTokens:50}))).toEqual({body:"private"});
  expect(m.finish).toHaveBeenCalledWith("u","event","completed",expect.objectContaining({inputTokens:50,costUsd:null,usageBoundary:"persisted-draft-not-approved-or-sent"}));expect(JSON.stringify(m.finish.mock.calls)).not.toContain("private");
});
it("persists failed unknown-cost attempts without raw provider error",async()=>{
  await expect(recordGenerationAttempt("u","development-revision",1,async()=>{throw new Error("secret-error");},()=>({modelCalls:0,latencyMs:0}))).rejects.toThrow("secret-error");
  expect(m.finish).toHaveBeenCalledWith("u","event","failed",expect.objectContaining({costUsd:null,outputItems:0}));expect(JSON.stringify(m.finish.mock.calls)).not.toContain("secret-error");
});
it("does not replay a successful paid operation if final metrics cannot save",async()=>{
  m.finish.mockRejectedValue(new Error());const run=vi.fn().mockResolvedValue("saved");expect(await recordGenerationAttempt("u","development-generation",0,run,()=>({modelCalls:1,latencyMs:1}))).toBe("saved");expect(run).toHaveBeenCalledTimes(1);
});
