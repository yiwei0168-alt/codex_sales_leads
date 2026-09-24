import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({browse:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:async()=>({userId:"owner",role:"member"})}));
vi.mock("@/lib/knowledge/vectorless",()=>({browseTree:state.browse,readEvidence:state.read}));
import {GET} from "./route";
const doc="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
beforeEach(()=>{state.browse.mockReset();state.read.mockReset();});
it("paginates only through the account-scoped tree reader",async()=>{
  state.browse.mockResolvedValue(Array.from({length:21},(_,index)=>({id:String(index)})));
  const response=await GET(new Request(`https://local.test/api/knowledge/tree?documentId=${doc}&offset=20`));
  expect(response.status).toBe(200);
  expect(state.browse).toHaveBeenCalledWith("owner",doc,null,20,21);
  expect((await response.json()).hasMore).toBe(true);
});
it("does not disclose evidence from another document",async()=>{
  state.read.mockResolvedValue({id:other,documentId:other,content:"private"});
  const response=await GET(new Request(`https://local.test/api/knowledge/tree?documentId=${doc}&nodeId=${other}`));
  expect(response.status).toBe(404);
  expect(state.read).toHaveBeenCalledWith("owner",other);
});
