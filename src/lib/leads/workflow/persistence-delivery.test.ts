import {expect,it,vi} from "vitest";
import type {PoolClient} from "pg";
import type {CompanyRecord} from "@/lib/domain";
import {saveCompany} from "./persistence";
const record={id:"company",domain:"example.com",primaryBusinessRole:"SI"} as CompanyRecord;
it("refreshes assessment links without overwriting manually protected business fields",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]}).mockResolvedValueOnce({rows:[{id:"db-company"}]}).mockResolvedValueOnce({rows:[{role:"Distributor",overridden:true}]});
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","new-run")).toEqual({added:0,updated:1,roleChanged:0});
  expect(query).toHaveBeenCalledWith(expect.stringContaining("where workspace_company.manually_edited = false"),expect.any(Array));
  expect(query).toHaveBeenCalledWith("update workspace_company set search_run_id=$3,updated_at=now() where workspace_id=$1 and company_id=$2 and manually_edited=true",["workspace","db-company","new-run"]);
});
it("counts role correction as a subset of updated records",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]}).mockResolvedValueOnce({rows:[{id:"db-company"}]}).mockResolvedValueOnce({rows:[{role:"Distributor",overridden:false}]});
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","run")).toEqual({added:0,updated:1,roleChanged:1});
});
it("counts an existing global company newly added to this workspace as new",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]}).mockResolvedValueOnce({rows:[{id:"db-company"}]}).mockResolvedValueOnce({rows:[]});
  expect(await saveCompany({query} as unknown as PoolClient,"workspace",record,"GB","run")).toEqual({added:1,updated:0,roleChanged:0});
});
