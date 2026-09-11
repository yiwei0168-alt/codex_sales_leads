import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),outside:vi.fn(),send:vi.fn(),close:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.outside,tenantTransaction:async(_user:string,work:(client:unknown)=>unknown)=>work({query:mocks.query})}));
vi.mock("./repository",()=>({getMailboxConnection:async()=>({email:"sender@example.com",status:"active"}),connectionPassword:()=>"test-only"}));
vi.mock("./crypto",()=>({encryptMailboxContent:()=>"encrypted-test-content",decryptMailboxContent:()=>({recipients:["recipient@example.com"]})}));
vi.mock("nodemailer",()=>({default:{createTransport:()=>({sendMail:mocks.send,close:mocks.close})}}));
import { sendOutbound,sendMailSchema } from "./outbound";
import { afterSuccessfulSend } from "@/lib/sales/opportunity-stages";
const input={connectionId:"11111111-1111-4111-8111-111111111111",companyExternalId:"test-company",to:"recipient@example.com",
  subject:"Test",body:"Test body",idempotencyKey:"22222222-2222-4222-8222-222222222222",confirmed:true as const};
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockImplementation(async(sql:string)=>{
  if(sql.includes("select c.id"))return {rows:[{id:"company",workspace_id:"workspace"}]};
  if(sql.includes("select email"))return {rows:[{email:"sender@example.com"}]};
  if(sql.includes("insert into outbound_mail"))return {rows:[{id:"message"}]};
  return {rows:[]};
});mocks.send.mockResolvedValue({accepted:["recipient@example.com"]});mocks.outside.mockResolvedValue([]);});
it("requires explicit confirmation and a single recipient without header injection",()=>{
  expect(sendMailSchema.safeParse(input).success).toBe(true);
  expect(sendMailSchema.safeParse({...input,confirmed:false}).success).toBe(false);
  expect(sendMailSchema.safeParse({...input,to:"a@example.com,b@example.com"}).success).toBe(false);
  expect(sendMailSchema.safeParse({...input,subject:"Subject\r\nBcc: x@example.com"}).success).toBe(false);
});
it("sends once and marks sent only after provider acceptance",async()=>{
  expect(await sendOutbound("user",input)).toMatchObject({status:"sent"});
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("status='sent'"))).toBe(true);
});
it("records timeout as unknown and never retries SMTP",async()=>{
  mocks.send.mockRejectedValue(Object.assign(new Error("timeout"),{code:"ETIMEDOUT"}));
  expect(await sendOutbound("user",input)).toMatchObject({status:"unknown"});
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("opportunity_stage='Contacted'"))).toBe(false);
});
it("reuses a reserved receipt across retries and page-refresh keys",async()=>{
  let storedHash="";
  mocks.query.mockImplementation(async(sql:string,values:unknown[])=>{
    if(sql.includes("select c.id"))return {rows:[{id:"company",workspace_id:"workspace"}]};
    if(sql.includes("select email"))return {rows:[{email:"sender@example.com"}]};
    if(sql.includes("insert into outbound_mail")){
      if(storedHash)return {rows:[]};storedHash=String(values[5]);return {rows:[{id:"message"}]};
    }
    if(sql.includes("select id,status,request_hash"))return {rows:[{id:"message",status:"sent",request_hash:storedHash}]};
    return {rows:[]};
  });
  await sendOutbound("user",input);
  expect(await sendOutbound("user",input)).toMatchObject({status:"sent",reused:true});
  expect(await sendOutbound("user",{...input,idempotencyKey:"33333333-3333-4333-8333-333333333333"})).toMatchObject({reused:true});
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("does not downgrade later opportunity stages on successful sends",()=>{
  expect(afterSuccessfulSend("Qualified")).toBe("Contacted");
  expect(afterSuccessfulSend("Engaged")).toBe("Engaged");
  expect(afterSuccessfulSend("Cooperating")).toBe("Cooperating");
  expect(afterSuccessfulSend("Paused")).toBe("Paused");
});
