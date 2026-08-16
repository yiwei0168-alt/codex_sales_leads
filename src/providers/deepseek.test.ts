import { describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "./deepseek";

describe("DeepSeekProvider", () => {
  it("requests JSON output and returns usage metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "request-1",
      model: "deepseek-v4-flash",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ result: "ok" }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImplementation, maxAttempts: 1 });

    const response = await provider.execute<{ value: number }, { result: string }>({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: { value: 1 },
      evidenceIds: ["ev-1"],
    });

    expect(response.output).toEqual({ result: "ok" });
    expect(response.usage?.totalTokens).toBe(14);
    const request = JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body)) as { response_format: { type: string }; thinking: { type: string } };
    expect(request.response_format.type).toBe("json_object");
    expect(request.thinking.type).toBe("disabled");
  });

  it("rejects empty model content instead of accepting an unknown output", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImplementation, maxAttempts: 1 });

    await expect(provider.execute({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: {},
      evidenceIds: [],
    })).rejects.toThrow("Provider deepseek is unavailable");
  });

  it("does not retry an authentication or request-format failure", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Authentication failed" },
    }), { status: 401, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "bad-key", fetchImplementation, maxAttempts: 3 });

    await expect(provider.execute({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: {},
      evidenceIds: [],
    })).rejects.toThrow("Provider deepseek is unavailable");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
