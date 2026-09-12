import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),get:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({query:m.query}));
vi.mock("next/headers",()=>({cookies:async()=>({get:m.get})}));
import {getSession,requireApiSession} from "./session";
beforeEach(()=>vi.resetAllMocks());
it("does not touch the database without a session cookie",async()=>{expect(await getSession()).toBeNull();expect(m.query).not.toHaveBeenCalled();});
it("checks current user activation and expiry, never persisting the cookie token",async()=>{
  m.get.mockReturnValue({value:"synthetic-session-token"});m.query.mockResolvedValue([]);
  const response=await requireApiSession();expect(response).toBeInstanceOf(Response);expect((response as Response).status).toBe(401);
  expect(m.query.mock.calls[0][0]).toContain("u.status = 'active'");expect(m.query.mock.calls[0][0]).toContain("s.expires_at > now()");
  expect(JSON.stringify(m.query.mock.calls)).not.toContain("synthetic-session-token");
});
it("returns current server-side identity rather than cookie claims",async()=>{
  m.get.mockReturnValue({value:"synthetic-session-token"});m.query.mockResolvedValue([{user_id:"owner",display_name:"Fixture",role:"member"}]);
  expect(await getSession()).toEqual({userId:"owner",displayName:"Fixture",role:"member"});
});
