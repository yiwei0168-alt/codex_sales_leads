import {afterEach,expect,it,vi} from "vitest";
import {generateGroundedAnswer} from "./openai-provider";
import type {RetrievedChunk} from "./types";
import {currentModelAttempt} from "@/lib/billing/model-attempt-context";
import {getMissingRagConfig,getRagConfig} from "./config";

afterEach(()=>vi.unstubAllEnvs());

function publicChunk():RetrievedChunk{return {id:crypto.randomUUID(),documentId:crypto.randomUUID(),collection:"product",
  title:"Public fixture",content:"Public product fact",sourceType:"public-product-datasheet",authorityLevel:5,
  headingPath:[],retrievalSignals:["structured"],corroborated:true,score:0.9,metadata:{},visibility:"shared"};}
function configure(){vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");vi.stubEnv("OPENROUTER_BASE_URL","https://openrouter.ai/api/v1");
  vi.stubEnv("KIMI_RAG_MODEL","kimi-k3");}

it("serializes one Kimi K3 JSON request for the public RAG answer",async()=>{
  configure();const captured:Request[]=[];
  const answer=await generateGroundedAnswer("Question",[publicChunk()],async(input,init)=>{
    expect(currentModelAttempt()).toMatchObject({provider:"openrouter",task:"rag-answer",attempt:1});
    captured.push(new Request(input,init));return Response.json({model:"kimi-k3",choices:[{finish_reason:"stop",
      message:{content:JSON.stringify({answer:"Grounded [KB:fixture]"})}}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}});
  });
  expect(answer).toContain("Grounded");expect(captured).toHaveLength(1);
  const request=captured[0],body=await request.json() as Record<string,unknown>;
  expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(body).toMatchObject({model:"moonshotai/kimi-k3",max_completion_tokens:4096,response_format:{type:"json_object"}});
  expect(body.provider).toEqual({require_parameters:true,data_collection:"deny",allow_fallbacks:false});expect(request.redirect).toBe("error");expect(body).not.toHaveProperty("max_tokens");expect(body).not.toHaveProperty("temperature");
  expect(request.headers.get("authorization")).toBe("Bearer synthetic-never-sent");
  expect(JSON.stringify(body)).toContain("Answer only from the supplied knowledge-base sources");
});

it("blocks private sources before any gateway request",async()=>{
  configure();const transport=vi.fn<typeof fetch>();
  await expect(generateGroundedAnswer("Question",[{...publicChunk(),sourceType:"private-mailbox-approved",visibility:"private"}],transport))
    .rejects.toThrow("explicitly public-source");
  expect(transport).not.toHaveBeenCalled();
});

it("requires the gateway key despite legacy direct credentials",async()=>{
  configure();vi.stubEnv("OPENROUTER_API_KEY","");vi.stubEnv("KIMI_API_KEY","legacy-test");
  const transport=vi.fn<typeof fetch>();
  expect(getMissingRagConfig()).toContain("OPENROUTER_API_KEY");
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("OPENROUTER_API_KEY");
  expect(transport).not.toHaveBeenCalled();
});

it("retains historical model identity but does not expose a callable remote connection",()=>{
  configure();vi.stubEnv("EMBEDDING_BASE_URL","http://127.0.0.1:9999/v1");
  vi.stubEnv("EMBEDDING_MODEL","fixture-local");vi.stubEnv("EMBEDDING_DIMENSIONS","1536");
  expect(getRagConfig()).toMatchObject({ragAnswerModel:"moonshotai/kimi-k3",
    ragAnswerBaseUrl:"https://openrouter.ai/api/v1",embeddingBaseUrl:"",embeddingApiKey:"",
    embeddingModel:"fixture-local",embeddingDimensions:1536});
});

it("rejects untrusted gateway destinations before transmission",async()=>{
  configure();vi.stubEnv("OPENROUTER_BASE_URL","https://untrusted.example/api/v1");
  const transport=vi.fn<typeof fetch>();
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("OpenRouter HTTPS");
  expect(transport).not.toHaveBeenCalled();
});

it("does not accept valid JSON from a truncated answer",async()=>{
  configure();const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{
    finish_reason:"length",message:{content:JSON.stringify({answer:"Partial but valid JSON"})}}]}));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow();
  expect(transport).toHaveBeenCalledOnce();
});

it("does not retry a rejected Kimi answer",async()=>{
  configure();const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{message:"regional failure"}},{status:403}));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("OpenRouter Kimi HTTP 403");
  expect(transport).toHaveBeenCalledOnce();
});

it("rejects invalid Kimi JSON instead of adopting an ungrounded response",async()=>{
  configure();const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{finish_reason:"stop",
    message:{content:"not-json"}}]}));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("invalid RAG answer JSON");
  expect(transport).toHaveBeenCalledOnce();
});
