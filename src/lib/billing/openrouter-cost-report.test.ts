import {describe,expect,it} from "vitest";
import {openRouterInlineCostReport,reportedDollarsToMicros} from "./openrouter-cost-report";

const request={model:"openai/gpt-5.6-sol",max_completion_tokens:8192,
  messages:[{role:"user",content:"private fixture"}]};
const response={id:"gen-fixture-1",object:"chat.completion",model:request.model,
  choices:[{finish_reason:"stop",message:{content:"private result"}}],
  usage:{cost:0.07,is_byok:false,prompt_tokens:12,completion_tokens:3,total_tokens:15,
    cost_details:{upstream_inference_cost:0.07}}};
const input={url:new URL("https://openrouter.ai/api/v1/chat/completions"),method:"POST",httpStatus:200,
  request,response,now:Date.parse("2026-09-13T10:00:00Z")};

it("uses the complete credits charge once, with hash-only provenance",()=>{
  const result=openRouterInlineCostReport(input);
  expect(result).toMatchObject({kind:"provider-report",complete:true,amountMicros:70000});
  expect(result?.providerRequestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toMatch(/private|gen-fixture|upstream/);
});
it("keeps billing completion separate from truncated model output",()=>{
  expect(openRouterInlineCostReport({...input,response:{...response,choices:[{finish_reason:"length"}]}})?.complete).toBe(true);
});
it.each([true,undefined,null])("does not infer credits-only from BYOK=%s",is_byok=>{
  expect(openRouterInlineCostReport({...input,response:{...response,usage:{...response.usage,is_byok}}})).toBeNull();
});
it.each([undefined,null,-1,Infinity,NaN,"0",1_000_001])("retains unknown or invalid cost %s",cost=>{
  expect(openRouterInlineCostReport({...input,response:{...response,usage:{...response.usage,cost}}})).toBeNull();
});
it("accepts an explicit zero charge, without treating absent cost as zero",()=>{
  expect(openRouterInlineCostReport({...input,response:{...response,usage:{...response.usage,cost:0}}})?.amountMicros).toBe(0);
});
it.each(["2026-09-12T23:59:59Z","2026-09-20T00:00:00Z"])('rejects stale or future source at %s',date=>{
  expect(openRouterInlineCostReport({...input,now:Date.parse(date)})).toBeNull();
});
it.each(["https://example.test/api/v1/chat/completions","https://openrouter.ai:8443/api/v1/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions?route=alternate","https://openrouter.ai/api/v1/responses"])("rejects other endpoint %s",url=>{
  expect(openRouterInlineCostReport({...input,url:new URL(url)})).toBeNull();
});
it.each([{model:"other"},{id:""},{object:"chat.completion.chunk"},{error:{}},{choices:[]},
  {choices:[{finish_reason:"tool_calls"}]},{usage:{...response.usage,total_tokens:14}}])("rejects incomplete/mismatched response %j",override=>{
  expect(openRouterInlineCostReport({...input,response:{...response,...override}})).toBeNull();
});
it.each([{tools:[]},{plugins:[]},{models:[]},{stream:true},{messages:[{role:"user",content:[{type:"image_url"}]}]}])("rejects unsupported contract %j",override=>{
  expect(openRouterInlineCostReport({...input,request:{...request,...override}})).toBeNull();
});
describe("micro-dollar conversion",()=>{
  it.each([[0.07,70000],[0.0000001,1],[1e-10,1],[1.1234567,1123457],[0,0],[1e6,1e12]])("rounds %s to %s once",(dollars,micros)=>{
    expect(reportedDollarsToMicros(dollars)).toBe(micros);
  });
});
