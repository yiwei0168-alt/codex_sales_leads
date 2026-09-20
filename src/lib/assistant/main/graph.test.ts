import { describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import { buildMainAgentGraph } from "./graph";
import { result, type ModelMessage, type ModelToolCall } from "./contracts";

const call = (id: string, tool: string): ModelToolCall => ({ id, type: "function", function: { name: "execute_tool", arguments: JSON.stringify({ tool, arguments: {} }) } });
const initial = () => ({ messages: [{ role: "user" as const, content: "先查现有资料，再对照保存的公司决定，指出差异" }], pending: [], steps: 0, status: "running" as const, reply: "", seen: {}, instructionIds: [] });
describe("open main Agent graph", () => {
  it("composes tools in the model-selected order without intent labels", async () => {
    const tool = vi.fn(async () => result({ evidence: "saved" }));
    const replies: ModelMessage[] = [
      { role: "assistant", content: null, tool_calls: [call("one", "knowledge_search")] },
      { role: "assistant", content: null, tool_calls: [call("two", "memory_list")] },
      { role: "assistant", content: "Comparison with sources" },
    ];
    const model = vi.fn(async () => replies.shift()!);
    const graph = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }), model, tool });
    const out = await graph.invoke(initial());
    expect(out.status).toBe("completed"); expect(tool.mock.calls).toHaveLength(2);
    expect(model.mock.calls).toHaveLength(3); expect(out.messages.filter(m => m.role === "tool")).toHaveLength(2);
  });
  it("persists a pause before a tool and resumes pending work exactly once", async () => {
    const saver = new MemorySaver(); let pause = false;
    const tool = vi.fn(async () => result("persisted result"));
    const model = vi.fn(async (): Promise<ModelMessage> => {
      if (!pause) { pause = true; return { role: "assistant", content: null, tool_calls: [call("one", "company_read")] }; }
      return { role: "assistant", content: "done" };
    });
    const graph = buildMainAgentGraph({ boundary: async () => ({ control: pause ? "pause" : null, instructions: [] }), model, tool }, saver);
    const config = { configurable: { thread_id: "account:run" } };
    const stopped = await graph.invoke(initial(), config);
    expect(stopped.status).toBe("paused"); expect(tool).not.toHaveBeenCalled();
    const resumed = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }), model, tool }, saver);
    const out = await resumed.invoke({ ...stopped, status: "running" }, config);
    expect(out.status).toBe("completed"); expect(tool).toHaveBeenCalledOnce();
  });
  it("delivers partial state on provider failure instead of disqualifying a company", async () => {
    const graph = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }), model: async () => { throw new Error("provider"); }, tool: async () => result(null) });
    const out = await graph.invoke(initial()); expect(out.status).toBe("partial"); expect(out.messages).toHaveLength(1);
  });
  it("halts repeated unchanged calls and preserves already valid outputs", async () => {
    let calls = 0;
    const graph = buildMainAgentGraph({ boundary: async () => ({ control: null, instructions: [] }),
      model: async () => ({ role: "assistant", content: null, tool_calls: [call(String(++calls), "same_tool")] }), tool: async () => result("evidence") });
    const out = await graph.invoke(initial()); expect(out.status).toBe("partial"); expect(out.messages.filter(m => m.role === "tool")).toHaveLength(2);
  });
  it("applies cancellation before a model or side effect", async () => {
    const model = vi.fn(); const tool = vi.fn();
    const graph = buildMainAgentGraph({ boundary: async () => ({ control: "cancel", instructions: [] }), model, tool });
    expect((await graph.invoke(initial())).status).toBe("cancelled"); expect(model).not.toHaveBeenCalled(); expect(tool).not.toHaveBeenCalled();
  });
});
