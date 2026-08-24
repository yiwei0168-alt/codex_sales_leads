import { afterEach, describe, expect, it, vi } from "vitest";

import { searchExternalWithGemini } from "./external-search";

afterEach(() => vi.unstubAllEnvs());

describe("Gemini grounded web search", () => {
  it("requires an observed search call and extracts URL citations", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "gemini-3.6-flash",
      steps: [
        { type: "google_search_call", arguments: { queries: ["Wi-Fi 7 market 2026"] } },
        { type: "model_output", content: [{ type: "text", text: "Market evidence", annotations: [{ type: "url_citation", url: "https://www.wi-fi.org/", title: "Wi-Fi Alliance" }] }] },
      ],
    }), { status: 200 }));
    const result = await searchExternalWithGemini(["current Wi-Fi 7 market"], fetchMock);
    expect(result.searchQueries).toEqual(["Wi-Fi 7 market 2026"]);
    expect(result.citations[0]).toMatchObject({ title: "Wi-Fi Alliance" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.tools).toEqual([{ type: "google_search" }]);
  });

  it("rejects ungrounded model output", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "text", text: "Unsupported answer" }] }],
    }), { status: 200 }));
    await expect(searchExternalWithGemini(["current market"], fetchMock)).rejects.toThrow("未实际调用 Google Search");
  });
});
