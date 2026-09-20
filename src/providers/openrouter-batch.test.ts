import {expect,it,vi,afterEach} from "vitest";
import {batchPayload,readOpenRouterBatch,submitOpenRouterBatch,assertOpenRouterResponse,matchesBatchModel} from "./openrouter-batch";
afterEach(()=>vi.unstubAllEnvs());
const batch={id:"batch_public_fixture",model:"z-ai/glm-5.3",endpoint:"/v1/chat/completions",status:"validating",request_counts:{total:1,completed:0,failed:0},results:null};
it("accepts the observed dated canonical model while rejecting variant substitution",()=>{
  expect(matchesBatchModel("z-ai/glm-5.3-20260816","z-ai/glm-5.3:batch")).toBe(true);
  expect(matchesBatchModel("z-ai/glm-5.3-flash-20260816","z-ai/glm-5.3:batch")).toBe(false);
  expect(matchesBatchModel("z-ai/glm-5.3-other","z-ai/glm-5.3:batch")).toBe(false);
});
it("retains acknowledgement identity when optional response fields change",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-test-value");
  await expect(submitOpenRouterBatch(batchPayload("z-ai/glm-5.3:batch","fireworks","one",{}),async()=>Response.json({id:"batch_public_fixture",status:"validating"},{status:202}))).rejects.toMatchObject({remoteId:"batch_public_fixture"});
});
it("uses the batch endpoint contract with required field ordering and a pinned provider",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-test-value");
  const payload=batchPayload("z-ai/glm-5.3:batch","fireworks","one",{messages:[],tools:[],max_tokens:1024});
  expect(Object.keys(payload)).toEqual(["endpoint","model","provider","completion_window","requests"]);
  expect(payload.model).toBe("z-ai/glm-5.3");expect(payload.provider).toEqual({only:["fireworks"]});
  const transport=vi.fn(async()=>Response.json(batch,{status:202}));
  expect((await submitOpenRouterBatch(payload,transport)).status).toBe("validating");
  expect(transport.mock.calls[0]).toEqual(expect.arrayContaining(["https://openrouter.ai/api/v1/batches"]));
});
it("rejects forged receipt IDs and mismatched responses",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-test-value");
  const transport=vi.fn(async()=>Response.json(batch));
  await expect(readOpenRouterBatch("../other-tenant",transport)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
  await expect(readOpenRouterBatch("batch_different",transport)).rejects.toThrow("identity mismatch");
});
it("classifies regional failures without retaining echoed provider bodies",async()=>{
  await expect(assertOpenRouterResponse(Response.json({error:{message:"This model is not available in your region.",metadata:{raw:"private"}}},{status:403}))).rejects.toMatchObject({status:403,reason:"region-unavailable",message:"OpenRouter HTTP 403: region-unavailable"});
});
