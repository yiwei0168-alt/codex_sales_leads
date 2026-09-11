import { beforeEach,expect,it,vi } from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import { addManualCompany } from './manual-company';
beforeEach(()=>{query.mockReset().mockImplementation(async(sql:string)=>{
  if(sql.includes('select id from market_workspace'))return {rows:[{id:'workspace'}]};
  if(sql.includes('insert into sales_company'))return {rows:[{id:'global-identity',external_id:'legacy-mx-company'}]};
  return {rows:[]};
});});
it('allows another country membership for the same global identity',async()=>{
  const result=await addManualCompany('owner',{name:'Fixture',country:'CO',website:'example.test',role:'SI'});
  expect(result.duplicate).toBe(false);expect(result.externalId).toMatch(/^market-co-/);
  expect(query.mock.calls[1][0]).toContain('wc.market_country_code=$2');
  const insert=query.mock.calls.find(([sql])=>sql.includes('insert into workspace_company_market'))!;
  expect(insert[1].slice(0,3)).toEqual(['workspace','global-identity','CO']);
  const overrides=JSON.parse(insert[1][5]);expect(overrides.primaryBusinessRole).toBe('SI');
  expect(overrides).not.toHaveProperty('fitScore');expect(overrides).not.toHaveProperty('evidence');
});
it('returns an existing country candidate without creating or researching another record',async()=>{
  query.mockImplementation(async(sql:string)=>sql.includes('select id from market_workspace')?{rows:[{id:'workspace'}]}:{rows:[{external_id:'same-country-candidate'}]});
  expect(await addManualCompany('owner',{name:'Fixture',country:'CO',website:'example.test'})).toEqual({duplicate:true,externalId:'same-country-candidate'});
  expect(query).toHaveBeenCalledTimes(2);
});
