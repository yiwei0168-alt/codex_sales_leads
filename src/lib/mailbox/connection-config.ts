import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { z } from "zod";

export const ALIMAIL_IMAP_HOST = "imap.qiye.aliyun.com";
export const ALIMAIL_SMTP_HOST = "smtp.qiye.aliyun.com";

const hostname = z.string().trim().toLowerCase().min(4).max(253).regex(/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/)
  .refine(value => value.includes(".") && !value.includes("..") && !isIP(value), "请输入公网邮件服务器域名");
export const mailboxConnectionSchema = z.object({
  email: z.email().max(320),
  displayName: z.string().trim().min(1).max(80),
  accessMode: z.enum(["read-only", "send-enabled"]),
  securityPassword: z.string().min(6).max(1024),
  imapHost: hostname,
  imapPort: z.number().int().min(1).max(65535).default(993),
  smtpHost: hostname.optional(),
  smtpPort: z.union([z.literal(465),z.literal(587)]).default(465),
  smtpPassword: z.string().min(6).max(1024).optional(),
}).strict().superRefine((value, context) => {
  if (value.accessMode === "send-enabled" && !value.smtpHost) context.addIssue({ code: "custom", path: ["smtpHost"], message: "可发信邮箱需要 SMTP 服务器" });
});
export type MailboxConnectionInput = z.infer<typeof mailboxConnectionSchema>;

const blocked = new BlockList();
for (const [network, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(network,prefix);
for (const [network,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32]] as const) blocked.addSubnet(network,prefix,"ipv6");

/** Resolve before connecting so user-supplied hosts cannot redirect IMAP/SMTP to local services. */
export async function publicMailAddresses(host: string): Promise<string[]> {
  if (!hostname.safeParse(host).success) throw new Error("邮件服务器必须是公网域名");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({address,family}) => blocked.check(address,family === 6 ? "ipv6" : "ipv4") || address.startsWith("::ffff:"))) {
    throw new Error("邮件服务器解析到了非公网地址");
  }
  return [...new Set(addresses.map(item => item.address))].slice(0,4);
}
