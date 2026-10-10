import { afterEach, describe, expect, it, vi } from "vitest";
import { kimiApiBaseUrl, learnMailboxMessageWithKimi } from "./kimi";
import type { ImportedMailboxMessage } from "./alimail-imap";

const previousKey = process.env.OPENROUTER_API_KEY;
const previousBaseUrl = process.env.OPENROUTER_BASE_URL;

afterEach(() => {
  vi.unstubAllEnvs();
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousKey;
  if (previousBaseUrl === undefined) delete process.env.OPENROUTER_BASE_URL;
  else process.env.OPENROUTER_BASE_URL = previousBaseUrl;
});

const message: ImportedMailboxMessage = {
  folderPath: "INBOX", uidValidity: "1", uid: 1, direction: "inbound",
  sender: [{ address: "buyer@example.com" }], recipients: [{ address: "sales@example.cn" }],
  subject: "Distributor terms", bodyText: "Minimum order is 100 units.", contentSha256: "hash", metadata: {},
};

describe("learnMailboxMessageWithKimi", () => {
  it("parses and clamps structured Kimi artifacts", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
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
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toMatchObject({ model: "moonshotai/kimi-k3",
      max_completion_tokens: 8000,
      provider: { require_parameters: true, data_collection: "deny", allow_fallbacks: false } });
  });

  it("ignores unknown artifact kinds", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"analyses":[{"messageIndex":0,"summary":"x","artifacts":[{"kind":"secret","title":"x","content":"y"}]}]}' } }],
    }), { status: 200 }));
    const result = await learnMailboxMessageWithKimi(message, fetchMock);
    expect(result.artifacts).toEqual([]);
  });

  it("rejects non-HTTPS and untrusted Kimi API hosts", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = "http://api.moonshot.cn/v1";
    expect(() => kimiApiBaseUrl()).toThrow("HTTPS");
    process.env.OPENROUTER_BASE_URL = "https://attacker.example/v1";
    expect(() => kimiApiBaseUrl()).toThrow("HTTPS");
  });

  it("does not use the legacy key when the gateway key is missing", async () => {
    vi.stubEnv("KIMI_API_KEY", "legacy-secret");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = vi.fn();
    await expect(learnMailboxMessageWithKimi(message, fetchMock)).rejects.toThrow("OPENROUTER_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose upstream errors containing message content", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response('private message echoed by provider', { status: 401 }));
    await expect(learnMailboxMessageWithKimi(message, fetchMock)).rejects.toThrow(/^OpenRouter Kimi HTTP 401$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
