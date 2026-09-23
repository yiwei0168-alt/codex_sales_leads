import { beforeEach,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({connection:vi.fn(),query:vi.fn(),verify:vi.fn(),close:vi.fn(),transport:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query}));
vi.mock("./repository",()=>({getMailboxConnection:mocks.connection,smtpConnectionPassword:()=>"test-app-password"}));
vi.mock("./smtp-transport",()=>({createSmtpTransport:mocks.transport}));
vi.mock("./alimail-imap",()=>({verifyAliMailCredentials:vi.fn(),readAliMailMessages:vi.fn()}));
import { verifyMailboxSendCapability } from "./service";

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue({id:"mailbox",email:"sales@example.com",status:"active",accessMode:"read-only",smtpHost:"smtp.example.com",smtpPort:465,smtpVerifiedAt:"2026-09-01"});
  mocks.transport.mockReturnValue({verify:mocks.verify,close:mocks.close});
  mocks.verify.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
});

it("re-verifies SMTP before a read-only mailbox can be enabled for sending",async()=>{
  await verifyMailboxSendCapability("user","mailbox");
  expect(mocks.verify).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.query.mock.calls[0][1]).toContain("smtp_verified_at=now()");
});

it("does not preserve a send grant when SMTP verification fails",async()=>{
  mocks.verify.mockRejectedValue(new Error("invalid login"));
  await expect(verifyMailboxSendCapability("user","mailbox")).rejects.toThrow("invalid login");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("requires an SMTP host instead of inferring one for a custom mailbox",async()=>{
  mocks.connection.mockResolvedValue({email:"sales@example.com",status:"active",accessMode:"read-only",smtpHost:null});
  await expect(verifyMailboxSendCapability("user","mailbox")).rejects.toThrow("没有 SMTP 配置");
  expect(mocks.transport).not.toHaveBeenCalled();
});
