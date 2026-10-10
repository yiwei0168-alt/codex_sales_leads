import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchExternalWithGemini } from "./external-search";
import { parseGeminiGroundedCompletion } from "@/providers/gemini-openrouter";

const source = { type: "url_citation", url_citation: { url: "https://example.com/", title: "Official" } };
const completion = (finish_reason = "stop", annotations: unknown[] = [source]) => ({
  model: "google/gemini-3.6-flash", choices: [{ finish_reason, message: { content: "Public evidence", annotations } }],
});
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "gateway-test");
  vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
  vi.stubEnv("GEMINI_SEARCH_MODEL", "gemini-3.6-flash");
  vi.stubEnv("GEMINI_API_KEY", "legacy-must-not-send");
});
afterEach(() => vi.unstubAllEnvs());

describe("Gemini gateway public search", () => {
  it("uses native search only, shared gateway credentials and honest query provenance", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json(completion()));
    const result = await searchExternalWithGemini(["public question"], transport);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer gateway-test");
    expect(init.headers["x-goog-api-key"]).toBeUndefined();
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toMatchObject({ model: "google/gemini-3.6-flash", plugins: [{ id: "web", engine: "native" }],
      provider: { require_parameters: true, data_collection: "deny", allow_fallbacks: false }, max_tokens: 12000 });
    expect(result).toMatchObject({ citations: [{ url: "https://example.com/", title: "Official" }], searchQueries: [],
      searchQueryStatus: "not-provided", groundingSource: "openrouter-url-annotations" });
  });
  it.each(["length", "content_filter", "tool_calls"])("rejects %s output without replay", async (finish) => {
    const transport = vi.fn().mockResolvedValue(Response.json(completion(finish)));
    await expect(searchExternalWithGemini(["question"], transport)).rejects.toThrow("未完成");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("does not trust links in generated text without annotation receipts", () => {
    expect(() => parseGeminiGroundedCompletion(completion("stop", []), "google/gemini-3.6-flash")).toThrow("缺少网页引用");
  });
  it("rejects unsafe/malformed annotations and deduplicates valid URLs", () => {
    const result = parseGeminiGroundedCompletion(completion("stop", [null, source, source,
      { type: "url_citation", url_citation: { url: "https://user:pass@example.net/" } },
      { type: "url_citation", url_citation: { url: "file:///private" } }]), "google/gemini-3.6-flash");
    expect(result.citations).toHaveLength(1);
  });
  it("redacts HTTP error bodies and does not retry non-transient failures", async () => {
    const transport = vi.fn().mockResolvedValue(new Response("secret error body", { status: 400 }));
    await expect(searchExternalWithGemini(["question"], transport)).rejects.toThrow(/^Gemini gateway HTTP 400$/);
    expect(transport).toHaveBeenCalledOnce();
  });
  it("does not fall back to legacy credentials", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const transport = vi.fn();
    await expect(searchExternalWithGemini(["question"], transport)).rejects.toThrow("OPENROUTER_API_KEY");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["https://other.example/api/v1", "https://user:pass@openrouter.ai/api/v1"])("rejects untrusted gateway %s", async (base) => {
    vi.stubEnv("OPENROUTER_BASE_URL", base);
    const transport = vi.fn();
    await expect(searchExternalWithGemini(["question"], transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects a different model family before sending", async () => {
    vi.stubEnv("GEMINI_SEARCH_MODEL", "openai/something");
    const transport = vi.fn();
    await expect(searchExternalWithGemini(["question"], transport)).rejects.toThrow("Invalid Gemini");
    expect(transport).not.toHaveBeenCalled();
  });
});
