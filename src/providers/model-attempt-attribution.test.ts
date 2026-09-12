import {expect,it,vi} from "vitest";
import {DeepSeekProvider} from "./deepseek";
import {OpenAiCompatibleProvider} from "./openai-compatible";
import {currentModelAttempt,type ModelAttemptContext} from "@/lib/billing/model-attempt-context";

it("links actual DeepSeek retries without serializing telemetry into provider input",async()=>{
  const attempts:ModelAttemptContext[]=[];
  const transport=vi.fn<typeof fetch>(async(_url,init)=>{
    attempts.push({...currentModelAttempt()!});
    expect(String(init?.body)).not.toContain("invocationId");
    return attempts.length===1?Response.json({error:{message:"busy"}},{status:503}):Response.json({choices:[{finish_reason:"stop",message:{content:"{}"}}]});
  });
  await new DeepSeekProvider({apiKey:"fixture",fetchImplementation:transport,maxAttempts:2}).execute({task:"lead-qualification",promptVersion:"v2",modelVersion:"deepseek-v4-flash",input:{},evidenceIds:[]});
  expect(attempts.map(item=>item.attempt)).toEqual([1,2]);
  expect(attempts[0].invocationId).toBe(attempts[1].invocationId);
  expect(attempts[0]).toMatchObject({provider:"deepseek",task:"lead-qualification",promptVersion:"v2"});
});
it("captures compatible-provider attribution within the transport only",async()=>{
  const transport=vi.fn<typeof fetch>(async()=>{
    expect(currentModelAttempt()).toMatchObject({provider:"fallback",task:"lead-qualification",promptVersion:"v3",attempt:1,scoringVersion:"2.1.0"});
    return Response.json({choices:[{finish_reason:"stop",message:{content:"{}"}}]});
  });
  await new OpenAiCompatibleProvider({id:"fallback",apiKey:"fixture",baseUrl:"https://example.test",fetchImplementation:transport,maxAttempts:1}).execute({task:"lead-qualification",promptVersion:"v3",modelVersion:"model",input:{scoringRubric:{policy:{version:"2.1.0"}}},evidenceIds:[]});
  expect(currentModelAttempt()).toBeUndefined();
});
