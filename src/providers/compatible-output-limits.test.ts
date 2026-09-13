import {afterEach,expect,it,vi} from "vitest";
import {OpenAiCompatibleProvider} from "./openai-compatible";
import {IncompleteModelOutputError} from "@/lib/billing/policy";
import type {StructuredAiRequest} from "./contracts";

afterEach(()=>vi.unstubAllEnvs());
it.each([['lead-review-secondary',8192],['lead-review-judge',12000],['lead-qualification',8192]] as const)("bounds %s without changing reasoning",async(task,limit)=>{
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
it("uses configurable non-OpenAI fallback limits and never retries truncated valid JSON",async()=>{
  vi.stubEnv("LEAD_FALLBACK_SCORING_MAX_OUTPUT_TOKENS","4096");
  const transport=vi.fn<typeof fetch>(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));expect(body.max_tokens).toBe(4096);expect(body.max_completion_tokens).toBeUndefined();
    return Response.json({choices:[{finish_reason:"length",message:{content:'{"ok":true}'}}]});
  });
  const provider=new OpenAiCompatibleProvider({id:"fixture",apiKey:"fixture",baseUrl:"https://example.test",fetchImplementation:transport,maxAttempts:2});
  const request:StructuredAiRequest<unknown>={task:"lead-qualification",modelVersion:"deepseek/deepseek-v4-flash",promptVersion:"fixture",input:{},evidenceIds:[]};
  await expect(provider.execute(request)).rejects.toBeInstanceOf(IncompleteModelOutputError);
  expect(transport).toHaveBeenCalledTimes(1);
});
