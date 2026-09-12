import {afterEach,expect,it,vi} from "vitest";
import {assertLeadRequestBytes,leadRequestByteLimit,LeadRequestTooLargeError} from "./lead-request-bounds";
import {leadRequestBatches} from "./lead-request-batches";
import {deepSeekRequestBody} from "./deepseek-request";
import {DeepSeekProvider} from "./deepseek";
import {OpenAiCompatibleProvider} from "./openai-compatible";
import type {StructuredAiRequest} from "./contracts";

afterEach(()=>vi.unstubAllEnvs());
const requestFor=(items:string[]):StructuredAiRequest<unknown>=>({task:"lead-evidence-correction",modelVersion:"deepseek-v4-flash",promptVersion:"fixture",input:{candidates:items},evidenceIds:[],outputSchema:{type:"object"}});
it("uses approved mode-specific byte caps and includes UTF8 bytes",()=>{
  const request=requestFor([]);
  expect(leadRequestByteLimit(request)).toBe(36864);
  expect(leadRequestByteLimit({...request,task:"lead-qualification",input:{scoringRubric:{outputMode:"score-only"}}})).toBe(57344);
  expect(leadRequestByteLimit({...request,task:"lead-qualification"})).toBe(61440);
  expect(()=>assertLeadRequestBytes(request,"x".repeat(36864))).not.toThrow();
  expect(()=>assertLeadRequestBytes(request,"界".repeat(12289))).toThrow(LeadRequestTooLargeError);
});
it("splits by full bytes, preserving every candidate in order and smaller count limits",()=>{
  const candidates=Array.from({length:7},(_,index)=>`${index}${"界".repeat(5000)}`);
  const batches=leadRequestBatches(candidates,requestFor,5,100000);
  expect(batches.flat()).toEqual(candidates);
  expect(batches.map(batch=>batch.length)).toEqual([2,2,2,1]);
  for(const batch of batches)expect(()=>assertLeadRequestBytes(requestFor(batch),deepSeekRequestBody(requestFor(batch)).body)).not.toThrow();
  expect(leadRequestBatches(["a","b","c"],requestFor,1,100000).map(batch=>batch.length)).toEqual([1,1,1]);
});
it("counts schema and escaped user payload and rejects oversized singletons before scheduling",()=>{
  expect(()=>leadRequestBatches(["small","界".repeat(20000)],requestFor,5,100000)).toThrow(LeadRequestTooLargeError);
  const request={...requestFor([]),outputSchema:{description:"s".repeat(40000)}};
  expect(()=>assertLeadRequestBytes(request,deepSeekRequestBody(request).body)).toThrow(LeadRequestTooLargeError);
  expect(leadRequestBatches([],requestFor,5,100000)).toEqual([]);
});
it("wire serializer exactly matches both DeepSeek transports without changing output/thinking",async()=>{
  for(const mode of ["anthropic","chat"]){
    vi.stubEnv("DEEPSEEK_TRANSPORT",mode);
    const request=requestFor(["引号\"和换行\n"]);
    const expected=deepSeekRequestBody(request);
    const transport=vi.fn<typeof fetch>(async(_url,init)=>{
      expect(init?.body).toBe(expected.body);
      const parsed=JSON.parse(String(init?.body));
      expect(parsed.max_tokens).toBe(8192);
      return Response.json(mode==="anthropic"?{stop_reason:"end_turn",content:[{type:"text",text:"{}"}]}:{choices:[{finish_reason:"stop",message:{content:"{}"}}]});
    });
    await new DeepSeekProvider({apiKey:"fixture",fetchImplementation:transport,maxAttempts:1}).execute(request);
  }
});
it("both real wrappers block oversize before any transport or retry",async()=>{
  const transport=vi.fn<typeof fetch>();
  const request=requestFor(["界".repeat(20000)]);
  for(const provider of [new DeepSeekProvider({apiKey:"fixture",fetchImplementation:transport,maxAttempts:3}),new OpenAiCompatibleProvider({id:"fixture",apiKey:"fixture",baseUrl:"https://example.test",fetchImplementation:transport,maxAttempts:2})]){
    await expect(provider.execute(request)).rejects.toBeInstanceOf(LeadRequestTooLargeError);
  }
  expect(transport).not.toHaveBeenCalled();
});
