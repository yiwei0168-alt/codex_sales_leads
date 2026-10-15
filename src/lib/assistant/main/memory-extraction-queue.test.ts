import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({transaction:vi.fn(),tenantQuery:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:mock.transaction,tenantQuery:mock.tenantQuery,query:vi.fn()}));
import {controlRun,enqueueRun,finishRun,getRun,listRuns,readEvents} from "./repository";
import type {ExecutionContext,RunStatus} from "./contracts";

const context:ExecutionContext={userId:"user-1",runId:"run-1",leaseToken:"lease-1",role:"member"};
beforeEach(()=>{mock.transaction.mockReset();mock.tenantQuery.mockReset();});

for(const [status,kind,queued] of [["completed","main-agent",true],["completed","main-agent-evaluation",false],["completed","mail",false],["failed","main-agent",false]] as const){
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

it("queues a scoped evaluation with its frozen case identity and no conversation history",async()=>{
  const spec={schema:"ma24-evaluation-run-v1" as const,manifestSha256:"a".repeat(64),caseId:"case-1",arm:"candidate" as const};
  const input={content:"What does the source say?",requestKey:"ma24-case-1-candidate",attachments:[],knowledgeScope:["product" as const]};
  const statements:Array<{sql:string;params:unknown[]|undefined}>=[];
  const client={query:vi.fn(async(sql:string,params?:unknown[])=>{
    statements.push({sql,params});
    if(sql.includes("insert into assistant_conversation"))return {rows:[{id:"conversation-1"}],rowCount:1};
    if(sql.includes("insert into agent_run("))return {rows:[{id:"run-1",execution_kind:"main-agent-evaluation",status:"queued"}],rowCount:1};
    return {rows:[],rowCount:0};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  const result=await enqueueRun(context.userId,input,{model:"model-1",providers:["provider-1"],version:"v1"},
    {kind:"main-agent-evaluation",spec});
  expect(result).toMatchObject({execution_kind:"main-agent-evaluation",status:"queued"});
  const inserted=statements.find(row=>row.sql.includes("insert into agent_run("));
  expect(inserted?.params?.[6]).toBe("main-agent-evaluation");
  expect(JSON.parse(inserted?.params?.[7] as string)).toEqual(spec);
  expect(inserted?.params?.[8]).toBe("queued");
  const conversation=statements.find(row=>row.sql.includes("insert into assistant_conversation"));
  expect(conversation?.params).toEqual([context.userId,"MA24 evaluation","deleted"]);
  expect(statements.some(row=>row.sql.includes("insert into assistant_message"))).toBe(false);
  await expect(enqueueRun(context.userId,{...input,conversationId:"old-conversation"},
    {model:"model-1",providers:["provider-1"],version:"v1"},{kind:"main-agent-evaluation",spec}))
    .rejects.toThrow("Invalid MA24 evaluation task scope or identity");
});

it("keeps a finished evaluation answer out of ordinary conversation messages",async()=>{
  const statements:string[]=[];
  const client={query:vi.fn(async(sql:string)=>{
    statements.push(sql);
    if(sql.includes("update agent_run set"))return {rows:[{conversation_id:"conversation-1",status:"completed",execution_kind:"main-agent-evaluation"}],rowCount:1};
    return {rows:[],rowCount:1};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  await finishRun(context,"completed","evaluation answer");
  expect(statements.some(sql=>sql.includes("insert into assistant_message"))).toBe(false);
  expect(statements.some(sql=>sql.includes("insert into agent_memory_extraction_job"))).toBe(false);
  expect(statements.some(sql=>sql.includes("insert into agent_run_event"))).toBe(true);
});

it("excludes evaluation runs from ordinary detail, list and event reads",async()=>{
  mock.tenantQuery.mockResolvedValue([]);
  expect(await getRun(context.userId,context.runId)).toBeNull();
  await listRuns(context.userId);
  await readEvents(context.userId,context.runId,"0");
  const queries=mock.tenantQuery.mock.calls.map((call:unknown[])=>String(call[1]));
  expect(queries).toHaveLength(3);
  expect(queries.every(sql=>sql.includes("execution_kind<>'main-agent-evaluation'"))).toBe(true);
});

it.each(["pause","resume","instruct"] as const)("rejects ordinary %s control of an evaluation task",async(action)=>{
  const statements:string[]=[];
  const client={query:vi.fn(async(sql:string)=>{
    statements.push(sql);
    if(sql.includes("select * from agent_run"))return {rows:[{status:"queued",execution_kind:"main-agent-evaluation"}],rowCount:1};
    return {rows:[],rowCount:0};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  await expect(controlRun(context.userId,context.runId,action,"new instruction"))
    .rejects.toThrow("MA24 evaluation task can only be cancelled");
  expect(statements).toHaveLength(1);
});

it("permits cancelling a queued evaluation task",async()=>{
  const statements:string[]=[];
  const client={query:vi.fn(async(sql:string)=>{
    statements.push(sql);
    if(sql.includes("select * from agent_run"))return {rows:[{status:"queued",execution_kind:"main-agent-evaluation"}],rowCount:1};
    return {rows:[],rowCount:1};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  expect(await controlRun(context.userId,context.runId,"cancel")).toBe(true);
  expect(statements.some(sql=>sql.includes("set status=$3"))).toBe(true);
  expect(statements.some(sql=>sql.includes("insert into agent_run_event"))).toBe(true);
});
