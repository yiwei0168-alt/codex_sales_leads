import { expect, it, vi } from "vitest";
vi.mock("./tools", () => ({ productTools: [], availableTools: () => [], describeTool: vi.fn() }));
vi.mock("./tool-execution", () => ({ executeRegisteredTool: vi.fn() }));
import { dispatchTool } from "./executor";
import { executeRegisteredTool } from "./tool-execution";
import type { ExecutionContext } from "./contracts";
it("rejects persisted retired calls without execution or a success receipt", async () => {
  const context = { userId: "fixture", role: "member" } as ExecutionContext;
  const output = await dispatchTool({ id: "old-call", type: "function", function: {
    name: "execute_tool", arguments: JSON.stringify({ tool: "workspace_mode_update", arguments: { mode: "growth" } }),
  } }, context);
  expect(output.status).toBe("unavailable");
  expect(output.data).toEqual({ code: "capability_removed" });
  expect(output.missing.join(" ")).toContain("此历史调用未执行");
  expect(executeRegisteredTool).not.toHaveBeenCalled();
});
