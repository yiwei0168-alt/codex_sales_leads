import { expect,it } from "vitest";
import { taskCounts } from "./task-summary";
it("preserves measured zero while unknown and malformed counts remain unknown",()=>{
  expect(taskCounts({accepted:0,qualified:12,discovered:-2,assessed:"8",creditsUsed:NaN}))
    .toEqual({accepted:0,qualified:12,discovered:null,assessed:null,creditsUsed:null});
});
