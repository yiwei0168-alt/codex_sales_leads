import { describe, expect, it, vi } from 'vitest';
import { executeHybridRead, type HybridDependencies } from './hybrid-execution';
import { interpretReadProgram } from './hybrid-interpreter';
import { HYBRID_LEAVES, expandHybridEvidence } from './hybrid-contracts';
import { hybridFirstAction, suggestHybridRoute } from './hybrid-routing';
import { toolModelView } from './tool-model-view';
import { result, type ExecutionContext, type ModelMessage, type ModelToolCall } from './contracts';

const context: ExecutionContext = { userId: 'owner', runId: 'run', leaseToken: 'lease', role: 'member', callId: 'parent' };
const customer = '11111111-1111-4111-8111-111111111111';
const mail = '22222222-2222-4222-8222-222222222222';
function dependencies(handler: (call: ModelToolCall) => ReturnType<HybridDependencies['dispatch']>): HybridDependencies {
  return { allowed: HYBRID_LEAVES, validate: vi.fn(async () => {}), dispatch: vi.fn(handler) };
}
describe('hybrid execution', () => {
  it('executes a conditional batch in a real isolated WASM interpreter', async () => {
    const deps = dependencies(async call => {
      const { arguments: args } = JSON.parse(call.function.arguments);
      return result([{ id: args.candidateId, source: 'original-page-2', score: 7 }], { cost: 'known' });
    });
    const out = await executeHybridRead('interpreter', { code: `
      const rows = [];
      for (const id of ['one','two']) {
        const r = tools.call('company_read', {candidateId:id});
        if(r.data[0].score > 5) rows.push(r.data[0]);
      }
      return rows;` }, context, deps);
    expect(out.status).toBe('success');
    expect(out.data).toMatchObject({ value: [{ id: 'one', source: 'original-page-2' }, { id: 'two' }], leaves: [{ tool: 'company_read' }, { tool: 'company_read' }] });
    expect(deps.dispatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.dispatch).mock.calls[0][1]).toBe(context);
  });
  it('does not expose Node, network, filesystem or modules', async () => {
    const bridge = vi.fn();
    expect(await interpretReadProgram(`return [typeof process,typeof require,typeof fetch,typeof Buffer,typeof Date,typeof _call];`, bridge))
      .toEqual(Array(6).fill('undefined'));
    await expect(interpretReadProgram(`return require('fs');`, bridge)).rejects.toThrow('Program');
    expect(bridge).not.toHaveBeenCalled();
  });
  it('isolates concurrent programs and refuses unresolved async return values',async()=>{
    const values=await Promise.all([1,2].map(id=>interpretReadProgram(`globalThis.privateValue=${id};return tools.call('company_read',{}).data + privateValue;`,async()=>JSON.stringify({data:10}))));
    expect(values).toEqual([11,12]);
    expect(await interpretReadProgram('return typeof privateValue;',vi.fn())).toBe('undefined');
    await expect(interpretReadProgram('return Promise.resolve(1);',vi.fn())).rejects.toThrow('Program');
  });
  it('bounds endless computation and memory without invoking tools', async () => {
    const bridge = vi.fn();
    await expect(interpretReadProgram('while(true) {}', bridge, { activeMs: 20, wallMs: 1000, memoryBytes: 2 * 1024 * 1024 })).rejects.toThrow('Program');
    await expect(interpretReadProgram(`return 'x'.repeat(10000000);`, bridge, { activeMs: 200, wallMs: 1000, memoryBytes: 2 * 1024 * 1024 })).rejects.toThrow('Program');
    expect(bridge).not.toHaveBeenCalled();
  });
  it('does not let guest try/catch swallow a host boundary failure', async () => {
    const failure = new Error('lease lost');
    const deps = dependencies(async () => { throw failure; });
    await expect(executeHybridRead('interpreter', { code: `try { tools.call('company_read',{candidateId:'one'}); } catch {} return 'fine';` }, context, deps)).rejects.toBe(failure);
  });
  it.each(['mail_send', 'lead_workflow', 'company_score', 'programmatic_read', 'skill_script', 'external_search'])(
    'rejects nonlocal or nested capability %s', async tool => {
      const deps = dependencies(async () => result('unexpected'));
      const out = await executeHybridRead('interpreter', { code: `return tools.call('${tool}',{});` }, context, deps);
      expect(out.status).toBe('partial'); expect(deps.dispatch).not.toHaveBeenCalled();
    });
  it('enforces current mode/collection allowlist even for a permitted interpreter name', async () => {
    const deps = dependencies(async () => result('unexpected')); deps.allowed = new Set(['knowledge_search']);
    const out = await executeHybridRead('interpreter', { code: `return tools.call('mail_read',{messageId:'${mail}'});` }, context, deps);
    expect(out.status).toBe('partial'); expect(deps.dispatch).not.toHaveBeenCalled();
  });
  it('reuses stable leaf identities on recovery and changes them with code or inputs', async () => {
    const cache = new Map<string, ReturnType<typeof result>>(); let executed = 0;
    const deps = dependencies(async call => {
      if (cache.has(call.id)) return cache.get(call.id)!;
      executed++; const output = result([{ id: 'one' }]); cache.set(call.id, output); return output;
    });
    const input = { code: `return tools.call('company_read',{candidateId:'one'});` };
    await executeHybridRead('interpreter', input, context, deps);
    await executeHybridRead('interpreter', input, context, deps);
    expect(executed).toBe(1);
    await executeHybridRead('interpreter', { code: input.code.replace('one', 'two') }, context, deps);
    expect(executed).toBe(2);
  });
  it('stops on unknown reads and preserves the result for dynamic recovery', async () => {
    const deps = dependencies(async () => result(null, { status: 'unknown', missing: ['prior call uncertain'] }));
    const out = await executeHybridRead('interpreter', { code: `tools.call('company_read',{candidateId:'one'}); return tools.call('company_read',{candidateId:'two'});` }, context, deps);
    expect(out.status).toBe('partial'); expect(deps.dispatch).toHaveBeenCalledOnce();
    expect(out.data).toMatchObject({ leaves: [{ output: { status: 'unknown' } }] });
  });
  it('stops at the read limit and retains sixteen receipts', async () => {
    const deps = dependencies(async () => result([]));
    const out = await executeHybridRead('interpreter', { code: `for(let i=0;i<30;i++) tools.call('company_read',{candidateId:String(i)});return [];` }, context, deps);
    expect(out.status).toBe('partial'); expect(deps.dispatch).toHaveBeenCalledTimes(16);
    expect((out.data as { leaves: unknown[] }).leaves).toHaveLength(16);
  });
  it('reads original mail after unambiguous resolution and shares the recipe with interpreter', async () => {
    const deps = dependencies(async call => {
      const request = JSON.parse(call.function.arguments);
      if (request.tool === 'company_search') return result({ matching: { requiresSelection: false }, mailboxCustomers: { items: [{ id: customer }], hasMore: false } });
      if (request.tool === 'customer_timeline') return result({ events: [{ id: mail }], hasMore: false });
      return result({ bodyText: 'Actual original', sentAt: '2026-11-04', id: mail });
    });
    for (const route of ['workflow', 'interpreter'] as const) {
      const input = { workflow: 'customer_recent', query: 'Atlas' };
      const out = await executeHybridRead(route, route === 'workflow' ? input : { code: `return tools.workflow(${JSON.stringify(input)});` }, context, deps);
      expect(out.status).toBe('success'); expect(JSON.stringify(out.data)).toContain('Actual original');
    }
    expect(deps.dispatch).toHaveBeenCalledTimes(6);
  });
  it('returns ambiguity candidates instead of guessing or reading a customer', async () => {
    const deps = dependencies(async () => result({ matching: { requiresSelection: true }, mailboxCustomers: { items: [{ id: customer }], hasMore: false } }));
    const out = await executeHybridRead('workflow', { workflow: 'customer_recent', query: 'Atlas' }, context, deps);
    expect(out.status).toBe('partial'); expect(deps.dispatch).toHaveBeenCalledOnce();
    expect(JSON.stringify(out.data)).toContain(customer);
  });
  it('keeps evidence separate from the program projection and does not expand user text', async () => {
    const deps = dependencies(async () => result([{ id: customer, content: 'Original evidence' }]));
    const out = await executeHybridRead('interpreter', { code: `tools.call('knowledge_search',{query:'product'});return {note:'filtered'};` }, context, deps);
    const messages: ModelMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'parent', type: 'function', function: { name: 'execute_tool', arguments: JSON.stringify({ tool: 'programmatic_read', arguments: { code: '' } }) } }] },
      { role: 'tool', tool_call_id: 'parent', content: JSON.stringify(out) },
    ];
    expect(expandHybridEvidence(messages)).toHaveLength(4);
    expect(toolModelView(messages)[1].content).not.toContain('Original evidence');
    expect(messages[1].content).toContain('Original evidence');
    expect(expandHybridEvidence([{ role: 'user', content: JSON.stringify(out) }])).toHaveLength(1);
  });
});
describe('soft execution routing', () => {
  it('routes only a whole simple request and never drops extra requirements', () => {
    expect(suggestHybridRoute('请查看 Atlas 的最新进展').path).toBe('workflow');
    for (const text of ['查看 Atlas 最新进展，然后发邮件', '比较这两家公司', '他怎么样了']) expect(suggestHybridRoute(text).path).toBe('dynamic');
    expect(suggestHybridRoute('逐家比较所有客户').path).toBe('interpreter');
    expect(suggestHybridRoute('查看 Atlas 最新进展', true).path).toBe('dynamic');
    expect(suggestHybridRoute('查看 Atlas 最新进展', false, true).path).toBe('dynamic');
  });
  it('requires a server eligibility marker before preparing a tool call', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: '查看 Atlas 最新进展' }];
    expect(hybridFirstAction(messages)).toBeNull();
    expect(hybridFirstAction([{ role: 'system', content: '[hybrid-v1:eligible]' }, ...messages])?.tool_calls).toHaveLength(1);
    expect(hybridFirstAction([{ role: 'system', content: '[hybrid-v1:eligible]' }, ...messages, ...messages])).toBeNull();
  });
});
