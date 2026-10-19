import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ searches: [] as string[], fetches: [] as Array<{ folder: string; uids: number[] }>, emptySourceUid:0,inboxUids:[1,2],sentUids:[3,4] }));
vi.mock("./connection-config", () => ({ publicMailAddresses: async () => ["127.0.0.1"] }));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    mailbox: { uidValidity: bigint } | null = null;
    folder = "";
    on() { return this; }
    async connect() { return this; }
    async list() { return [{ path: "INBOX" }, { path: "Sent", specialUse: "\\Sent" }]; }
    async getMailboxLock(folder: string) { this.folder = folder; this.mailbox = { uidValidity: BigInt(1) }; return { release() {} }; }
    async search() { mock.searches.push(this.folder); return this.folder === "INBOX" ? mock.inboxUids : mock.sentUids; }
    async *fetch(uids: number[]) {
      mock.fetches.push({ folder: this.folder, uids });
      for (const uid of uids) yield { uid, source: uid===mock.emptySourceUid?undefined:Buffer.from(`From: source@example.invalid\r\nTo: owner@example.invalid\r\nSubject: Synthetic ${uid}\r\n\r\nBody ${uid}`) };
    }
    async logout() { return; }
    close() { return; }
  },
}));

import { readAliMailMessages } from "./alimail-imap";

beforeEach(() => { mock.searches = []; mock.fetches = []; mock.emptySourceUid=0;mock.inboxUids=[1,2];mock.sentUids=[3,4]; });

it("discovers all selected folders after the page fetch cap is reached", async () => {
  const result = await readAliMailMessages({
    email: "owner@example.invalid", password: "synthetic", host: "imap.example.invalid",
    cursors: new Map(), since: new Date("2026-10-01T00:00:00Z"), maxMessages: 1,
  });
  expect(result.discovered).toBe(4);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].uid).toBe(1);
  expect(mock.searches).toEqual(["INBOX", "Sent"]);
  expect(mock.fetches).toEqual([{ folder: "INBOX", uids: [1] }]);
  expect(result.cursors).toHaveLength(2);
});

it('pages a fresh mailbox oldest-first and resumes without skipping later UIDs',async()=>{
 mock.inboxUids=[1,2,3,4];
 const common={email:'owner@example.invalid',password:'synthetic',host:'imap.example.invalid',since:new Date('2026-10-01T00:00:00Z'),maxMessages:2};
 const first=await readAliMailMessages({...common,cursors:new Map()});
 expect(first.messages.map(row=>row.uid)).toEqual([1,2]);
 const known=new Set(first.messages.map(row=>`${row.folderPath}:${row.uidValidity}:${row.uid}`));
 const second=await readAliMailMessages({...common,cursors:new Map(first.cursors.map(row=>[row.folderPath,row])),knownMessages:known});
 expect(second.messages.map(row=>row.uid)).toEqual([3,4]);
 expect(mock.fetches).toEqual([{folder:'INBOX',uids:[1,2]},{folder:'INBOX',uids:[3,4]}]);
});

it('fails the page without returning an advanced cursor when message source is missing',async()=>{
 mock.emptySourceUid=1;
 await expect(readAliMailMessages({email:'owner@example.invalid',password:'synthetic',host:'imap.example.invalid',
  cursors:new Map(),since:new Date('2026-10-01T00:00:00Z'),maxMessages:2})).rejects.toThrow('checkpoint was not advanced');
});
