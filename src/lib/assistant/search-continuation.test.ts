import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
vi.mock('@/lib/rag/db',()=>({tenantQuery:vi.fn(),tenantTransaction:vi.fn()}));
import {continuationGap,proposeSearchContinuationInTransaction} from './search-continuation';
const query=vi.fn();
beforeEach(()=>{query.mockReset().mockImplementation(async(sql:string)=>{
  if(sql.includes('select conversation_id,payload,result'))return {rows:[{conversation_id:'conversation',payload:{countryCode:'CO',countryName:'Colombia',roles:['SI'],targetCount:50},result:{accepted:35,runId:'run'}}]};
  if(sql.includes('select r.id,r.workspace_id'))return {rows:[{id:'run',workspace_id:'workspace'}]};
  if(sql.includes('select distinct lower(domain)'))return {rows:[{domain:'example.test'},{domain:'www.example.test'}]};
  if(sql.includes('insert into assistant_action'))return {rows:[{id:'child'}]};
  return {rows:[]};
});});
it('uses only a known remaining gap and enforces depth and stagnation stops',()=>{
  expect(continuationGap(50,35,0,undefined,undefined)).toBe(15);
  expect(continuationGap(15,5,1,35,undefined)).toBe(10);
  for(const accepted of [null,undefined,'35',-1,51,50,1.5])expect(()=>continuationGap(50,accepted,0,undefined,undefined)).toThrow();
  expect(()=>continuationGap(50,0,3,5,undefined)).toThrow('三次');
  expect(continuationGap(50,0,1,0,'provider-unavailable')).toBe(50);
  expect(()=>continuationGap(50,0,1,0,'processing-incomplete')).toThrow('原检查点');
  expect(()=>continuationGap(50,30,0,undefined,'confirmed-exhaustion')).toThrow('停滞');
  expect(()=>continuationGap(50,30,0,undefined,'no-qualified-progress')).toThrow('停滞');
});
it('creates a proposal, retains parent results and keeps exclusions out of model plans',async()=>{
  const result=await proposeSearchContinuationInTransaction({query} as unknown as PoolClient,'owner','parent');
  expect(result).toEqual({actionId:'child',reused:false,gap:15,excludedCount:1});
  expect(query.mock.calls[0][0]).toContain('for update');
  expect(query.mock.calls.find(([sql])=>sql.includes('select distinct lower(domain)'))?.[0]).toContain("scoring_status='completed'");
  const payload=JSON.parse(query.mock.calls.find(([sql])=>sql.includes('insert into assistant_action'))![1][2]);
  expect(payload.targetCount).toBe(15);expect(payload).not.toHaveProperty('excluded_domains');
  expect(query.mock.calls.some(([sql])=>sql.includes('update assistant_action')||sql.includes('insert into lead_workflow_job'))).toBe(false);
  const audit=JSON.parse(query.mock.calls.find(([sql])=>sql.startsWith('insert into workspace_audit_event'))![1][3]);
  expect(audit.efficiency).toMatchObject({inputItems:1,outputItems:1,validOutputItems:1,downstreamUsedItems:0,userAdoptedItems:null});
});
it('returns an existing child on repeated clicks without another proposal or lookup',async()=>{
  const original=query.getMockImplementation()!;
  query.mockImplementation(async(sql:string,...rest:unknown[])=>sql.startsWith('select child_action_id')?{rows:[{child_action_id:'existing'}]}:original(sql,...rest));
  expect(await proposeSearchContinuationInTransaction({query} as unknown as PoolClient,'owner','parent')).toEqual({actionId:'existing',reused:true});
  expect(query).toHaveBeenCalledTimes(3);expect(query.mock.calls[2][0]).toContain('search.continuation-reused');
  expect(JSON.parse(query.mock.calls[2][1][2]).efficiency).toMatchObject({inputItems:1,outputItems:0,
    validOutputItems:0,downstreamUsedItems:0,userAdoptedItems:null,utilizationEfficiency:null,discardedReasonCounts:{duplicateProposalAvoided:1}});
});
it('does not infer missing evidence lineage or create an unscoped child',async()=>{
  query.mockResolvedValue({rows:[]});await expect(proposeSearchContinuationInTransaction({query} as unknown as PoolClient,'other','parent')).rejects.toThrow('当前用户');
  expect(query).toHaveBeenCalledTimes(1);
});
it('allows a proven run with zero completed assessments without permanently excluding incomplete companies', async()=>{
  const original=query.getMockImplementation()!;
  query.mockImplementation(async(sql:string,...rest:unknown[])=>sql.startsWith('select distinct lower(domain)')?{rows:[]}:original(sql,...rest));
  expect(await proposeSearchContinuationInTransaction({query} as unknown as PoolClient,'owner','parent'))
    .toEqual({actionId:'child',reused:false,gap:15,excludedCount:0});
});
