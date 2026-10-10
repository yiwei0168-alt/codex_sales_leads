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
