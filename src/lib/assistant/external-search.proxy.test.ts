import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ fetch: vi.fn(), close: vi.fn() }));

vi.mock("undici", () => ({
  fetch: mocked.fetch,
  ProxyAgent: class {
    close() { return mocked.close(); }
  },
}));

import { searchExternalWithGemini } from "./external-search";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
  vi.stubEnv("GEMINI_PROXY_URL", "http://127.0.0.1:7892");
  mocked.fetch.mockResolvedValue(Response.json({ steps: [
    { type: "google_search_call", arguments: { queries: ["public test"] } },
    { type: "model_output", content: [{ type: "text", text: "Answer", annotations: [
      { type: "url_citation", url: "https://example.com/" },
    ] }] },
  ] }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Gemini local proxy", () => {
  it("sends Gemini traffic through the configured proxy and closes it", async () => {
    await searchExternalWithGemini(["public test"]);
    expect(mocked.fetch).toHaveBeenCalledOnce();
    expect(mocked.fetch.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(mocked.fetch.mock.calls[0][1].dispatcher).toBeDefined();
    expect(mocked.close).toHaveBeenCalledOnce();
  });

  it("rejects a non-local proxy before sending the request", async () => {
    vi.stubEnv("GEMINI_PROXY_URL", "http://example.com:7892");
    await expect(searchExternalWithGemini(["public test"])).rejects.toThrow("local HTTP proxy");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });

  it("does not fall back to direct Gemini traffic when the proxy is missing", async () => {
    vi.stubEnv("GEMINI_PROXY_URL", "");
    await expect(searchExternalWithGemini(["public test"])).rejects.toThrow("GEMINI_PROXY_URL is required");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
});
