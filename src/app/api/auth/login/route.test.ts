import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),create:vi.fn(),verify:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({query:m.query}));
vi.mock("@/lib/auth/session",()=>({createSession:m.create,hashClientAddress:()=>"hashed-address"}));
vi.mock("@/lib/auth/users",()=>({findLoginUser:m.find,normalizeEmail:(value:string)=>value.trim().toLowerCase(),isValidEmail:()=>true}));
vi.mock("@/lib/auth/password",()=>({verifyPassword:m.verify}));
import {POST} from "./route";
beforeEach(()=>{vi.resetAllMocks();m.query.mockResolvedValue([{count:"0"}]);});
it.each([null,[],{email:1,password:"x"},{email:"test@example.invalid",password:{}},{email:"test@example.invalid",password:"x".repeat(1025)}])("rejects malformed credentials before lookup: %#",async body=>{
  const result=await POST(new Request("http://localhost/api/auth/login",{method:"POST",body:JSON.stringify(body)}));
  expect(result.status).toBe(400);expect(m.find).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it("preserves the rate limit before credential lookup",async()=>{
  m.query.mockResolvedValue([{count:"5"}]);
  expect((await POST(new Request("http://localhost/api/auth/login",{method:"POST",body:'{}'}))).status).toBe(429);expect(m.find).not.toHaveBeenCalled();
});
