import {expect,it} from "vitest";
import {currentSpendContext,setSpendStage,withProductSpend} from "./context";

it("isolates parallel stages and restores the parent context",async()=>{
  await withProductSpend("owner","root",async()=>{
    const parent=currentSpendContext();
    await Promise.all(["a","b"].map(stage=>withProductSpend("owner",stage,async()=>{
      await Promise.resolve();expect(currentSpendContext()?.stage).toBe(stage);
      expect(currentSpendContext()?.operationId).toBe("operation");setSpendStage(stage+"-end");
    })));
    expect(currentSpendContext()).toBe(parent);expect(parent?.stage).toBe("root");
  },"operation");
  expect(currentSpendContext()).toBeUndefined();
});
it("rejects cross-owner nesting before invoking work",()=>{
  withProductSpend("a","root",()=>expect(()=>withProductSpend("b","child",()=>{throw new Error("should not run");})).toThrow("owner mismatch"));
});
it("assigns independent root IDs and permits an explicit durable child ID",()=>{
  const id=withProductSpend("a","root",()=>currentSpendContext()?.operationId);
  withProductSpend("a","root",()=>{
    expect(currentSpendContext()?.operationId).not.toBe(id);
    withProductSpend("a","child",()=>expect(currentSpendContext()?.operationId).toBe("durable"),"durable");
  });
});
