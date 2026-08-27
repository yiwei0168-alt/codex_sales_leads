import { describe, expect, it, vi } from "vitest";

import { PublicPageFetcher } from "./public-page-fetcher";

describe("public official page fetcher", () => {
  it("extracts readable text and absolute links", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      "<html><body><h1>Example GmbH</h1><p>Networking products &amp; services.</p><a href='/services'>Services</a><script>secret()</script></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    const page = await new PublicPageFetcher(fetchMock).fetch("https://example.de/");
    expect(page.text).toContain("Networking products & services.");
    expect(page.text).not.toContain("secret");
    expect(page.links).toContain("https://example.de/services");
  });

  it("validates every redirect target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: "http://127.0.0.1/private" },
    }));
    await expect(new PublicPageFetcher(fetchMock).fetch("https://example.de/"))
      .rejects.toThrow("Blocked non-public page target");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
