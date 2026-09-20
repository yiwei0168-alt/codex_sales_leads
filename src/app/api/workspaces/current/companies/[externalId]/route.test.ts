import {describe,expect,it,vi,beforeEach} from "vitest";

const mocks=vi.hoisted(()=>({session:vi.fn(),update:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:mocks.session}));
vi.mock("@/lib/sales/repository",()=>({updateCompanyState:mocks.update}));
import {PATCH} from "./route";

const context={params:Promise.resolve({externalId:"company-1"})};
function request(body:unknown){return new Request("https://example.test/api/workspaces/current/companies/company-1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
describe("versioned company page write",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:"account-1",role:"member"});});
  it("refuses an edit without the version shown to the page",async()=>{
    const response=await PATCH(request({nextAction:"Call"}),context);
    expect(response.status).toBe(409);expect(mocks.update).not.toHaveBeenCalled();
  });
  it("passes exact revision to the shared service and reports stale state",async()=>{
    mocks.update.mockRejectedValueOnce(new Error("Company state changed; read the latest revision before updating"));
    const response=await PATCH(request({nextAction:"Call",expectedRevision:3}),context);
    expect(response.status).toBe(409);
    expect(mocks.update).toHaveBeenCalledWith("company-1",{nextAction:"Call"},"account-1",3);
  });
  it("returns the new revision on a successful edit",async()=>{
    mocks.update.mockResolvedValueOnce({id:"company-1",stateRevision:4});
    const response=await PATCH(request({nextAction:"Call",expectedRevision:3}),context);
    expect(response.status).toBe(200);
    expect((await response.json()).company.stateRevision).toBe(4);
  });
});
