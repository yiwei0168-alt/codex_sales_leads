import { afterEach, expect, it, vi } from "vitest";
import { defaultModelConfig } from "./product";
import { requestModel } from "./model";

afterEach(() => vi.unstubAllEnvs());

it("sends the default GLM 5.3 route to synchronous chat completions with tool calling", async () => {
  vi.stubEnv("MAIN_AGENT_MODEL", "");
  vi.stubEnv("MAIN_AGENT_PROVIDERS", "");
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-test-key");
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("z-ai/glm-5.3");
    expect(body.provider).toMatchObject({ only: ["fireworks"], allow_fallbacks: false, data_collection: "deny" });
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toContain("execute_tool");
    expect(body).not.toHaveProperty("completion_window");
    expect(body).not.toHaveProperty("parallel_tool_calls");
    expect(body.max_tokens).toBe(16_384);
    expect(body).not.toHaveProperty("max_completion_tokens");
    return Response.json({ choices: [{ message: { role: "assistant", content: "Synthetic answer" }, finish_reason: "stop" }] });
  });
  const response = await requestModel([{ role: "user", content: "Synthetic question" }], defaultModelConfig(), transport as typeof fetch);
  expect(response.message.content).toBe("Synthetic answer");
  expect(transport).toHaveBeenCalledTimes(1);
});
