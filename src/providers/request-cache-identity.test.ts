import {afterEach,expect,it,vi} from "vitest";
import {DeepSeekProvider} from "./deepseek";
import {ResilientAiProvider} from "./resilient-ai";
import {OpenAiCompatibleProvider} from "./openai-compatible";
import {paidRequestFingerprint} from "@/lib/billing/paid-request-fingerprint";
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
  expect(new ResilientAiProvider(provider).paidRequestFingerprint(request)).toBe(provider.paidRequestFingerprint(request));
  expect(new ResilientAiProvider({id:"unknown",execute:vi.fn()}).paidRequestFingerprint(request)).toBe("");
});
it.each(["chat-completions","anthropic"])("matches the budget replay fingerprint for %s",transport=>{
  vi.stubEnv("DEEPSEEK_TRANSPORT",transport==="anthropic"?"anthropic":"chat");
  const provider=new DeepSeekProvider({apiKey:"fixture-secret",baseUrl:"https://example.test"});
  const {body,useAnthropicTransport}=deepSeekRequestBody(request,request.modelVersion);
  const expected=createHash("sha256").update(JSON.stringify({version:"paid-request-replay-v1",
    method:"POST",origin:"https://example.test",pathname:useAnthropicTransport
      ?"/anthropic/v1/messages":"/chat/completions",query:"",body})).digest("hex");
  expect(provider.paidRequestFingerprint(request)).toBe(expected);
  expect(provider.paidRequestFingerprint(request)).not.toContain("fixture-secret");
  expect(provider.paidRequestFingerprint({...request,input:{candidates:["changed"]}})).not.toBe(expected);
  vi.stubEnv("DEEPSEEK_TEMPERATURE","1");
  expect(provider.paidRequestFingerprint(request)).not.toBe(expected);
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
it("matches the paid HTTP replay identity for the actual compatible route",()=>{
  const provider=new OpenAiCompatibleProvider({id:"fixture-route",apiKey:"fixture-secret",
    baseUrl:"https://example.test/v1",maxAttempts:1,
    extraBody:{provider:{only:["OpenAI"]}}});
  const actual={...request,modelVersion:"openai/gpt-4o-mini"};
  const seen:string[]=[];
  const transport=new OpenAiCompatibleProvider({id:"fixture-route",apiKey:"fixture-secret",
    baseUrl:"https://example.test/v1",maxAttempts:1,
    extraBody:{provider:{only:["OpenAI"]}},
    fetchImplementation:async(input,init)=>{
      seen.push(paidRequestFingerprint(String(init?.method),new URL(String(input)),String(init?.body)));
      return Response.json({id:"fixture",model:actual.modelVersion,
        choices:[{finish_reason:"stop",message:{content:'{"assessments":[]}'}}]});
    }});
  expect(provider.paidRequestFingerprint(actual)).toMatch(/^[a-f0-9]{64}$/);
  expect(provider.paidRequestFingerprint(actual)).not.toContain("fixture-secret");
  return transport.execute(actual).then(()=>{
    expect(seen).toEqual([provider.paidRequestFingerprint(actual)]);
    expect(provider.paidRequestFingerprint({...actual,modelVersion:"openai/gpt-4o"}))
      .not.toBe(provider.paidRequestFingerprint(actual));
  });
});
