import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({transaction:vi.fn(),observe:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:m.transaction}));
vi.mock('./temporal-memory',()=>({observeMemoryInTransaction:m.observe}));
import {processMessageMemoryCorrection} from './memory-correction';
beforeEach(()=>{vi.resetAllMocks();m.observe.mockResolvedValue('notice');});
it.each([0,1])('requires a current lease in the final correction update (rows=%s)',async count=>{
 const query=vi.fn(async(sql:string)=>sql.includes('from agent_memory_extraction_job')
  ?{rows:[{message_id:'message',content:'更正记忆：“旧的偏好”改为“新的偏好”。',created_at:'2026-10-19'}],rowCount:1}
  :{rows:[],rowCount:count});
 m.transaction.mockImplementation(async(_u,run)=>run({query}));
 const result=processMessageMemoryCorrection('owner','run','lease');
 if(count)expect(await result).toEqual({owned:true,handled:true});
 else await expect(result).rejects.toThrow('extraction_lease_expired');
 expect(m.observe).toHaveBeenCalledOnce();
 expect(query.mock.calls[0][0]).toContain('clock_timestamp()');
 expect(query.mock.calls.at(-1)?.[0]).toContain("updated_at>clock_timestamp()-interval '5 minutes'");
});
