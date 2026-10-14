import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ searches: [] as string[], fetches: [] as Array<{ folder: string; uids: number[] }> }));
vi.mock("./connection-config", () => ({ publicMailAddresses: async () => ["127.0.0.1"] }));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    mailbox: { uidValidity: bigint } | null = null;
    folder = "";
    on() { return this; }
    async connect() { return this; }
    async list() { return [{ path: "INBOX" }, { path: "Sent", specialUse: "\\Sent" }]; }
    async getMailboxLock(folder: string) { this.folder = folder; this.mailbox = { uidValidity: BigInt(1) }; return { release() {} }; }
    async search() { mock.searches.push(this.folder); return this.folder === "INBOX" ? [1, 2] : [3, 4]; }
    async *fetch(uids: number[]) {
      mock.fetches.push({ folder: this.folder, uids });
      for (const uid of uids) yield { uid, source: Buffer.from(`From: source@example.invalid\r\nTo: owner@example.invalid\r\nSubject: Synthetic ${uid}\r\n\r\nBody ${uid}`) };
    }
    async logout() { return; }
    close() { return; }
  },
}));

import { readAliMailMessages } from "./alimail-imap";

beforeEach(() => { mock.searches = []; mock.fetches = []; });

it("discovers all selected folders after the page fetch cap is reached", async () => {
  const result = await readAliMailMessages({
    email: "owner@example.invalid", password: "synthetic", host: "imap.example.invalid",
    cursors: new Map(), since: new Date("2026-10-01T00:00:00Z"), maxMessages: 1,
  });
  expect(result.discovered).toBe(4);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].uid).toBe(2);
  expect(mock.searches).toEqual(["INBOX", "Sent"]);
  expect(mock.fetches).toEqual([{ folder: "INBOX", uids: [2] }]);
  expect(result.cursors).toHaveLength(2);
});
