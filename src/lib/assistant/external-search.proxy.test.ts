import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("undici", () => ({ fetch: mocked.fetch, ProxyAgent: class {} }));
import { searchExternalWithGemini } from "./external-search";
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
  vi.stubEnv("GEMINI_SEARCH_MODEL", "gemini-3.6-flash");
  vi.stubEnv("MODEL_PROXY_URL", "http://127.0.0.1:7892");
  vi.stubEnv("GEMINI_PROXY_URL", "");
  mocked.fetch.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "Answer", annotations: [
    { type: "url_citation", url_citation: { url: "https://example.com/" } },
  ] } }] }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Gemini gateway explicit local proxy", () => {
  it("uses the common model proxy without a Google direct connection", async () => {
    await searchExternalWithGemini(["public test"]);
    expect(mocked.fetch).toHaveBeenCalledOnce();
    expect(mocked.fetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(mocked.fetch.mock.calls[0][1].dispatcher).toBeDefined();
  });
  it("rejects a non-local proxy before sending", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "http://example.com:7892");
    await expect(searchExternalWithGemini(["public test"])).rejects.toThrow("local HTTP proxy");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
  it("does not silently use direct transport if the proxy is missing", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "");
    await expect(searchExternalWithGemini(["public test"])).rejects.toThrow("MODEL_PROXY_URL is required");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
});
