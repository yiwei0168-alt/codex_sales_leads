import { afterEach, describe, expect, it } from "vitest";
import { assertBgeServiceReady, bgeServiceBaseUrl, embedTextsWithBge } from "./bge-client";

afterEach(() => { delete process.env.BGE_M3_SERVICE_URL; });

describe("BGE-M3 loopback client", () => {
  it("requires the pinned live model at the health endpoint", async () => {
    const ready = { status: "ready", model: "BAAI/bge-m3",
      revision: "5617a9f61b028005a4858fdac845db406aefb181", dimensions: 1024 };
    const transport = async (url: string | URL | Request) => {
      expect(String(url)).toBe("http://127.0.0.1:8765/health");
      return new Response(JSON.stringify(ready), { status: 200 });
    };
    await expect(assertBgeServiceReady(transport as typeof fetch)).resolves.toBeUndefined();
    await expect(assertBgeServiceReady(async () => new Response(JSON.stringify({
      ...ready, revision: "other" }), { status: 200 })))
      .rejects.toThrow("evaluation baseline unavailable or incompatible");
    await expect(assertBgeServiceReady(async () => new Response("", { status: 503 })))
      .rejects.toThrow("health HTTP 503");
  });
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
