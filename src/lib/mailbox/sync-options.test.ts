import { expect,it } from "vitest";
import { DEFAULT_MAILBOX_LOOKBACK_DAYS, MAX_MAILBOX_MESSAGES_PER_SYNC, mailboxSyncSchema,mailboxRange } from "./sync-options";
const connectionId="11111111-1111-4111-8111-111111111111";
it("rejects invalid dates, reversed ranges and unbounded counts",()=>{
  for(const extra of [{from:"2026-02-30"},{through:"2026-01-01"},{from:"2026-02-01",through:"2026-01-01"},{maxMessages:101},{lookbackDays:181},{folderScope:"all"}])expect(mailboxSyncSchema.safeParse({connectionId,...extra}).success).toBe(false);
});
it("defaults to the latest 180 days and caps each sync at 100 messages",()=>{
  const now=Date.parse("2026-09-23T00:00:00.000Z");
  expect(DEFAULT_MAILBOX_LOOKBACK_DAYS).toBe(180);
  expect(MAX_MAILBOX_MESSAGES_PER_SYNC).toBe(100);
  expect(mailboxRange({},now).since.toISOString()).toBe("2026-03-27T00:00:00.000Z");
  expect(mailboxSyncSchema.safeParse({connectionId,lookbackDays:180,maxMessages:100}).success).toBe(true);
});
it("includes the whole last day using an exclusive IMAP boundary",()=>{
  expect(mailboxRange({from:"2026-02-01",through:"2026-02-28"}).before?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
});
