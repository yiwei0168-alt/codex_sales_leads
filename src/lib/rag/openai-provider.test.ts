import { afterEach,expect,it,vi } from "vitest";

import { billingPolicy,quoteRequest } from "@/lib/billing/policy";
import { assertRequestContract } from "@/lib/billing/request-contract";
import { createGroundedAnswerModel } from "./openai-provider";

afterEach(()=>vi.unstubAllEnvs());

it("serializes the production RAG answer model into the dedicated no-network contract",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");
  vi.stubEnv("OPENAI_GENERATION_MODEL","openai/gpt-5.6-sol");
  vi.stubEnv("OPENROUTER_BASE_URL","https://openrouter.ai/api/v1");
  const captured:Request[]=[];
  const model=createGroundedAnswerModel(async(input,init)=>{
    captured.push(new Request(input,init));
    throw new Error("synthetic-capture-no-network");
  },0);
  await expect(model.invoke([{role:"system",content:"instructions"},{role:"user",content:"public facts"}]))
    .rejects.toThrow();
  expect(captured).toHaveLength(1);
  const request=captured[0],body=JSON.parse(await request.text()) as Record<string,unknown>;
  const bytes=Buffer.byteLength(JSON.stringify(body));
  const rule=quoteRequest({origin:new URL(request.url).origin,pathname:new URL(request.url).pathname,
    model:String(body.model),requestBytes:bytes,outputTokens:Number(body.max_tokens)},billingPolicy.rules,
    Date.parse("2026-09-15T06:00:00Z"),"openrouter-sol-rag-answer-credits");
  expect(body).toMatchObject({model:"openai/gpt-5.6-sol",stream:false,max_tokens:8192,
    provider:{require_parameters:true,data_collection:"deny",only:["openai"],allow_fallbacks:false}});
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("max_completion_tokens");
  expect(body).not.toHaveProperty("response_format");
  expect(()=>assertRequestContract(rule,body,"",request.method,request.headers)).not.toThrow();
  expect(bytes).toBeLessThanOrEqual(61_440);
});
