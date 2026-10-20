import {beforeEach,expect,it,vi} from 'vitest';
import {beginCall} from './repository';
import {digest} from './contracts';

const f=vi.hoisted(()=>({query:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:f.read,tenantTransaction:async(_owner:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query:f.query}),query:vi.fn()}));
vi.mock('./approvals',()=>({approvalDigest:vi.fn()}));
const context={userId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',leaseToken:'33333333-3333-4333-8333-333333333333',role:'member' as const};
const call={key:'read',tool:'customer_timeline',version:'1',input:{},effect:'read'};
const stored={id:'44444444-4444-4444-8444-444444444444',input_hash:digest(call.input),tool_id:call.tool,tool_version:call.version,status:'started',output:null};
const rows=(values:unknown[])=>({rows:values,rowCount:values.length});
beforeEach(()=>{
 vi.resetAllMocks();f.read.mockResolvedValue([{role:'member',control:null,instructions:[]}]);
 f.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('select r.instructions'))return rows([{instructions:[]}]);
  if(sql.includes('from agent_run'))return rows([{id:context.runId}]);
  if(sql.startsWith('select id from agent_tool_call'))return rows([]);
  if(sql.startsWith('insert into agent_tool_call'))return rows([{id:stored.id}]);
  if(sql.startsWith('select * from agent_tool_call'))return rows([stored]);
  throw new Error('Unexpected fixture SQL');
 });
});
it('revalidates wall time after acquiring the task row and before returning a fresh call',async()=>{
 expect((await beginCall(context,call)).fresh).toBe(true);
 const statements=f.query.mock.calls.map(([sql])=>sql as string);
 const checks=statements.filter(sql=>sql.includes('select r.instructions'));
 expect(checks).toHaveLength(2);expect(checks.every(sql=>sql.includes('clock_timestamp()')&&sql.includes("u.status='active'"))).toBe(true);
 expect(statements[0]).toContain('for update');expect(statements.at(-1)).toContain('select r.instructions');
});
it('rejects a lease lost during the initial lock wait before looking up or inserting a tool call',async()=>{
 f.query.mockImplementation(async(sql:string)=>sql.includes('select r.instructions')?rows([]):rows([{id:context.runId}]));
 await expect(beginCall(context,call)).rejects.toThrow('Agent lease lost');
 expect(f.query.mock.calls.some(([sql])=>String(sql).includes('agent_tool_call'))).toBe(false);
});
it('rejects if the window expires during later call writes',async()=>{
 const original=f.query.getMockImplementation()!;let checks=0;
 f.query.mockImplementation(async(...args:unknown[])=>String(args[0]).includes('select r.instructions')&&++checks===2?rows([]):original(...args));
 await expect(beginCall(context,call)).rejects.toThrow('Agent lease lost');
 expect(f.query.mock.calls.some(([sql])=>String(sql).startsWith('insert into agent_tool_call'))).toBe(true);
});
it('retains completed receipt reuse under a current lease',async()=>{
 const original=f.query.getMockImplementation()!;
 f.query.mockImplementation(async(...args:unknown[])=>String(args[0]).startsWith('select id from agent_tool_call')?rows([{id:stored.id}]):original(...args));
 expect((await beginCall(context,call)).fresh).toBe(false);
 expect(f.query.mock.calls.some(([sql])=>String(sql).startsWith('insert into agent_tool_call'))).toBe(false);
});
it('rejects changed instructions after taking the lock',async()=>{
 const original=f.query.getMockImplementation()!;
 f.query.mockImplementation(async(...args:unknown[])=>String(args[0]).includes('select r.instructions')?rows([{instructions:[{id:'new',content:'Changed'}]}]):original(...args));
 await expect(beginCall({...context,instructionIds:[]},call)).rejects.toThrow('instructions');
 expect(f.query.mock.calls.some(([sql])=>String(sql).includes('agent_tool_call'))).toBe(false);
});
