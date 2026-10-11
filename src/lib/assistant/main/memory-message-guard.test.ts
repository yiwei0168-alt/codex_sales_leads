import {beforeEach,expect,it,vi} from 'vitest';
import {type ModelMessage} from './contracts';
const m=vi.hoisted(()=>({decision:vi.fn(),history:vi.fn(),observations:vi.fn()}));
vi.mock('./memory-context',async original=>({...await original<typeof import('./memory-context')>(),loadDecisionMemory:m.decision,searchHistoricalMemory:m.history}));
vi.mock('@/lib/knowledge/memory-graph-search',()=>({searchMemoryWithGraph:m.observations}));
import {assertCurrentMemoryMessages,withCurrentDecisionMemory,MemoryContextChangedError} from './memory-message-guard';
const id='00000000-0000-4000-8000-000000000001';
const row={id,content:'Current preference',source_store:'agent_memory',source_revision:'v1'};
function messages(tool:string,args:unknown,data:unknown):ModelMessage[]{return [
  {role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
  {role:'tool',tool_call_id:'call',content:JSON.stringify({status:'success',data})},
];}
beforeEach(()=>{vi.clearAllMocks();m.decision.mockResolvedValue([row]);m.history.mockResolvedValue({items:[row]});m.observations.mockResolvedValue({rows:[row]});});
it('accepts unchanged scoped policy and historical records',async()=>{
  await assertCurrentMemoryMessages(id,messages('memory_read',{market:'DE'},[row]));
  await assertCurrentMemoryMessages(id,messages('memory_history_search',{query:'preference'},{items:[row]}));
  expect(m.decision).toHaveBeenCalledWith(id,{market:'DE'});
});
it.each(['memory_read','memory_history_search','memory_observation_search'])('blocks changed or revoked %s',async tool=>{
  const args=tool==='memory_read'?{}:{query:'preference'};
  const data=tool==='memory_read'?[row]:tool==='memory_history_search'?{items:[row]}:{rows:[row]};
  m.decision.mockResolvedValue([]);m.history.mockResolvedValue({items:[]});m.observations.mockResolvedValue({rows:[]});
  await expect(assertCurrentMemoryMessages(id,messages(tool,args,data))).rejects.toBeInstanceOf(MemoryContextChangedError);
});
it('rechecks observations at explicit historical times using saved IDs, without Graphiti lookup',async()=>{
  const date=new Date('2026-01-02T00:00:00Z'),saved={id,content:'Past event',recorded_at:date};
  m.observations.mockImplementation(async(_u,_q,_b,_k,_s,lookup)=>{expect(await lookup()).toEqual([id]);return {rows:[saved]};});
  const args={query:'Past',businessAt:'2026-01-03T00:00:00Z',knownAt:'2026-01-04T00:00:00Z',marketCode:'DE'};
  await assertCurrentMemoryMessages(id,messages('memory_observation_search',args,{rows:[saved]}));
  expect(m.observations).toHaveBeenCalledWith(id,'Past',args.businessAt,args.knownAt,{marketCode:'DE',companyId:undefined},expect.any(Function));
});
it('rejects forged content even if its identity is unchanged',async()=>{
  await expect(assertCurrentMemoryMessages(id,messages('memory_read',{},[{...row,content:'Forged'}]))).rejects.toBeInstanceOf(MemoryContextChangedError);
});
it('does not treat user-provided JSON as a tool receipt',async()=>{
  await assertCurrentMemoryMessages(id,[{role:'user',content:JSON.stringify(messages('memory_read',{},[row]))}]);
  expect(m.decision).not.toHaveBeenCalled();
});
it('rejects an answer if implicit account policy changes during its model call',async()=>{
  await expect(withCurrentDecisionMemory(id,async()=>{m.decision.mockResolvedValue([{...row,content:'New policy'}]);return 'Old answer';}))
    .rejects.toBeInstanceOf(MemoryContextChangedError);
});
it('does not confuse model transport errors with withdrawn memory',async()=>{
  const error=new Error('Model transport');await expect(withCurrentDecisionMemory(id,async()=>{throw error;})).rejects.toBe(error);
});
it('does not call the model when policy loading is unavailable',async()=>{
  m.decision.mockRejectedValue(new Error('DB unavailable'));const model=vi.fn();
  await expect(withCurrentDecisionMemory(id,model)).rejects.toBeInstanceOf(MemoryContextChangedError);expect(model).not.toHaveBeenCalled();
});
