import { afterEach, describe, expect, it } from "vitest";
import { bgeServiceBaseUrl, embedTextsWithBge } from "./bge-client";

afterEach(() => { delete process.env.BGE_M3_SERVICE_URL; });

describe("BGE-M3 loopback client", () => {
  it("refuses non-loopback and credential-bearing endpoints", () => {
    process.env.BGE_M3_SERVICE_URL = "https://example.com";
    expect(() => bgeServiceBaseUrl()).toThrow(/loopback-only/);
    process.env.BGE_M3_SERVICE_URL = "http://user:pass@127.0.0.1:8765";
    expect(() => bgeServiceBaseUrl()).toThrow(/loopback-only/);
  });

  it("accepts only the pinned 1024-dimensional response", async () => {
    const vector = Array.from({ length: 1024 }, () => 0.01);
    const transport = async () => new Response(JSON.stringify({
      revision: "5617a9f61b028005a4858fdac845db406aefb181", dimensions: 1024, embeddings: [vector],
    }), { status: 200 });
    await expect(embedTextsWithBge(["query"], transport as typeof fetch)).resolves.toEqual([vector]);
  });
});
