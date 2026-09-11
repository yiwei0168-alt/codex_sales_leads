import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn(),start:vi.fn(),finish:vi.fn(),decrypt:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireApiSession:m.session}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("@/lib/mailbox/crypto",()=>({decryptMailboxContent:m.decrypt}));
vi.mock("@/lib/operation-metrics",()=>({startOperation:m.start,finishOperation:m.finish,bestEffortMetric:(write:()=>Promise<unknown>)=>write()}));
import {GET} from "./route";
const params={params:Promise.resolve({externalId:"company"})};
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:"owner"});m.start.mockResolvedValue("metric");m.finish.mockResolvedValue(undefined);m.decrypt.mockReturnValue({subject:"Saved subject",bodyText:"Private body"});});
it("does not read mail without authentication",async()=>{m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET(new Request("http://localhost"),params)).status).toBe(401);expect(m.query).not.toHaveBeenCalled();});
it("projects only twenty metadata rows and decrypts no pagination sentinel",async()=>{
  m.query.mockResolvedValue(Array.from({length:21},(_,i)=>({id:String(i),content_ciphertext:"cipher",subject:"",direction:"inbound",sentAt:null,source:"domain-match"})));
  const response=await GET(new Request("http://localhost?offset=20"),params);const data=await response.json();expect(data.messages).toHaveLength(20);expect(data.hasMore).toBe(true);expect(m.decrypt).toHaveBeenCalledTimes(20);expect(JSON.stringify(data)).not.toMatch(/Private body|cipher/);
  expect(m.query).toHaveBeenCalledWith("owner",expect.stringContaining("l.user_id=$1 and w.owner_id=$1"),["owner","company",20]);
});
it("rejects negative offsets before any read",async()=>{expect((await GET(new Request("http://localhost?offset=-1"),params)).status).toBe(400);expect(m.query).not.toHaveBeenCalled();});
