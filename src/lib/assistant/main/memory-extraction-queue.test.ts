import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({transaction:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:mock.transaction,tenantQuery:vi.fn(),query:vi.fn()}));
import {finishRun} from "./repository";
import type {ExecutionContext,RunStatus} from "./contracts";

const context:ExecutionContext={userId:"user-1",runId:"run-1",leaseToken:"lease-1",role:"member"};
beforeEach(()=>{mock.transaction.mockReset();});

for(const [status,kind,queued] of [["completed","main-agent",true],["completed","mail",false],["failed","main-agent",false]] as const){
  it(`${status} ${kind} ${queued?"queues":"does not queue"} local extraction`,async()=>{
    const calls:string[]=[];
    const client={query:vi.fn(async(sql:string)=>{
      calls.push(sql);
      if(sql.includes("update agent_run set"))return {rows:[{conversation_id:"conversation-1",status,execution_kind:kind}],rowCount:1};
      return {rows:[],rowCount:1};
    })};
    mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
    await finishRun(context,status as RunStatus,"");
    expect(calls.some(sql=>sql.includes("insert into agent_memory_extraction_job"))).toBe(queued);
    expect(calls.some(sql=>sql.includes("insert into agent_run_event"))).toBe(true);
  });
}
