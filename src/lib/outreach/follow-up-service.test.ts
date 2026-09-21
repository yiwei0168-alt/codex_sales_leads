import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),context:vi.fn(),generate:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("./follow-up-context",()=>({followUpContext:m.context}));
vi.mock("./kimi-agent",()=>({generateFollowUp:m.generate}));
vi.mock("@/lib/mailbox/crypto",()=>({encryptMailboxContent:m.encrypt,decryptMailboxContent:m.decrypt}));
vi.mock("@/lib/tracked-operation",()=>({trackedOperation:async(_user:string,_kind:string,_count:number,_bytes:number,work:()=>Promise<unknown>)=>work()}));
import {createFollowUpDraft} from "./follow-up-service";

beforeEach(()=>{for(const value of Object.values(m))value.mockReset();});

it("stores a simulated follow-up as an encrypted account draft without sending",async()=>{
  m.context.mockResolvedValue({original:{subject:"Earlier note",bodyText:"Original body",sender:"owner@example.com",recipients:["buyer@example.com"]},thread:[],inbound:[],stylePreferences:[],threadTruncated:false});
  m.generate.mockResolvedValue({draft:{subject:"Re: Earlier note",body:"Could we schedule a call?"},model:"local-fixture"});
  m.encrypt.mockReturnValue("ciphertext-only");m.query.mockResolvedValue([{id:"00000000-0000-4000-8000-000000000001"}]);
  const output=await createFollowUpDraft("owner",{parentId:"parent",instructions:"Ask for a meeting"});
  expect(output).toMatchObject({draftId:"00000000-0000-4000-8000-000000000001"});
  expect(m.encrypt).toHaveBeenCalledWith("owner",{subject:"Re: Earlier note",bodyText:"Could we schedule a call?",sender:"owner@example.com",recipients:["buyer@example.com"]});
  expect(m.query.mock.calls[0][2]).toEqual(["owner","parent","ciphertext-only",expect.any(String)]);
});

it("does not generate or persist for an inaccessible parent",async()=>{
  m.context.mockResolvedValue(null);
  expect(await createFollowUpDraft("other",{parentId:"parent",instructions:"Ask for a meeting"})).toBeNull();
  expect(m.generate).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
});
