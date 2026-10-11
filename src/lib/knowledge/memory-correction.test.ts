import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({transaction:vi.fn(),observe:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:mock.transaction}));
vi.mock('./temporal-memory',()=>({observeMemoryInTransaction:mock.observe}));
import {correctMemory} from './memory-correction';
const id='00000000-0000-4000-8000-000000000001';
const target={id,kind:'business-fact',content:'Old report',memory_key:'report',market_code:'DE',company_id:'c1',
  market_codes:['DE'],company_ids:['c1'],valid_from:null,valid_until:null,confidence:0.95,invalidates_id:null,
  source_receipt:{type:'local-qwen3-extraction'}};
const query=vi.fn();
beforeEach(()=>{query.mockReset();mock.observe.mockReset();mock.transaction.mockReset();
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('select id,kind,content')?[target]:[]}));
  mock.transaction.mockImplementation(async(_user,run)=>run({query}));mock.observe.mockResolvedValue('new-id');});
it('keeps scope and unknown dates, writes a sourced correction without certifying a business fact',async()=>{
  expect(await correctMemory('owner',{id,content:'Corrected report',reason:'Wrong extraction'})).toBe('new-id');
  expect(mock.observe).toHaveBeenCalledWith({query},'owner',expect.objectContaining({kind:'business-fact',content:'Corrected report',
    correctsId:id,marketCode:'DE',companyId:'c1',marketCodes:['DE'],companyIds:['c1'],validFrom:null,validUntil:null,confidence:0.7,
    sourceReceipt:expect.objectContaining({type:'user-correction',targetId:id,sourceQuote:'Corrected report',successVerified:false})}));
});
it('returns the immutable receipt on exact replay before testing whether the original is superseded',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('select id,kind,content')?[target]:sql.includes('idempotency_key')?[{id:'prior'}]:sql.includes('corrects_id')?[{id:'replacement'}]:[]}));
  expect(await correctMemory('owner',{id,content:'Corrected report'})).toBe('prior');expect(mock.observe).not.toHaveBeenCalled();
});
it('refuses a stale concurrent correction',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('select id,kind,content')?[target]:sql.includes('corrects_id')?[{id:'replacement'}]:[]}));
  await expect(correctMemory('owner',{id,content:'Corrected report'})).rejects.toThrow('Memory version changed');expect(mock.observe).not.toHaveBeenCalled();
});
it('hides another account target',async()=>{query.mockResolvedValue({rows:[]});
  await expect(correctMemory('other',{id,content:'Corrected report'})).rejects.toThrow('Memory target is unavailable');expect(mock.observe).not.toHaveBeenCalled();});
it('preserves the original editor authority for bridged legacy preferences',async()=>{
  query.mockResolvedValue({rows:[{...target,source_receipt:{type:'agent-memory-version'}}]});
  await expect(correctMemory('owner',{id,content:'Corrected report'})).rejects.toThrow('Use original memory editor');expect(mock.observe).not.toHaveBeenCalled();
});
it.each([{content:'  '},{content:'x'.repeat(801)},{content:'Valid change',confidence:1},{content:'Valid change',marketCode:'FR'}])('rejects invalid input and scope/authority injection %j',async extra=>{
  await expect(correctMemory('owner',{id,...extra})).rejects.toThrow();expect(mock.transaction).not.toHaveBeenCalled();
});
it('allows time-only correction, preserves scope and records explicit before/after without backdating knowledge',async()=>{
  const businessTime={validFrom:'2024-01-01T00:00:00+08:00',validUntil:'2025-01-01T00:00:00+08:00'};
  await correctMemory('owner',{id,content:target.content,businessTime});
  expect(mock.observe).toHaveBeenCalledWith({query},'owner',expect.objectContaining({content:target.content,marketCode:'DE',companyId:'c1',
    validFrom:businessTime.validFrom,validUntil:businessTime.validUntil,sourceReceipt:expect.objectContaining({
      businessTimeCorrection:{explicit:true,before:{validFrom:null,validUntil:null},after:businessTime}})}));
  expect(mock.observe.mock.calls[0][2]).not.toHaveProperty('recordedAt');
});
it('can explicitly clear known business dates, without guessing replacement dates',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('select id,kind,content')?[{...target,valid_from:'2024-01-01T00:00:00Z'}]:[]}));
  await correctMemory('owner',{id,content:target.content,businessTime:{validFrom:null,validUntil:null}});
  expect(mock.observe.mock.calls[0][2]).toMatchObject({validFrom:null,validUntil:null});
});
it('treats equivalent instants as unchanged',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('select id,kind,content')?[{...target,valid_from:'2024-01-01T00:00:00Z'}]:[]}));
  await expect(correctMemory('owner',{id,content:target.content,businessTime:{validFrom:'2024-01-01T08:00:00+08:00',validUntil:null}})).rejects.toThrow('unchanged');
});
it.each([
  {validFrom:'2024-01-02T00:00:00Z',validUntil:'2024-01-01T00:00:00Z'},
  {validFrom:'2024-01-01T00:00:00Z',validUntil:'2024-01-01T00:00:00Z'},
  {validFrom:'2024-01-01T00:00:00',validUntil:null},
  {validFrom:'2024-02-30T00:00:00Z',validUntil:null},
  {validFrom:null},
  {validFrom:null,validUntil:null,recordedAt:'2024-01-01T00:00:00Z'},
])('rejects invalid or incomplete explicit time correction %j',async businessTime=>{
  await expect(correctMemory('owner',{id,content:target.content,businessTime} as Parameters<typeof correctMemory>[1])).rejects.toThrow();
  expect(mock.transaction).not.toHaveBeenCalled();
});
