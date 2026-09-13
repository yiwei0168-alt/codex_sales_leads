import {afterEach,expect,it,vi} from "vitest";
import {OpenAiCompatibleProvider} from "./openai-compatible";
import {IncompleteModelOutputError} from "@/lib/billing/policy";
import type {StructuredAiRequest} from "./contracts";

afterEach(()=>vi.unstubAllEnvs());
it.each([['lead-evidence-correction',8192],['lead-review-secondary',8192],['lead-review-judge',12000],['lead-qualification',8192]] as const)("bounds %s without changing reasoning",async(task,limit)=>{
  const transport=vi.fn<typeof fetch>(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    expect(body.max_completion_tokens).toBe(limit);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning).toEqual({effort:"high"});
    return Response.json({choices:[{finish_reason:"stop",message:{content:'{"ok":true}'}}]});
  });
  const provider=new OpenAiCompatibleProvider({id:"fixture",apiKey:"fixture",baseUrl:"https://example.test",fetchImplementation:transport,extraBody:{max_tokens:99999}});
  await expect(provider.execute({task,modelVersion:"openai/gpt-5.6-sol",promptVersion:"fixture",input:{},evidenceIds:[],reasoningEffort:"high"})).resolves.toMatchObject({output:{ok:true}});
});
it.each([["lead-evidence-correction","LEAD_FALLBACK_CORRECTION_MAX_OUTPUT_TOKENS"],
  ["lead-qualification","LEAD_FALLBACK_SCORING_MAX_OUTPUT_TOKENS"]] as const)("bounds non-OpenAI %s and never retries truncated JSON",async(task,environmentKey)=>{
  vi.stubEnv(environmentKey,"4096");
  const transport=vi.fn<typeof fetch>(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));expect(body.max_tokens).toBe(4096);expect(body.max_completion_tokens).toBeUndefined();
    return Response.json({choices:[{finish_reason:"length",message:{content:'{"ok":true}'}}]});
  });
  const provider=new OpenAiCompatibleProvider({id:"fixture",apiKey:"fixture",baseUrl:"https://example.test",fetchImplementation:transport,maxAttempts:2});
  const request:StructuredAiRequest<unknown>={task,modelVersion:"deepseek/deepseek-v4-flash",promptVersion:"fixture",input:{},evidenceIds:[]};
  await expect(provider.execute(request)).rejects.toBeInstanceOf(IncompleteModelOutputError);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("keys compatible result reuse to the exact route, headers, schema and output limit without the API key",()=>{
  const request:StructuredAiRequest<unknown>={task:"lead-review-secondary",modelVersion:"openai/gpt-5.6-terra",
    promptVersion:"review-v1",input:{candidateId:"one"},evidenceIds:[],reasoningEffort:"medium",
    outputSchema:{type:"object",properties:{ok:{type:"boolean"}}}};
  const provider=(apiKey:string,baseUrl="https://openrouter.ai/api/v1",title="Fixture")=>
    new OpenAiCompatibleProvider({id:"openrouter-review",apiKey,baseUrl,
      defaultHeaders:{"X-OpenRouter-Title":title},extraBody:{provider:{require_parameters:true,data_collection:"deny"}}});
  const baseline=provider("first-test-key").cacheIdentity(request);
  expect(baseline).toMatch(/^[a-f0-9]{64}$/);
  expect(provider("second-test-key").cacheIdentity(request)).toBe(baseline);
  expect(provider("first-test-key","https://example.test/api/v1").cacheIdentity(request)).not.toBe(baseline);
  expect(provider("first-test-key",undefined,"Other title").cacheIdentity(request)).not.toBe(baseline);
  expect(provider("first-test-key").cacheIdentity({...request,input:{candidateId:"two"}})).not.toBe(baseline);
  expect(provider("first-test-key").cacheIdentity({...request,modelVersion:"openai/gpt-5.6-sol"})).not.toBe(baseline);
  expect(provider("first-test-key").cacheIdentity({...request,outputSchema:{type:"object"}})).not.toBe(baseline);
  vi.stubEnv("LEAD_REVIEW_MAX_OUTPUT_TOKENS","4096");
  expect(provider("first-test-key").cacheIdentity(request)).not.toBe(baseline);
});
