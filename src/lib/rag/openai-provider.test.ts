import {afterEach,expect,it,vi} from "vitest";
import {generateGroundedAnswer} from "./openai-provider";
import type {RetrievedChunk} from "./types";

afterEach(()=>vi.unstubAllEnvs());

function publicChunk():RetrievedChunk{return {id:crypto.randomUUID(),documentId:crypto.randomUUID(),collection:"product",
  title:"Public fixture",content:"Public product fact",sourceType:"public-product-datasheet",authorityLevel:5,
  headingPath:[],retrievalSignals:["structured"],corroborated:true,score:0.9,metadata:{},visibility:"shared"};}
function configure(){vi.stubEnv("KIMI_API_KEY","synthetic-never-sent");vi.stubEnv("KIMI_BASE_URL","https://api.moonshot.cn/v1");
  vi.stubEnv("KIMI_RAG_MODEL","kimi-k3");}

it("serializes one Kimi K3 JSON request for the public RAG answer",async()=>{
  configure();const captured:Request[]=[];
  const answer=await generateGroundedAnswer("Question",[publicChunk()],async(input,init)=>{
    captured.push(new Request(input,init));return Response.json({model:"kimi-k3",choices:[{finish_reason:"stop",
      message:{content:JSON.stringify({answer:"Grounded [KB:fixture]"})}}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}});
  });
  expect(answer).toContain("Grounded");expect(captured).toHaveLength(1);
  const request=captured[0],body=await request.json() as Record<string,unknown>;
  expect(request.url).toBe("https://api.moonshot.cn/v1/chat/completions");
  expect(body).toMatchObject({model:"kimi-k3",max_completion_tokens:4096,response_format:{type:"json_object"}});
  expect(body).not.toHaveProperty("provider");expect(body).not.toHaveProperty("max_tokens");expect(body).not.toHaveProperty("temperature");
  expect(request.headers.get("authorization")).toBe("Bearer synthetic-never-sent");
  expect(JSON.stringify(body)).toContain("Answer only from the supplied knowledge-base sources");
});

it("does not retry a rejected Kimi answer",async()=>{
  configure();const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{message:"regional failure"}},{status:403}));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("regional failure");
  expect(transport).toHaveBeenCalledOnce();
});

it("rejects invalid Kimi JSON instead of adopting an ungrounded response",async()=>{
  configure();const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{finish_reason:"stop",
    message:{content:"not-json"}}]}));
  await expect(generateGroundedAnswer("Question",[publicChunk()],transport)).rejects.toThrow("invalid RAG answer JSON");
  expect(transport).toHaveBeenCalledOnce();
});
