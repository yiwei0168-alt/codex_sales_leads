import {expect,it} from "vitest";
import {currentModelAttempt,metricIdentifier,withModelAttempt} from "./model-attempt-context";

it("isolates concurrent invocations and leaves no context outside a call",async()=>{
  const values=await Promise.all(["first","second"].map(invocationId=>withModelAttempt({invocationId,provider:"deepseek",task:"score",promptVersion:"v1",attempt:1},async()=>{
    await Promise.resolve();return currentModelAttempt()?.invocationId;
  })));
  expect(values).toEqual(["first","second"]);
  expect(currentModelAttempt()).toBeUndefined();
});
it("rejects arbitrary text and query strings in metric identifiers",()=>{
  expect(metricIdentifier("openai/gpt-test:extended")).toBe("openai/gpt-test:extended");
  for(const value of [null,"private company text","url?key=secret","x".repeat(201)])expect(metricIdentifier(value)).toBeNull();
});
