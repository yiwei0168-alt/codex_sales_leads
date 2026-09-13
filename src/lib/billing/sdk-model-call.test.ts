import {beforeEach,expect,it,vi} from "vitest";
import OpenAI from "openai";
import {ChatOpenAI} from "@langchain/openai";
const mocks=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn(),quote:vi.fn(),denial:vi.fn()}));
vi.mock("./repository",()=>({reservePaidCall:mocks.reserve,settlePaidCall:mocks.settle}));
vi.mock("./denial-metrics",()=>({recordBudgetDenial:mocks.denial}));
vi.mock("./policy",async original=>({...await original<typeof import("./policy")>(),quoteRequest:mocks.quote}));
import {withSdkModelCall,sdkModelFetch} from "./sdk-model-call";
import {withSpendContext} from "./context";
import {BudgetDeniedError,PaidCallOutcomeUnknownError} from "./policy";

const metadata={provider:"fixture-provider",task:"fixture-task",promptVersion:"fixture-prompt-v1"};
const scope={userId:"owner-a",operationId:"operation-a",stage:"fixture"};
beforeEach(()=>{
  vi.clearAllMocks();mocks.reserve.mockReset().mockResolvedValue("reservation");
  mocks.settle.mockReset().mockResolvedValue(undefined);mocks.denial.mockReset().mockResolvedValue(undefined);
  mocks.quote.mockReset().mockReturnValue({key:"fixture",maximumChargeMicros:100,maximumRequestBytes:10000});
});

it("prevents real OpenAI SDK retries from resending unknown paid work and restores its exact error",async()=>{
  const transport=vi.fn<typeof fetch>().mockRejectedValue(new Error("connection lost"));
  const sdk=new OpenAI({apiKey:"fixture",baseURL:"https://example.test",maxRetries:1,fetch:sdkModelFetch(transport)});
  await expect(withSpendContext(scope,()=>withSdkModelCall(metadata,()=>sdk.embeddings.create({model:"fixture-model",input:["synthetic"]}))))
    .rejects.toBeInstanceOf(PaidCallOutcomeUnknownError);
  expect(transport).toHaveBeenCalledTimes(1);expect(mocks.reserve).toHaveBeenCalledTimes(1);
  expect(mocks.denial).not.toHaveBeenCalled();
  expect(mocks.reserve.mock.calls[0][1]).toMatchObject({requestFingerprint:expect.stringMatching(/^[a-f0-9]{64}$/),modelAttempt:{...metadata,attempt:1,endpointKind:"embeddings"}});
});

it("restores a budget denial through real LangChain and SDK wrapping without any network call",async()=>{
  const denied=new BudgetDeniedError("missing-tariff");mocks.quote.mockImplementation(()=>{throw denied;});
  const transport=vi.fn<typeof fetch>();
  const model=new ChatOpenAI({apiKey:"fixture",model:"fixture-model",maxRetries:1,maxTokens:100,
    configuration:{baseURL:"https://example.test",fetch:sdkModelFetch(transport)}});
  await expect(withSpendContext(scope,()=>withSdkModelCall(metadata,()=>model.invoke("synthetic")))).rejects.toBe(denied);
  expect(transport).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.denial).toHaveBeenCalledTimes(1);
});

it("retains bounded SDK retries for reported failures and attributes each actual transport attempt",async()=>{
  const transport=vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({error:{message:"busy"},usage:{cost:0}},{status:503,headers:{"retry-after-ms":"1"}}))
    .mockResolvedValueOnce(Response.json({data:[{index:0,embedding:[0.1]}],model:"fixture-model",usage:{prompt_tokens:1,total_tokens:1}}));
  const sdk=new OpenAI({apiKey:"fixture",baseURL:"https://example.test",maxRetries:1,fetch:sdkModelFetch(transport)});
  await withSpendContext(scope,()=>withSdkModelCall(metadata,()=>sdk.embeddings.create({model:"fixture-model",input:["synthetic"],encoding_format:"float"})));
  expect(transport).toHaveBeenCalledTimes(2);
  const attempts=mocks.reserve.mock.calls.map(call=>call[1].modelAttempt);
  expect(attempts.map(item=>item.attempt)).toEqual([1,2]);
  expect(attempts[0].invocationId).toBe(attempts[1].invocationId);
  expect(JSON.stringify(mocks.reserve.mock.calls)).not.toContain("synthetic");
});

it("isolates a stopped invocation from other users and later invocations on a shared embedding transport",async()=>{
  const send=sdkModelFetch(vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("lost")).mockResolvedValue(Response.json({})));
  const invoke=(userId:string)=>withSpendContext({...scope,userId},()=>withSdkModelCall(metadata,()=>send("https://example.test/embeddings",{
    method:"POST",body:JSON.stringify({model:"fixture-model",input:["synthetic"]}),headers:{"content-type":"application/json"},
  })));
  await expect(invoke("owner-a")).rejects.toBeInstanceOf(PaidCallOutcomeUnknownError);
  expect((await invoke("owner-b")).ok).toBe(true);
  expect(mocks.reserve.mock.calls.map(call=>call[0])).toEqual(["owner-a","owner-b"]);
  expect(mocks.reserve.mock.calls[0][1].modelAttempt.invocationId).not.toBe(mocks.reserve.mock.calls[1][1].modelAttempt.invocationId);
});
