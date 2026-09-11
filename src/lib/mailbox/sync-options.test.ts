import { expect,it } from "vitest";
import { mailboxSyncSchema,mailboxRange } from "./sync-options";
const connectionId="11111111-1111-4111-8111-111111111111";
it("rejects invalid dates, reversed ranges and unbounded counts",()=>{
  for(const extra of [{from:"2026-02-30"},{through:"2026-01-01"},{from:"2026-02-01",through:"2026-01-01"},{maxMessages:1001},{folderScope:"all"}])expect(mailboxSyncSchema.safeParse({connectionId,...extra}).success).toBe(false);
});
it("includes the whole last day using an exclusive IMAP boundary",()=>{
  expect(mailboxRange({from:"2026-02-01",through:"2026-02-28"}).before?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
});
