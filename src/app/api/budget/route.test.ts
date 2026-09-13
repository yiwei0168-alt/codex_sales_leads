import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),set:vi.fn(),taskRead:vi.fn(),taskSet:vi.fn(),fxRead:vi.fn(),rateRead:vi.fn(),deepRead:vi.fn(),searchRead:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/billing/repository",()=>({readSpendBudget:m.read,setSpendBudget:m.set,readTaskSpendBudget:m.taskRead,setTaskSpendBudget:m.taskSet}));
vi.mock("@/lib/billing/fx-reference-repository",()=>({readBillingReferenceStatus:m.fxRead}));
vi.mock("@/lib/billing/openrouter-rate-repository",()=>({readOpenRouterSolRateStatus:m.rateRead}));
vi.mock("@/lib/billing/deepseek-rate-repository",()=>({readDeepSeekRateStatuses:m.deepRead}));
vi.mock("@/lib/billing/search-rate-repository",()=>({readSearchRateStatuses:m.searchRead}));
import {GET,PUT} from "./route";
const actionId="00000000-0000-4000-8000-000000000002";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});m.taskRead.mockResolvedValue({taskLimit:null,stages:[]});
  m.read.mockResolvedValue({budget:null,stages:[]});m.fxRead.mockResolvedValue({fx:{status:"missing"},rules:[]});
  m.rateRead.mockResolvedValue({checkedAt:null,nextAttemptAt:null,status:"missing",hold:false});
  m.deepRead.mockResolvedValue([{sourceKey:"deepseek-flash-public-pricing-v1",tariffKey:"deepseek-flash-v41-text-json",
    checkedAt:null,nextAttemptAt:null,status:"missing",hold:null}]);
  m.searchRead.mockResolvedValue([{sourceKey:"brave-search-public-pricing-v1",tariffKey:"brave-standard-web-search",
    checkedAt:null,nextAttemptAt:null,status:"missing",hold:null},
  {sourceKey:"tavily-search-public-pricing-v1",tariffKey:"tavily-standard-search",
    checkedAt:null,nextAttemptAt:null,status:"missing",hold:null}]);});
it("does not expose budget data without a session",async()=>{
  m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET(new Request("http://localhost/api/budget"))).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
});
it("reads a task budget under its authenticated owner",async()=>{
  const response=await GET(new Request(`http://localhost/api/budget?actionId=${actionId}`));expect(response.status).toBe(200);expect(m.taskRead).toHaveBeenCalledWith("owner",actionId);expect(m.read).not.toHaveBeenCalled();
});
it("routes confirmed task edits separately from the global ceiling",async()=>{
  const response=await PUT(new Request("http://localhost/api/budget",{method:"PUT",body:JSON.stringify({actionId,limitUsd:"0.25",confirmed:true})}));
  expect(response.status).toBe(200);expect(m.taskSet).toHaveBeenCalledWith("owner",actionId,250000);expect(m.set).not.toHaveBeenCalled();
});
it("rejects malformed task IDs and missing confirmation without writes",async()=>{
  expect((await GET(new Request("http://localhost/api/budget?actionId=bad"))).status).toBe(400);
  expect((await PUT(new Request("http://localhost/api/budget",{method:"PUT",body:JSON.stringify({actionId,limitUsd:"50"})}))).status).toBe(400);
  expect(m.taskSet).not.toHaveBeenCalled();
});
it("shows a public-rate review hold without refreshing or changing the owner's budget",async()=>{
  m.rateRead.mockResolvedValue({checkedAt:"2026-09-14T00:00:00Z",nextAttemptAt:"2026-09-21T00:00:00Z",status:"review-required",hold:true});
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  expect((await response.json()).openRouterRateReference).toMatchObject({status:"review-required",hold:true});
  expect(m.read).toHaveBeenCalledWith("owner");expect(m.rateRead).toHaveBeenCalledTimes(1);
  expect(m.set).not.toHaveBeenCalled();
});
it("keeps an unavailable public-rate observation unknown while the budget remains readable",async()=>{
  m.rateRead.mockRejectedValue(new Error("reference storage unavailable"));
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  expect((await response.json()).openRouterRateReference).toEqual({checkedAt:null,nextAttemptAt:null,status:"unavailable",hold:null});
});
it("shows both DeepSeek rate reviews without fetching a public page or changing budget",async()=>{
  m.deepRead.mockResolvedValue([
    {sourceKey:"deepseek-flash-public-pricing-v1",tariffKey:"deepseek-flash-v41-text-json",
      checkedAt:"2026-09-14T00:00:00Z",nextAttemptAt:"2026-09-21T00:00:00Z",status:"validated",hold:false},
    {sourceKey:"deepseek-pro-public-pricing-v1",tariffKey:"deepseek-pro-0813-nonthinking-text",
      checkedAt:"2026-09-14T00:00:00Z",nextAttemptAt:"2026-09-21T00:00:00Z",status:"review-required",hold:true}]);
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  expect((await response.json()).deepSeekRateReferences.map((item:{status:string})=>item.status))
    .toEqual(["validated","review-required"]);
  expect(m.deepRead).toHaveBeenCalledOnce();expect(m.set).not.toHaveBeenCalled();
});
it("keeps missing DeepSeek review storage explicitly unavailable while the owner budget remains readable",async()=>{
  m.deepRead.mockRejectedValue(new Error("public review storage unavailable"));
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  const items=(await response.json()).deepSeekRateReferences;
  expect(items).toHaveLength(2);
  expect(items.every((item:{status:string;hold:boolean|null})=>item.status==="unavailable"&&item.hold===null)).toBe(true);
});
it("shows independent Brave and Tavily Search rate statuses through the authenticated budget API",async()=>{
  m.searchRead.mockResolvedValue([
    {sourceKey:"brave-search-public-pricing-v1",tariffKey:"brave-standard-web-search",
      checkedAt:"2026-09-14T00:00:00Z",nextAttemptAt:"2026-09-15T00:00:00Z",status:"validated",hold:false},
    {sourceKey:"tavily-search-public-pricing-v1",tariffKey:"tavily-standard-search",
      checkedAt:"2026-09-14T00:00:00Z",nextAttemptAt:"2026-09-15T00:00:00Z",status:"review-required",hold:true}]);
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  expect((await response.json()).searchRateReferences.map((item:{status:string})=>item.status))
    .toEqual(["validated","review-required"]);
  expect(m.searchRead).toHaveBeenCalledOnce();expect(m.set).not.toHaveBeenCalled();
});
it("marks search review storage unavailable without hiding the owner's budget",async()=>{
  m.searchRead.mockRejectedValue(new Error("public review storage unavailable"));
  const response=await GET(new Request("http://localhost/api/budget"));
  expect(response.status).toBe(200);
  const items=(await response.json()).searchRateReferences;
  expect(items).toHaveLength(2);
  expect(items.every((item:{status:string;hold:boolean|null})=>item.status==="unavailable"&&item.hold===null)).toBe(true);
});
