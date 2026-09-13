import { expect,it } from "vitest";
import { taskCounts, searchTaskStatusLabel } from "./task-summary";
it("preserves measured zero while unknown and malformed counts remain unknown",()=>{
  expect(taskCounts({accepted:0,qualified:12,discovered:-2,assessed:"8",creditsUsed:NaN}))
    .toEqual({accepted:0,qualified:12,discovered:null,assessed:null,creditsUsed:null});
});
it("labels a finished search by saved results without inventing a historical count",()=>{
  expect(searchTaskStatusLabel("completed",0,1)).toBe("运行结束，目标未填满");
  expect(searchTaskStatusLabel("completed",1,1)).toBe("目标已满足");
  expect(searchTaskStatusLabel("completed",null,1)).toBe("运行结束，最终数量未记录");
  expect(searchTaskStatusLabel("failed",0,1)).toBe("失败");
});
