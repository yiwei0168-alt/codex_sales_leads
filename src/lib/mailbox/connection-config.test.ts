import { beforeEach, expect, it, vi } from "vitest";

const lookup=vi.hoisted(()=>vi.fn());
vi.mock("node:dns/promises",()=>({lookup}));
import { mailboxConnectionSchema, publicMailAddresses } from "./connection-config";

const base={email:"sales@example.com",displayName:"欧洲销售",accessMode:"read-only" as const,
  securityPassword:"example-app-password",imapHost:"imap.example.com",imapPort:993,smtpPort:465};
beforeEach(()=>lookup.mockReset().mockResolvedValue([{address:"8.8.8.8",family:4}]));

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
