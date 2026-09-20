import { describe, expect, it } from "vitest";
import { digest, messageInputSchema } from "./contracts";
import { availableTools, describeTool, productTools } from "./tools";
import { productPrompt } from "./product";
describe("main Agent contracts", () => {
  it("binds canonical inputs while detecting content changes", () => {
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
    expect(digest({ body: "approved" })).not.toBe(digest({ body: "changed" }));
  });
  it("rejects forged identity and arbitrary attachment paths", () => {
    expect(messageInputSchema.safeParse({ content: "hello", requestKey: "unique-key", userId: "someone" }).success).toBe(false);
    expect(messageInputSchema.safeParse({ content: "hello", requestKey: "unique-key", attachments: [{ path: "C:/secrets" }] }).success).toBe(false);
  });
  it("generates full schemas only for implemented registered tools", () => {
    expect(new Set(productTools.map(t => t.id)).size).toBe(productTools.length);
    for (const tool of availableTools({ role: "member" })) {
      expect(typeof tool.execute).toBe("function");
      expect(describeTool(tool).inputSchema).toHaveProperty("additionalProperties", false);
      expect(productPrompt(productTools)).toContain(tool.id);
    }
  });
});
