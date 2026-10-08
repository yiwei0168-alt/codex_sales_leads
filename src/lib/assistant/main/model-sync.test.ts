import { afterEach, expect, it, vi } from "vitest";
import { defaultModelConfig } from "./product";
import { requestModel, transportMessages } from "./model";
import type { ModelMessage } from "./contracts";

it("encodes malformed historical tool arguments without changing executable state or receipt pairing", () => {
  const messages: ModelMessage[] = [
    {role:"assistant",content:null,tool_calls:[{id:"bad",type:"function",function:{name:"execute_tool",arguments:'{"tool":broken'}}]},
    {role:"tool",tool_call_id:"bad",content:'{"status":"missing_input"}'},
  ];
  const snapshot=JSON.stringify(messages);
  const wire=transportMessages(messages);
  expect(JSON.parse(wire[0].tool_calls![0].function.arguments)._invalid_json_arguments).toBe('{"tool":broken');
  expect(wire[0].tool_calls![0].id).toBe(wire[1].tool_call_id);
  expect(wire[1]).toEqual(messages[1]);
  expect(JSON.stringify(messages)).toBe(snapshot);
});

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
