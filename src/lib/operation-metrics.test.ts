import { expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({query:vi.fn().mockResolvedValue([])}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import {startOperation,bestEffortMetric} from "./operation-metrics";
it("reserves an owner-scoped unsettled event before any billable work",async()=>{
  await startOperation("owner","assistant-intent",1,20);expect(m.query).toHaveBeenCalledWith("owner",expect.stringContaining("'running'"),expect.arrayContaining(["owner","assistant-intent",JSON.stringify({inputItems:1,inputCharacters:20,costUsd:null,usageBoundary:"in-progress-unsettled"})]));
});
it("does not leak errors or fail a completed operation when metering fails",async()=>{
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  expect(await bestEffortMetric(async()=>{throw new Error("private credential");})).toBe(false);
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private credential");warn.mockRestore();
});
