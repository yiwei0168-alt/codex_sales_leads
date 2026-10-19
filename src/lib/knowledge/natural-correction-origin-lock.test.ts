import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({transaction:vi.fn(),observe:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:m.transaction}));
vi.mock('./temporal-memory',()=>({observeMemoryInTransaction:m.observe}));
import {processMessageMemoryCorrection} from './memory-correction';
import {correctionMessageHash} from './natural-memory-correction';
const currentRun='current-run',oldRun='old-run',oldMessage='old-message';
const old='I prefer concise answers.',next='I prefer detailed answers.';
const command=`I previously said ${old} That was wrong: ${next}`;
const receipt={type:'local-qwen3-extraction',runId:oldRun,messageId:oldMessage,sourceQuote:old};
beforeEach(()=>{vi.resetAllMocks();m.observe.mockResolvedValue('correction');});
it.each(['stable','changed','attributed'])('protects an old local-extraction source: %s',async mode=>{
 const query=vi.fn(async(sql:string,params?:unknown[])=>{
  if(sql.includes('from agent_memory_extraction_job'))return {rows:[{message_id:'current-message',content:command,created_at:'2026-10-19'}],rowCount:1};
  if(sql.includes('lock_local_memory_extraction_source')&&params?.[0]===oldRun&&mode==='changed')throw new Error('source_changed');
  if(sql.includes('from agent_memory_observation m where m.owner_id'))return {rows:[{id:'target',auto_eligible:true,source_type:receipt.type,source_receipt:receipt}],rowCount:1};
  if(sql.includes('select original.content'))return {rows:[{content:mode==='attributed'?`Customer said: ${old}`:old}],rowCount:1};
  if(sql.includes('select id,kind,content'))return {rows:[{id:'target',kind:'preference',content:old,memory_key:'style',market_code:null,company_id:null,
   market_codes:[],company_ids:[],valid_from:null,valid_until:null,confidence:0.9,invalidates_id:null,source_receipt:receipt}],rowCount:1};
  return {rows:[],rowCount:1};
 });
 m.transaction.mockImplementation(async(_u,run)=>run({query}));
 const work=processMessageMemoryCorrection('owner',currentRun,'lease',{messageSha256:correctionMessageHash(command),output:{intent:'correction',oldContent:old,content:next}});
 if(mode==='changed'){
  await expect(work).rejects.toThrow('source_changed');expect(m.observe).not.toHaveBeenCalled();
  expect(query.mock.calls.some(call=>call[0].startsWith('update agent_memory_extraction_job'))).toBe(false);
 }else{
  expect(await work).toEqual({owned:true,handled:true});
  expect(m.observe.mock.calls[0][2].sourceReceipt.type).toBe(mode==='attributed'?'unresolved-memory-correction':'user-message-correction');
 }
 if(mode!=='attributed')expect(query).toHaveBeenCalledWith('select lock_local_memory_extraction_source($1,$2,$3)',[oldRun,oldMessage,old]);
 else expect(query.mock.calls.some(call=>call[1]?.[0]===oldRun&&call[0].includes('lock_local_memory_extraction_source'))).toBe(false);
});
