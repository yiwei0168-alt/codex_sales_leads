import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantTransaction:mock.transaction,tenantQuery:mock.query}));
import {observeMemory,undoMemory} from "./temporal-memory";

beforeEach(()=>{mock.transaction.mockReset();mock.query.mockReset();});

it("writes observation, outbox and notice once on replay",async()=>{
  const calls:string[]=[];
  let inserted=false;
  const client={query:vi.fn(async(sql:string)=>{
    calls.push(sql);
    if(sql.includes("on conflict (owner_id,idempotency_key)")){
      if(inserted)return {rows:[]};
      inserted=true;return {rows:[{id:"memory-1"}]};
    }
    if(sql.includes("select id,content from agent_memory_observation"))return {rows:[{id:"memory-1",content:"prefers concise answers"}]};
    return {rows:[],rowCount:0};
  })};
  mock.transaction.mockImplementation(async(_user:string,run:(value:typeof client)=>Promise<unknown>)=>run(client));
  const input={kind:"preference" as const,content:"prefers concise answers",sourceReceipt:{taskId:"task-1"},memoryKey:"answer-style"};
  expect(await observeMemory("user-1",input)).toBe("memory-1");
  expect(await observeMemory("user-1",input)).toBe("memory-1");
  expect(calls.filter(sql=>sql.includes("insert into agent_memory_graph_outbox"))).toHaveLength(1);
  expect(calls.filter(sql=>sql.includes("insert into agent_memory_notice"))).toHaveLength(1);
  expect(calls.filter(sql=>sql.includes("insert into agent_memory_conflict"))).toHaveLength(1);
});

it("rejects a cross-account undo target",async()=>{
  const client={query:vi.fn(async()=>({rows:[],rowCount:0}))};
  mock.transaction.mockImplementation(async(_user:string,run:(value:typeof client)=>Promise<unknown>)=>run(client));
  await expect(undoMemory("user-1","unavailable")).rejects.toThrow("Memory target is unavailable");
  expect(client.query).toHaveBeenCalledTimes(1);
});

it("rejects malformed observations before a database write",async()=>{
  await expect(observeMemory("user-1",{kind:"preference",content:" ",sourceReceipt:{taskId:"a"}})).rejects.toThrow();
  await expect(observeMemory("user-1",{kind:"preference",content:"a",sourceReceipt:{}})).rejects.toThrow();
  expect(mock.transaction).not.toHaveBeenCalled();
});
