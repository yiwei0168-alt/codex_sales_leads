import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import {readLatestEnrichmentRun} from "./enrichment-run-read";

beforeEach(()=>m.query.mockReset());
it("returns an empty persisted state without reading another account's items",async()=>{
  m.query.mockResolvedValueOnce([]);
  expect(await readLatestEnrichmentRun("owner")).toEqual({run:null,items:[],counts:{pending:0,running:0,completed:0,failed:0},workspaceCoverage:null});
  expect(m.query).toHaveBeenCalledTimes(1);
  expect(m.query.mock.calls[0][1]).toContain("w.owner_id=$1");
});
it("reads items and coverage from the owned saved run",async()=>{
  m.query.mockResolvedValueOnce([{id:"run",workspace_id:"workspace",status:"running",target_count:2,processed_count:1,search_credits_used:0,extract_credits_used:0,error_message:null,started_at:"now",finished_at:null}])
    .mockResolvedValueOnce([{id:"item",company_id:"company",canonical_name:"Example",domain:"example.com",status:"completed",phase:"done",worker_id:null,attempts:1,named_contact_count:1,email_count:0,search_credits_used:0,extract_credits_used:0,error_message:null,started_at:"now",finished_at:"now",updated_at:"now"}])
    .mockResolvedValueOnce([{target_count:2,covered_count:1,contact_count:1,email_count:0}]);
  const value=await readLatestEnrichmentRun("owner");
  expect(value.counts.completed).toBe(1);
  expect(value.items[0].companyId).toBe("company");
  expect(value.workspaceCoverage?.coveredCount).toBe(1);
  expect(m.query.mock.calls[1][2]).toEqual(["run"]);
  expect(m.query.mock.calls[2][2]).toEqual(["workspace"]);
});
