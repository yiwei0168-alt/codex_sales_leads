import {beforeEach,expect,it,vi} from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/rag/db',()=>({tenantQuery:query}));
import {knowledgeOriginalsTool as tool} from './knowledge-originals-tool';
import {modePromptRules,LEGACY_MODE_PROMPT_VERSION} from './mode-prompts';
import {modeConfigSchema,modeModelConfig} from './mode-config';
const context={userId:'owned-account',runId:'run',leaseToken:'lease',role:'member' as const,knowledgeScope:['company' as const]};
beforeEach(()=>{vi.resetAllMocks();query.mockResolvedValue([]);});
it('asks for an explicit target without querying any inventory',async()=>{
  const output=await tool.execute({},context);
  expect(output.status).toBe('missing_input');expect(output.data).toMatchObject({kind:'clarification'});
  expect(query).not.toHaveBeenCalled();expect(output.artifacts).toEqual([]);
});
it('gives the same access denial for any unavailable ID without leaking metadata',async()=>{
  const output=await tool.execute({assetId:'abcdefab-cdef-4abc-8abc-abcdefabcdef'},context);
  expect(output.data).toMatchObject({kind:'deny'});expect(output.artifacts).toEqual([]);
  expect(query.mock.calls[0][2][0]).toBe('owned-account');expect(query.mock.calls[0][2][3]).toEqual(['company']);
});
it('reports a scoped no-match without claiming global absence',async()=>{
  const output=await tool.execute({query:'Synthetic contract appendix'},context);
  expect(output.data).toMatchObject({kind:'insufficient-evidence',reason:'no-accessible-match'});
});
it('cannot accept an identity supplied by a model or expand server collections',()=>{
  expect(()=>tool.input.parse({query:'notes',userId:'someone-else'})).toThrow();
  expect(()=>tool.input.parse({query:'notes',collections:['product']})).toThrow();
});
it('does not silently select one of multiple registered matches',async()=>{
  query.mockResolvedValue([{id:'a',title:'Contract r1'},{id:'b',title:'Contract r2'}]);
  const output=await tool.execute({query:'Contract'},context);
  expect(output.data).toMatchObject({requiresSelection:true});expect(output.artifacts).toHaveLength(2);
});
it('pins prior prompt behavior and gives new jobs explicit refusal and clarification rules',()=>{
  const profile=modeModelConfig('quick').profile!;
  expect(profile.promptVersion).toBe('agent-mode-prompts-v1.1.0');
  expect(modeConfigSchema.parse({...profile,promptVersion:LEGACY_MODE_PROMPT_VERSION}).promptVersion).toBe(LEGACY_MODE_PROMPT_VERSION);
  expect(modePromptRules('quick',LEGACY_MODE_PROMPT_VERSION)).not.toContain('资料回答边界');
  for(const mode of ['quick','standard','deep'] as const)expect(modePromptRules(mode)).toContain('不要用“资料不足”代替拒绝');
});
