import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const storage=vi.hoisted(()=>({query:vi.fn(),boundary:vi.fn(),instructions:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:storage.query}));
vi.mock('./repository',()=>({boundary:storage.boundary,assertCurrentInstructions:storage.instructions,LeaseLostError:class extends Error{}}));
import { readInterpreterReceipt } from './interpreter-receipts';
import { executeProgrammatic } from './programmatic-execution';
import { executeHybridRead, type HybridDependencies } from './hybrid-execution';
import { digest, result } from './contracts';
import { defineTool } from './tool-definition';

const callId='11111111-1111-4111-8111-111111111111';
const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const,mode:'deep' as const,callId:'parent'};
const execute=vi.fn();
const tool=defineTool({id:'customer_timeline',description:'fixture',input:z.object({id:z.string()}),execute});
const leaf={key:'original',tool:tool.id,arguments:{id:'one'},output:result({events:[{time:'2026-11-04 09:00:00+00'}]},{callId,cost:'known'})};
const row=()=>({id:callId,call_key:leaf.key,tool_id:tool.id,tool_version:tool.version,input:leaf.arguments,input_hash:digest(leaf.arguments),effect:'read',output:leaf.output});
beforeEach(()=>{vi.clearAllMocks();storage.instructions.mockReset();storage.boundary.mockResolvedValue({instructions:[],control:null});storage.query.mockResolvedValue([row()]);});
it('loads only a completed same-user same-run original leaf and checks live boundary twice',async()=>{
  expect(await readInterpreterReceipt(context,callId,new Set([tool.id]),()=>[tool])).toEqual(leaf);
  expect(storage.query.mock.calls[0][0]).toBe('owner');
  expect(storage.query.mock.calls[0][1]).toContain("user_id=$1 and run_id=$2 and id=$3 and status='completed'");
  expect(storage.query.mock.calls[0][2]).toEqual(['owner','run',callId]);
  expect(storage.boundary).toHaveBeenCalledTimes(2);
});
it.each(['absent','unknown','version','effect','hash','callId','scope','cancel','instructions'])(
  'rejects %s without replaying the leaf',async kind=>{
    const r=row();
    if(kind==='unknown')r.output={...r.output,status:'unknown'};
    if(kind==='version')r.tool_version='different';
    if(kind==='effect')r.effect='send';
    if(kind==='hash')r.input_hash='changed';
    if(kind==='callId')r.output={...r.output,callId:'22222222-2222-4222-8222-222222222222'};
    storage.query.mockResolvedValue(kind==='absent'?[]:[r]);
    if(kind==='cancel')storage.boundary.mockResolvedValue({instructions:[],control:'cancel'});
    if(kind==='instructions')storage.instructions.mockImplementation(()=>{throw Error('new instructions');});
    await expect(readInterpreterReceipt(context,callId,new Set([tool.id]),()=>kind==='scope'?[]:[tool])).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
it.each(['program','read'])('recomputes %s from validated receipts with no dispatch and original provenance',async route=>{
  const deps:HybridDependencies={allowed:new Set([tool.id]),dispatch:vi.fn(),validate:vi.fn(async()=>{}),readReceipt:vi.fn(async()=>leaf)};
  const input={code:`const r=tools.receipt('${callId}');tools.receipt('${callId}');return tools.time(r.data.events[0].time).utcIso;`};
  const out=await(route==='program'?executeProgrammatic(input,context,deps):executeHybridRead('interpreter',input,context,deps));
  expect(out.status).toBe('success');expect(out.data).toMatchObject({value:'2026-11-04T09:00:00.000Z',leaves:[leaf]});
  expect((out.data as {leaves:unknown[]}).leaves).toHaveLength(1);
  expect(deps.dispatch).not.toHaveBeenCalled();expect(deps.validate).toHaveBeenCalled();
});
it('propagates stale source failures even if guest catches them',async()=>{
  const failure=new Error('source revision changed');
  const deps:HybridDependencies={allowed:new Set([tool.id]),dispatch:vi.fn(),readReceipt:async()=>leaf,validate:async()=>{throw failure;}};
  await expect(executeProgrammatic({code:`try{tools.receipt('${callId}');}catch{}return 'ok';`},context,deps)).rejects.toBe(failure);
  expect(deps.dispatch).not.toHaveBeenCalled();
});
it('counts reused receipts toward the existing evidence call limit',async()=>{
  const deps:HybridDependencies={allowed:new Set([tool.id]),dispatch:vi.fn(async()=>result('new')),validate:async()=>{},readReceipt:async()=>leaf};
  const out=await executeProgrammatic({code:`tools.receipt('${callId}');for(let i=0;i<24;i++)tools.call('customer_timeline',{id:String(i)});return 'done';`},context,deps);
  expect(out.status).toBe('partial');expect(deps.dispatch).toHaveBeenCalledTimes(23);
});
