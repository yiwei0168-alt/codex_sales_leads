import { describe, expect, it, vi } from 'vitest';
import { executeProgrammatic } from './programmatic-execution';
import { PROGRAM_LEAVES, hybridDataSchema, expandHybridEvidence } from './hybrid-contracts';
import { result, type ExecutionContext, type ModelToolCall, type ToolResult } from './contracts';
import { modeAllowsTool } from './mode-tools';
import type { HybridDependencies } from './hybrid-execution';

const context: ExecutionContext = { userId: 'owner', runId: 'run', leaseToken: 'lease', role: 'member', mode: 'deep', callId: 'parent' };
function deps(handler: (call: ModelToolCall) => Promise<ToolResult>): HybridDependencies {
  return { allowed: PROGRAM_LEAVES, dispatch: vi.fn(handler), validate: vi.fn(async () => {}) };
}
describe('programmatic business segments', () => {
  it('bounds real WASM fanout, preserves input order and reuses durable leaf identities', async () => {
    let active = 0, peak = 0, executed = 0;
    const saved = new Map<string, ToolResult>();
    const d = deps(async call => {
      if (saved.has(call.id)) return saved.get(call.id)!;
      peak = Math.max(peak, ++active); executed++;
      const { arguments: args } = JSON.parse(call.function.arguments);
      await new Promise(resolve => setTimeout(resolve, args.i === 0 ? 20 : 1)); active--;
      const output = result({ i: args.i }); saved.set(call.id, output); return output;
    });
    const input = { code: `return tools.parallel(Array.from({length:7},(_,i)=>({tool:'search_channel',arguments:{i}}))).map(r=>r.data.i);` };
    const first = await executeProgrammatic(input, context, d);
    expect(first.status).toBe('success'); expect(first.data).toMatchObject({ value: [0,1,2,3,4,5,6] });
    expect(peak).toBe(3);
    expect(await executeProgrammatic(input, context, d)).toEqual(first); expect(executed).toBe(7);
    expect(vi.mocked(d.dispatch).mock.calls.every(c => c[1] === context)).toBe(true);
  });
  it('chains saved artifacts through specialist tools and exposes server provenance', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const d = deps(async () => ({ ...result({ publication: 'research-only' }), callId: id }));
    const input = { code: `const r=tools.call('company_research',{});return tools.call('company_score',{sourceCallId:r.callId});` };
    const output = await executeProgrammatic(input, context, d);
    expect(JSON.parse(vi.mocked(d.dispatch).mock.calls[1][0].function.arguments).arguments.sourceCallId).toBe(id);
    expect(hybridDataSchema.parse(output.data).leaves).toHaveLength(2);
    expect(expandHybridEvidence([{ role:'assistant',content:null,tool_calls:[{id:'p',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'programmatic_tools',arguments:input})}}]},
      {role:'tool',tool_call_id:'p',content:JSON.stringify(output)}])).toHaveLength(6);
  });
  it('returns semantic handoff and cannot be caught to execute more tools', async () => {
    const d = deps(async () => result({ excerpt: 'conflicting evidence' }));
    const output = await executeProgrammatic({ code: `const r=tools.call('evidence_collect',{});try{tools.handoff('Resolve conflict',r.data);}catch{}tools.call('company_score',{});return 'complete';` }, context, d);
    expect(output.status).toBe('partial'); expect(output.data).toMatchObject({ handoff:'Resolve conflict',value:{excerpt:'conflicting evidence'} });
    expect(d.dispatch).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown','partial','unavailable'] as const)('drains in-flight calls and stops queued work on %s', async status => {
    let completed = 0;
    const d = deps(async call => {
      const { arguments: args } = JSON.parse(call.function.arguments);
      await new Promise(resolve => setTimeout(resolve, args.i === 0 ? 1 : 15)); completed++;
      return result(args.i, { status: args.i === 0 ? status : 'success' });
    });
    const out = await executeProgrammatic({ code:`return tools.parallel(Array.from({length:8},(_,i)=>({tool:'search_channel',arguments:{i}})));` }, context, d);
    expect(out.status).toBe('partial'); expect(completed).toBe(3); expect(hybridDataSchema.parse(out.data).leaves).toHaveLength(3);
  });
  it('propagates lease/source errors only after draining in-flight work', async () => {
    let finished = false; const failure = new Error('lease lost');
    const d = deps(async call => {
      if (JSON.parse(call.function.arguments).arguments.i === 0) throw failure;
      await new Promise(resolve => setTimeout(resolve, 10)); finished = true; return result('saved');
    });
    await expect(executeProgrammatic({ code:`try{tools.parallel([0,1].map(i=>({tool:'search_channel',arguments:{i}})));}catch{}return 'ok';` }, context, d)).rejects.toBe(failure);
    expect(finished).toBe(true);
  });
  it.each(['mail_send','company_score_publish','company_add','lead_workflow','programmatic_tools','skill_script'])(
    'rejects an entire mixed batch containing %s before dispatch', async tool => {
      const d = deps(async () => result('unexpected'));
      expect((await executeProgrammatic({code:`return tools.parallel([{tool:'search_channel',arguments:{}},{tool:'${tool}',arguments:{}}]);`},context,d)).status).toBe('partial');
      expect(d.dispatch).not.toHaveBeenCalled();
    });
  it('retains quick-mode restrictions and enforces the 24-call budget', async () => {
    const d = deps(async () => result('ok'));
    d.allowed = new Set([...PROGRAM_LEAVES].filter(id => modeAllowsTool('quick',id)));
    expect((await executeProgrammatic({code:`return tools.call('search_channel',{});`},context,d)).status).toBe('partial');
    expect(d.dispatch).not.toHaveBeenCalled();
    const out = await executeProgrammatic({code:`for(let i=0;i<25;i++)tools.call('company_read',{i});return 'done';`},context,d);
    expect(out.status).toBe('partial'); expect(d.dispatch).toHaveBeenCalledTimes(24);
  });
});
