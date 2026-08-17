import { afterEach, describe, expect, it, vi } from "vitest";
import { kimiApiBaseUrl, learnMailboxMessageWithKimi } from "./kimi";
import type { ImportedMailboxMessage } from "./alimail-imap";

const previousKey = process.env.KIMI_API_KEY;
const previousBaseUrl = process.env.KIMI_BASE_URL;

afterEach(() => {
  if (previousKey === undefined) delete process.env.KIMI_API_KEY;
  else process.env.KIMI_API_KEY = previousKey;
  if (previousBaseUrl === undefined) delete process.env.KIMI_BASE_URL;
  else process.env.KIMI_BASE_URL = previousBaseUrl;
});

const message: ImportedMailboxMessage = {
  folderPath: "INBOX", uidValidity: "1", uid: 1, direction: "inbound",
  sender: [{ address: "buyer@example.com" }], recipients: [{ address: "sales@example.cn" }],
  subject: "Distributor terms", bodyText: "Minimum order is 100 units.", contentSha256: "hash", metadata: {},
};

describe("learnMailboxMessageWithKimi", () => {
  it("parses and clamps structured Kimi artifacts", async () => {
    process.env.KIMI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "kimi-k3",
      choices: [{ message: { content: JSON.stringify({ analyses: [{
        messageIndex: 0, summary: "Terms discussed",
        artifacts: [{ kind: "customer-signal", title: "Distributor MOQ", content: "MOQ is 100 units.", confidence: 1.4, rationale: "Explicitly stated" }],
      }] }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await learnMailboxMessageWithKimi(message, fetchMock);

    expect(result.artifacts[0]).toMatchObject({ kind: "customer-signal", confidence: 1 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/chat/completions"), expect.objectContaining({ method: "POST" }));
  });

  it("ignores unknown artifact kinds", async () => {
    process.env.KIMI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"analyses":[{"messageIndex":0,"summary":"x","artifacts":[{"kind":"secret","title":"x","content":"y"}]}]}' } }],
    }), { status: 200 }));
    const result = await learnMailboxMessageWithKimi(message, fetchMock);
    expect(result.artifacts).toEqual([]);
  });

  it("rejects non-HTTPS and untrusted Kimi API hosts", () => {
    process.env.KIMI_BASE_URL = "http://api.moonshot.cn/v1";
    expect(() => kimiApiBaseUrl()).toThrow("HTTPS");
    process.env.KIMI_BASE_URL = "https://attacker.example/v1";
    expect(() => kimiApiBaseUrl()).toThrow("受信任");
  });
});
