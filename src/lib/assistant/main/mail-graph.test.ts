import {expect,it,vi} from "vitest";
import {MemorySaver} from "@langchain/langgraph";
import {buildMailDeliveryGraph} from "./mail-graph";
import {result,type AgentRun} from "./contracts";
const context={userId:"user",runId:"run",leaseToken:"lease",role:"member" as const};
const run={control:null,instructions:[],execution_kind:"mail",execution_spec:{batchId:"reviewed-mail",items:[{itemId:"mail",connectionId:"11111111-1111-4111-8111-111111111111",to:"recipient@example.invalid",subject:"Reviewed",body:"Final body"}]}} as unknown as AgentRun;
it("uses a durable deterministic graph with an exact batch and no main-model stage",async()=>{
  const execute=vi.fn(async()=>result({sent:1,total:1}));
  const graph=buildMailDeliveryGraph(context,run,new MemorySaver(),{boundary:async()=>({...run,role:"member"}),execute});
  const config={configurable:{thread_id:"synthetic:mail"}};
  expect((await graph.invoke({status:"running",reply:""},config)).status).toBe("completed");
  expect((await graph.getState(config)).values.output).toMatchObject({status:"success"});
  expect(execute.mock.calls[0]).toEqual(expect.arrayContaining([run.execution_spec,"reviewed-mail-batch",{...context,instructionIds:[]}]));
});
it("does not send after an instruction or cancellation at the boundary",async()=>{
  const execute=vi.fn();
  for(const changed of [{...run,control:"cancel" as const},{...run,instructions:[{id:"new",content:"Change recipient"}]}]) {
    const graph=buildMailDeliveryGraph(context,run,undefined,{boundary:async()=>({...changed,role:"member"}),execute});
    expect((await graph.invoke({status:"running",reply:""})).status).toBe(changed.control?"cancelled":"partial");
  }
  expect(execute).not.toHaveBeenCalled();
});
it("retains an uncertain batch as partial rather than reporting delivery",async()=>{
  const graph=buildMailDeliveryGraph(context,run,undefined,{boundary:async()=>({...run,role:"member"}),execute:async()=>result({sent:0,total:1},{status:"partial"})});
  expect((await graph.invoke({status:"running",reply:""})).status).toBe("partial");
});
