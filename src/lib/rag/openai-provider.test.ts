import { afterEach,expect,it,vi } from "vitest";

import { billingPolicy,quoteRequest } from "@/lib/billing/policy";
import { assertRequestContract } from "@/lib/billing/request-contract";
import { createGroundedAnswerModel,generateGroundedAnswer } from "./openai-provider";
import type {RetrievedChunk} from "./types";

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
    Date.parse("2026-09-15T06:30:00Z"),"openrouter-sol-rag-answer-primary-credits");
  expect(body).toMatchObject({model:"openai/gpt-5.6-sol",stream:false,max_tokens:4096,
    provider:{require_parameters:true,data_collection:"deny",only:["openai"],allow_fallbacks:false}});
  expect(request.headers.get("x-openrouter-metadata")).toBe("enabled");
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("max_completion_tokens");
  expect(body).not.toHaveProperty("response_format");
  expect(()=>assertRequestContract(rule,body,"",request.method,request.headers)).not.toThrow();
  expect(bytes).toBeLessThanOrEqual(61_440);
});

function publicChunk():RetrievedChunk{return {id:crypto.randomUUID(),documentId:crypto.randomUUID(),collection:"product",
  title:"Public fixture",content:"Public product fact",sourceType:"public-product-datasheet",authorityLevel:5,
  headingPath:[],retrievalSignals:["structured"],corroborated:true,score:0.9,metadata:{},visibility:"shared"};}
function json(value:unknown,status=200,headers?:Record<string,string>){return Response.json(value,{status,headers});}

it("uses exactly one Bedrock attempt after a confirmed upstream primary failure",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");vi.stubEnv("OPENAI_GENERATION_MODEL","openai/gpt-5.6-sol");
  const requests:Request[]=[];let call=0;
  const answer=await generateGroundedAnswer("Question",[publicChunk()],async(input,init)=>{
    requests.push(new Request(input,init));call++;
    if(call===1)return json({error:{code:403,message:"not persisted"},openrouter_metadata:{attempt:1,
      attempts:[{provider:"OpenAI",status:403}]}},403,{"x-generation-id":"primary-id"});
    return json({id:"fallback-id",model:"openai/gpt-5.6-sol",choices:[{finish_reason:"stop",
      message:{role:"assistant",content:"Grounded [KB:00000000-0000-0000-0000-000000000000]"}}],
      usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}});
  });
  expect(answer).toContain("Grounded");expect(requests).toHaveLength(2);
  const bodies=await Promise.all(requests.map(request=>request.json())) as Array<{provider:{only:string[]};max_tokens:number}>;
  expect(bodies.map(body=>body.provider.only)).toEqual([["openai"],["amazon-bedrock/us-east-1"]]);
  expect(bodies.every(body=>body.max_tokens===4096)).toBe(true);
});

it.each([{status:401,metadata:{}},{status:400,metadata:{attempt:1,attempts:[{provider:"OpenAI",status:400}]}}])(
  "does not fall back for an unconfirmed gateway or ineligible request failure %#",async({status,metadata})=>{
    vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");
    const transport=vi.fn<typeof fetch>().mockResolvedValue(json({error:{code:status,message:"not persisted"},
      openrouter_metadata:metadata},status));
    await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("Connection error");
    expect(transport).toHaveBeenCalledOnce();
  });

it("stops after a failed Bedrock fallback without a third request",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");
  const transport=vi.fn<typeof fetch>().mockImplementation(()=>Promise.resolve(json({error:{code:503,message:"not persisted"},
    openrouter_metadata:{attempt:1,attempts:[{provider:"Synthetic",status:503}]}},503)));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("Connection error");
  expect(transport).toHaveBeenCalledTimes(2);
});
