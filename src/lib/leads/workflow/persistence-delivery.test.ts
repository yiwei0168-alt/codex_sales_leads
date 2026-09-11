import {expect,it,vi} from "vitest";
import type {PoolClient} from "pg";
import type {CompanyRecord} from "@/lib/domain";
import {saveCompany} from "./persistence";
const record={id:"company",domain:"example.com",primaryBusinessRole:"SI"} as CompanyRecord;
function mockQuery(previous:unknown[]){return vi.fn().mockImplementation(async(sql:string)=>{
  if(sql.includes('insert into sales_company'))return {rows:[{id:'db-company'}]};
  if(sql.includes('select company_id from workspace_company'))return {rows:[{company_id:'db-company'}]};
  if(sql.includes('select * from workspace_company_market'))return {rows:previous};
  return {rows:[]};
});}
it("refreshes assessment links without overwriting manually protected business fields",async()=>{
  const query=mockQuery([{candidate_id:'company',record:{primaryBusinessRole:'Distributor',opportunityStage:'Contacted'},user_overrides:{primaryBusinessRole:'Distributor'}}]);
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","new-run")).toEqual({added:0,updated:1,roleChanged:0});
  const saved=query.mock.calls.find(([sql])=>sql.includes('insert into workspace_company_market'))!;
  expect(saved[0]).toContain('search_run_id=excluded.search_run_id');
  expect(saved[0]).toContain("user_overrides=workspace_company_market.user_overrides - 'assessmentNeedsRefresh'");
  expect(JSON.parse(saved[1][4])).toMatchObject({opportunityStage:'Contacted',country:'GB',assessmentNeedsRefresh:true});
});
it("counts role correction as a subset of updated records",async()=>{
  const query=mockQuery([{candidate_id:'company',record:{primaryBusinessRole:'Distributor'},user_overrides:{}}]);
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","run")).toEqual({added:0,updated:1,roleChanged:1});
});
it("counts an existing global company newly added to this workspace as new",async()=>{
  const query=mockQuery([]);
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","run")).toEqual({added:1,updated:0,roleChanged:0});
});
