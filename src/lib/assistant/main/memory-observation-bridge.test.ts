import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({transaction:vi.fn(),observe:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:mock.transaction,tenantQuery:vi.fn()}));
vi.mock("@/lib/knowledge/temporal-memory",()=>({observeMemoryInTransaction:mock.observe}));
import {saveMemory,undoMemoryInTransaction} from "./memory";
import type {ExecutionContext} from "./contracts";

const context:ExecutionContext={userId:"user-1",runId:"run-1",leaseToken:"lease-1",role:"member",callId:"call-1"};
beforeEach(()=>{mock.transaction.mockReset();mock.observe.mockReset();});

it("writes an automatic preference observation in the same transaction with exact source and scope",async()=>{
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes("from agent_memory where"))return {rows:[]};
    if(sql.includes("from assistant_message"))return {rows:[{id:"message-1"}]};
    if(sql.includes("insert into agent_memory("))return {rows:[{id:"memory-1"}]};
    return {rows:[]};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  mock.observe.mockResolvedValue("observation-1");
  const result=await saveMemory(context,{key:"answer-style",content:"Short answers",kind:"preference",scope:"account",mandatory:false,
    markets:["DE","FR"],companies:["company-1"],expectedVersion:undefined},true);
  expect(result).toMatchObject({saved:true,observationId:"observation-1"});
  expect(mock.observe).toHaveBeenCalledWith(client,"user-1",expect.objectContaining({kind:"preference",memoryKey:"answer-style",
    marketCodes:["DE","FR"],companyIds:["company-1"],idempotencyKey:"agent-memory:memory-1:1",
    sourceReceipt:{type:"agent-memory-version",memoryId:"memory-1",version:1,runId:"run-1",userMessageId:"message-1",callId:"call-1"}}));
});

it("does not mirror an explicit policy as an automatic observation",async()=>{
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes("from agent_memory where"))return {rows:[]};
    if(sql.includes("from assistant_message"))return {rows:[{id:"message-1"}]};
    if(sql.includes("insert into agent_memory("))return {rows:[{id:"memory-2"}]};
    return {rows:[]};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  await saveMemory({...context,role:"admin"},{key:"policy",content:"Reviewed policy",kind:"policy",scope:"account",mandatory:false,
    markets:[],companies:[],expectedVersion:undefined},false);
  expect(mock.observe).not.toHaveBeenCalled();
});

it("links a new automatic version to the prior observation",async()=>{
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes("from agent_memory where"))return {rows:[{id:"memory-1",current_version:1,source_kind:"automatic",active:true}]};
    if(sql.includes("from assistant_message"))return {rows:[{id:"message-2"}]};
    if(sql.includes("max(version)+1"))return {rows:[{next:2}]};
    if(sql.includes("from agent_memory_observation"))return {rows:[{id:"observation-1"}]};
    return {rows:[]};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(dbClient:typeof client)=>Promise<unknown>)=>run(client));
  mock.observe.mockResolvedValue("observation-2");
  await saveMemory(context,{key:"answer-style",content:"Detailed answers",kind:"preference",scope:"account",mandatory:false,
    markets:[],companies:[],expectedVersion:1},true);
  expect(mock.observe).toHaveBeenCalledWith(client,"user-1",expect.objectContaining({correctsId:"observation-1",idempotencyKey:"agent-memory:memory-1:2"}));
});

it("undoes the active legacy preference and invalidates its mirrored observation",async()=>{
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes("select m.current_version"))return {rows:[{current_version:1,active:true,memory_key:"answer-style",scope_snapshot:{previousVersion:null,previousActive:false}}]};
    if(sql.includes("from agent_memory_observation"))return {rows:[{id:"observation-1"}]};
    return {rows:[]};
  })};
  mock.observe.mockResolvedValue("undo-1");
  expect(await undoMemoryInTransaction(client as never,"user-1","memory-1",1)).toBe(true);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("set active=false"),["memory-1","user-1"]);
  expect(mock.observe).toHaveBeenCalledWith(client,"user-1",expect.objectContaining({invalidatesId:"observation-1",idempotencyKey:"undo:observation-1"}));
});

it("restores the prior version as a new observation when undoing a replacement",async()=>{
  const client={query:vi.fn(async(sql:string)=>{
    if(sql.includes("select m.current_version"))return {rows:[{current_version:2,active:true,memory_key:"answer-style",scope_snapshot:{previousVersion:1,previousActive:true}}]};
    if(sql.includes("from agent_memory_version"))return {rows:[{version:1,content:"Short answers",source_run_id:"run-1",source_message_id:"message-1",
      scope_snapshot:{mandatory:false,markets:["DE"],companies:[],validUntil:null,sourceKind:"automatic"}}]};
    if(sql.includes("from agent_memory_observation"))return {rows:[{id:"observation-2"}]};
    return {rows:[]};
  })};
  mock.observe.mockResolvedValue("undo-2");
  expect(await undoMemoryInTransaction(client as never,"user-1","memory-1",2)).toBe(true);
  expect(mock.observe).toHaveBeenCalledWith(client,"user-1",expect.objectContaining({invalidatesId:"observation-2"}));
  expect(mock.observe).toHaveBeenCalledWith(client,"user-1",expect.objectContaining({content:"Short answers",marketCodes:["DE"],
    idempotencyKey:"agent-memory-restore:memory-1:2:1"}));
});
