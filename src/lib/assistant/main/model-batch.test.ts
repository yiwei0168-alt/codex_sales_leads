import {expect,it,vi,afterEach} from "vitest";
import {batchModelResult,ModelBatchPending} from "./model-batch";
import {buildMainAgentGraph} from "./graph";
import {batchResponseSchema} from "@/providers/openrouter-batch";
import {defaultModelConfig} from "./product";
afterEach(()=>vi.unstubAllEnvs());
const expected={model:"z-ai/glm-5.3:batch",customId:"one"};
const receipt={id:"batch_one",model:"z-ai/glm-5.3",endpoint:"/v1/chat/completions",status:"completed",request_counts:{total:1,completed:1,failed:0},
  usage:{prompt_tokens:20,completion_tokens:10,cost:0.000036},results:[{custom_id:"one",response:{status_code:200,body:{choices:[{message:{role:"assistant",content:"OK"},finish_reason:"stop"}]}}}]};
it("makes synchronous GLM the default without modifying old pinned batch configurations",()=>{
  vi.stubEnv("MAIN_AGENT_MODEL","");vi.stubEnv("MAIN_AGENT_PROVIDERS","");
  expect(defaultModelConfig()).toMatchObject({model:"z-ai/glm-5.3",providers:["fireworks"]});
  vi.stubEnv("MAIN_AGENT_MODEL",expected.model);
  expect(defaultModelConfig()).toMatchObject({model:expected.model,providers:["fireworks"]});
  vi.stubEnv("MAIN_AGENT_MODEL","openai/gpt-5.6-sol");vi.stubEnv("MAIN_AGENT_PROVIDERS","openai");
  expect(defaultModelConfig()).toMatchObject({model:"openai/gpt-5.6-sol",providers:["openai"]});
});
it("accepts only a complete matching result and preserves provider usage",()=>{
  expect(batchModelResult(batchResponseSchema.parse(receipt),expected)).toMatchObject({message:{content:"OK"},usage:{cost:0.000036}});
  expect(batchModelResult(batchResponseSchema.parse({...receipt,model:"z-ai/glm-5.3-20260816"}),expected)?.message.content).toBe("OK");
  expect(batchModelResult(batchResponseSchema.parse({...receipt,status:"in_progress",results:null,request_counts:{total:1,completed:0,failed:0}}),expected)).toBeUndefined();
  for(const patch of [{model:"other/model"},{request_counts:{total:2,completed:2,failed:0}},{results:[{...receipt.results[0],custom_id:"wrong"}]},{status:"failed"}]) {
    expect(()=>batchModelResult(batchResponseSchema.parse({...receipt,...patch}),expected)).toThrow();
  }
});
it("defers the current model step without counting an acknowledgement as an answer",async()=>{
  const tool=vi.fn();
  const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),model:async()=>{throw new ModelBatchPending();},tool});
  const output=await graph.invoke({messages:[{role:"user",content:"Public probe"}],steps:0,pending:[],status:"running",seen:{},instructionIds:[],reply:""});
  expect(output.status).toBe("queued");expect(output.steps).toBe(0);expect(tool).not.toHaveBeenCalled();
});
it("discards obsolete proposed actions when account policy changes during inference",async()=>{
  let revision="first";const tool=vi.fn();let turns=0;
  const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[],policyRevision:revision}),model:async()=>{
    if(!turns++){revision="changed";return {role:"assistant",content:null,tool_calls:[{id:"stale",type:"function",function:{name:"execute_tool",arguments:"{}"}}]};}
    return {role:"assistant",content:"Replanned under updated policy"};
  },tool});
  const output=await graph.invoke({messages:[{role:"user",content:"Public probe"}],steps:0,pending:[],status:"running",seen:{},instructionIds:[],reply:""});
  expect(output.status).toBe("completed");expect(output.decisionRevision).toBe(1);expect(tool).not.toHaveBeenCalled();
});
