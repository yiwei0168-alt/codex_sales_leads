import { describe, expect, it } from "vitest";
import { digest, messageInputSchema } from "./contracts";
import { availableTools, describeTool, productTools } from "./tools";
import { productPrompt } from "./product";
import {needsApproval} from "./approvals";
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
  it("keeps shared fact-review decisions behind administrator discovery and exact approval", () => {
    const member=availableTools({role:"member"}).map(tool=>tool.id);
    const admin=availableTools({role:"admin"});
    expect(member).not.toContain("knowledge_fact_review_list");
    expect(member).not.toContain("knowledge_fact_review_decide");
    const decision=admin.find(tool=>tool.id==="knowledge_fact_review_decide");
    expect(decision).toBeDefined();
    expect(needsApproval(decision!)).toBe(true);
    expect(decision!.input.safeParse({reviewId:"11111111-1111-4111-8111-111111111111",decision:"correct"}).success).toBe(false);
    expect(decision!.input.safeParse({reviewId:"11111111-1111-4111-8111-111111111111",decision:"verify",userId:"forged"}).success).toBe(false);
    expect(decision!.input.safeParse({reviewId:"11111111-1111-4111-8111-111111111111",decision:"correct",correctedValue:8,correctedRawValue:"8 ports"}).success).toBe(true);
    expect(describeTool(decision!).inputSchema).toHaveProperty("additionalProperties",false);
  });
});
