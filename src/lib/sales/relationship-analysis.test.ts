import { beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),outside:vi.fn(),execute:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.outside,tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query:mocks.query})}));
vi.mock('@/providers/resilient-ai',()=>({createLeadAiProvider:()=>({execute:mocks.execute})}));
import {analyzeStoredRelationship} from './relationship-analysis';
beforeEach(()=>{
  vi.clearAllMocks();mocks.query.mockResolvedValue({rows:[{id:'attempt'}]});
  mocks.outside.mockImplementation(async(_u:string,sql:string)=>{
    if(sql.startsWith('select c.id'))return ['source','target'].map(name=>({id:name,external_id:name,workspace_id:'workspace',record:{id:name,displayName:name,domain:`${name}.test`,evidence:[{id:'evidence',sourceUrl:'https://example.test',claim:'Source supplies target.',summary:'Source supplies target.',capturedAt:'2026-09-01',status:'Verified'}]}}));
    if(sql.includes("status='completed'"))return [{id:'attempt'}];return [];
  });
  mocks.execute.mockResolvedValue({output:{suggestions:[]},modelVersion:'fixture',usage:{promptTokens:10,completionTokens:2},retries:0});
});
it('only commits a still-running attempt and retains model usage',async()=>{
  expect(await analyzeStoredRelationship('owner','CO','source','target')).toMatchObject({analysisId:'attempt',cached:false,suggestions:[]});
  const saved=mocks.outside.mock.calls.find(([,sql])=>sql.includes("status='completed'"))!;
  expect(saved[1]).toContain("status='running' returning id");expect(saved[2][3]).toContain('"inputTokens":10');
});
it('does not surface late suggestions or overwrite a closed attempt with a generic failure',async()=>{
  const implementation=mocks.outside.getMockImplementation()!;
  mocks.outside.mockImplementation(async(user:string,sql:string,...rest:unknown[])=>sql.includes("status='completed'")?[]:implementation(user,sql,...rest));
  await expect(analyzeStoredRelationship('owner','CO','source','target')).rejects.toThrow('迟到结果');
  expect(mocks.outside.mock.calls.some(([,sql])=>sql.includes("jsonb_build_object('lateResult'"))).toBe(true);
  const failed=mocks.outside.mock.calls.at(-1)!;expect(failed[1]).toContain("and status='running'");
  expect(mocks.execute).toHaveBeenCalledTimes(1);
});
