import { afterEach, beforeEach, expect, it, vi } from "vitest";

const lookup=vi.hoisted(()=>vi.fn());
const transport=vi.hoisted(()=>vi.fn());
vi.mock("node:dns/promises",()=>({lookup}));
vi.mock("@/lib/network/model-transport",()=>({modelRoutedTransport:()=>transport}));
import { mailboxConnectionSchema, publicMailAddresses } from "./connection-config";

const base={email:"sales@example.com",displayName:"欧洲销售",accessMode:"read-only" as const,
  securityPassword:"example-app-password",imapHost:"imap.example.com",imapPort:993,smtpPort:465};
beforeEach(()=>{vi.stubEnv("MAILBOX_DNS_MODE","system");transport.mockReset();lookup.mockReset().mockResolvedValue([{address:"8.8.8.8",family:4}]);});
afterEach(()=>vi.unstubAllEnvs());

it("requires explicit SMTP settings for send-enabled mailboxes",()=>{
  expect(mailboxConnectionSchema.safeParse(base).success).toBe(true);
  expect(mailboxConnectionSchema.safeParse({...base,accessMode:"send-enabled"}).success).toBe(false);
  expect(mailboxConnectionSchema.safeParse({...base,accessMode:"send-enabled",smtpHost:"smtp.example.com",smtpPort:587}).success).toBe(true);
  expect(mailboxConnectionSchema.safeParse({...base,imapHost:"127.0.0.1"}).success).toBe(false);
  expect(mailboxConnectionSchema.safeParse({...base,smtpPort:25}).success).toBe(false);
});

it("rejects any private DNS answer before opening a mailbox socket",async()=>{
  lookup.mockResolvedValue([{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]);
  await expect(publicMailAddresses("imap.example.com")).rejects.toThrow("非公网");
  lookup.mockResolvedValue([{address:"10.0.0.8",family:4}]);
  await expect(publicMailAddresses("imap.example.com")).rejects.toThrow("非公网");
});

it("keeps public DNS resolution bounded to four unique addresses",async()=>{
  lookup.mockResolvedValue(Array.from({length:8},(_,index)=>({address:`8.8.8.${index+1}`,family:4})));
  expect(await publicMailAddresses("imap.example.com")).toHaveLength(4);
});

const dnsBody=(address:string)=>({Status:0,Question:{name:"imap.example.com.",type:1},Answer:[{name:"imap.example.com.",type:1,data:address}]});
it("uses explicitly selected HTTPS DNS and preserves public-IP validation",async()=>{
  vi.stubEnv("MAILBOX_DNS_MODE","alidns-doh");
  lookup.mockResolvedValue([{address:"198.18.0.123",family:4}]);
  transport.mockResolvedValue(Response.json(dnsBody("8.8.8.8")));
  expect(await publicMailAddresses("imap.example.com")).toEqual(["8.8.8.8"]);
  expect(lookup).not.toHaveBeenCalled();
  const [url,init]=transport.mock.calls[0];
  expect(url.href).toBe("https://dns.alidns.com/resolve?name=imap.example.com&type=A");
  expect(init).toMatchObject({method:"GET",redirect:"error"});
  expect(init.headers).toBeUndefined();
  for(const address of ["127.0.0.1","10.0.0.1","198.18.0.123","not-an-ip"]){
    transport.mockResolvedValue(Response.json(dnsBody(address)));
    await expect(publicMailAddresses("imap.example.com")).rejects.toThrow();
  }
});
it("fails closed on failed, mismatched, truncated or empty HTTPS DNS responses",async()=>{
  vi.stubEnv("MAILBOX_DNS_MODE","alidns-doh");
  for(const body of [{...dnsBody("8.8.8.8"),Status:3},{...dnsBody("8.8.8.8"),TC:true},
    {...dnsBody("8.8.8.8"),Question:{name:"other.example.com",type:1}},
    {...dnsBody("8.8.8.8"),Answer:[{name:"unrelated.example.com",type:1,data:"8.8.8.8"}]}]){
    transport.mockResolvedValue(Response.json(body));
    await expect(publicMailAddresses("imap.example.com")).rejects.toThrow();
  }
  transport.mockResolvedValue(new Response(null,{status:503}));
  await expect(publicMailAddresses("imap.example.com")).rejects.toThrow();
  expect(lookup).not.toHaveBeenCalled();
});
it("accepts only addresses attached to the requested DNS name or its alias chain",async()=>{
  vi.stubEnv("MAILBOX_DNS_MODE","alidns-doh");
  transport.mockResolvedValue(Response.json({...dnsBody("8.8.8.8"),Answer:[
    {name:"imap.example.com",type:5,data:"edge.example.com."},
    {name:"edge.example.com",type:1,data:"8.8.4.4"},
    {name:"unrelated.example.com",type:1,data:"1.1.1.1"}]}));
  expect(await publicMailAddresses("imap.example.com")).toEqual(["8.8.4.4"]);
});
