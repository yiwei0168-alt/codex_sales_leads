import {expect,it} from "vitest";
import {kimiOutputLimit} from "./kimi-contract";
it("uses the documented total completion cap for K3 and preserves K2 caps",()=>{
  expect(kimiOutputLimit("kimi-k3",12000)).toEqual({max_completion_tokens:12000});
  expect(kimiOutputLimit("kimi-k2.6",4000)).toEqual({max_tokens:4000});
});
it.each([NaN,Infinity,-1,0,1.5,1048577])("rejects invalid output limits %s",value=>expect(()=>kimiOutputLimit("kimi-k3",value)).toThrow());
