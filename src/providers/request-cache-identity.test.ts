import {afterEach,expect,it,vi} from "vitest";
import {DeepSeekProvider} from "./deepseek";
import {ResilientAiProvider} from "./resilient-ai";
import type {StructuredAiRequest} from "./contracts";
import {createHash} from "node:crypto";
import {deepSeekRequestBody} from "./deepseek-request";

afterEach(()=>vi.unstubAllEnvs());
const request:StructuredAiRequest<unknown>={task:"lead-evidence-correction",modelVersion:"deepseek-v4-flash",promptVersion:"v1",input:{candidates:["a","b"]},evidenceIds:["ev-a","ev-b"],outputSchema:{type:"object"}};
it("binds complete payload, order, model, transport and generation settings without exposing credentials",()=>{
  const provider=new DeepSeekProvider({apiKey:"fixture-secret",baseUrl:"https://example.test"});
  const original=provider.cacheIdentity(request);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  expect(provider.cacheIdentity({...request})).toBe(original);
  for(const changed of [
    {...request,input:{candidates:["b","a"]}},
    {...request,input:{candidates:["a"]}},
    {...request,evidenceIds:["new-a","new-b"]},
    {...request,modelVersion:"deepseek-v4-pro"},
    {...request,promptVersion:"v2"},
    {...request,outputSchema:{type:"array"}},
  ])expect(provider.cacheIdentity(changed)).not.toBe(original);
  expect(new DeepSeekProvider({baseUrl:"https://other.test"}).cacheIdentity(request)).not.toBe(original);
  vi.stubEnv("DEEPSEEK_TEMPERATURE","1");
  expect(provider.cacheIdentity(request)).not.toBe(original);
  vi.stubEnv("DEEPSEEK_TEMPERATURE","0");
  vi.stubEnv("DEEPSEEK_TRANSPORT","anthropic");
  expect(provider.cacheIdentity(request)).not.toBe(original);
});
it("resilient identity describes primary only and unavailable contracts fail closed",()=>{
  const provider=new DeepSeekProvider({baseUrl:"https://example.test"});
  expect(new ResilientAiProvider(provider).cacheIdentity(request)).toBe(provider.cacheIdentity(request));
  expect(new ResilientAiProvider({id:"unknown",execute:vi.fn()}).cacheIdentity(request)).toBe("");
});
it("invalidates pre-approval Flash cache contracts but leaves Pro contracts unchanged",()=>{
  const endpoint="https://api.deepseek.com";
  const provider=new DeepSeekProvider({baseUrl:endpoint});
  for(const model of ["deepseek-v4-flash","deepseek-flash","deepseek-v4-pro"]){
    const input={...request,modelVersion:model};
    const before=createHash("sha256").update(JSON.stringify({version:"deepseek-wire-cache-v1",provider:"deepseek",
      endpoint,...deepSeekRequestBody(input,model)})).digest("hex");
    if(model.includes("pro"))expect(provider.cacheIdentity(input)).toBe(before);
    else expect(provider.cacheIdentity(input)).not.toBe(before);
  }
});
