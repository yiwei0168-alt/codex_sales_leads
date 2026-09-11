import { expect,it,vi,beforeEach } from "vitest";
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
vi.mock("@/lib/mailbox/crypto",()=>({decryptMailboxContent:(_user:string,value:string)=>JSON.parse(value)}));
import { followUpContext,mailAddresses } from "./follow-up-context";
const content=JSON.stringify({subject:"Hello",bodyText:"Dear Alex",sender:["sender@example.com"],recipients:["alex@example.com"]});
beforeEach(()=>m.query.mockReset());
it("normalizes actual imported address objects and rejects unrelated inbound senders",async()=>{
  expect(mailAddresses([{address:"Alex@Example.com",name:"Alex"}])).toEqual(["alex@example.com"]);
  m.query.mockResolvedValueOnce([{id:"p",workspace_id:"w",company_id:"c",content_ciphertext:content,country_code:"GB",role:"SI"}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
    {id:"reply",sent_at:"2026-09-01",content_ciphertext:JSON.stringify({subject:"Pricing",bodyText:"Please send details",sender:[{address:"alex@example.com"}],recipients:[{address:"sender@example.com"}]})},
    {id:"other",sent_at:"2026-09-01",content_ciphertext:JSON.stringify({subject:"Other",bodyText:"Unrelated",sender:[{address:"other@example.com"}],recipients:[{address:"sender@example.com"}]})}]);
  const result=await followUpContext("u","p");expect(result?.inbound).toHaveLength(1);expect(result?.inbound[0].subject).toBe("Pricing");
});
it("does not read memory or thread when the parent is not owned",async()=>{m.query.mockResolvedValue([]);expect(await followUpContext("u","p")).toBeNull();expect(m.query).toHaveBeenCalledTimes(1);});
it("restricts style to active tenant/workspace/market/role and thread to the same recipient",async()=>{
  m.query.mockResolvedValueOnce([{id:"p",workspace_id:"w",company_id:"c",content_ciphertext:content,country_code:"CO",role:"SI"}])
    .mockResolvedValueOnce([{id:"p",sent_at:"2026-01-01",content_ciphertext:content},{id:"wrong",sent_at:"2026-01-01",content_ciphertext:content.replace("alex@example.com","other@example.com")}])
    .mockResolvedValueOnce([{id:"style",content:"Brief emails"}]).mockResolvedValueOnce([]);
  const result=await followUpContext("u","p");expect(result?.thread).toHaveLength(0);expect(result?.stylePreferences).toHaveLength(1);expect(result?.inbound).toHaveLength(0);
  const sql=m.query.mock.calls.map(([,sql])=>sql).join("\n");for(const text of ["status='active'","kind='email-style'","cardinality(market_codes)","cardinality(channel_roles)","workspace_id=$2","p.user_id=$1"])expect(sql).toContain(text);
  expect(m.query.mock.calls.every(([userId])=>userId==="u")).toBe(true);
});
