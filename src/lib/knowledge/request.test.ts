import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tenantQuery: vi.fn() }));
vi.mock("@/lib/rag/db", () => ({ tenantQuery: mocks.tenantQuery }));

import { parseKnowledgeRequest } from "./request";

describe("knowledge request parsing", () => {
  beforeEach(() => {
    mocks.tenantQuery.mockReset().mockResolvedValue([{ key: "MODEL-A" }, { key: "MODEL-A-PRO" }]);
  });

  it("routes a generic source-document request without model-specific rules", async () => {
    const result = await parseKnowledgeRequest("user", {
      question: "请打开 MODEL-A-PRO 的 datasheet",
      entry: "knowledge-page",
    });
    expect(result).toMatchObject({ action: "open-document", entityKeys: ["MODEL-A-PRO"], documentKind: "datasheet" });
  });

  it("routes a registered attribute question to verified facts", async () => {
    const result = await parseKnowledgeRequest("user", {
      question: "MODEL-A 有几个网口？",
      entry: "assistant",
    });
    expect(result.action).toBe("fact-query");
    expect(result.entityKeys).toEqual(["MODEL-A"]);
    expect(result.attributeKeys).toContain("ethernet_port_count");
  });

  it("inherits one unambiguous recent entity but refuses ambiguous history", async () => {
    const inherited = await parseKnowledgeRequest("user", {
      question: "那它有几个网口？",
      history: [{ role: "user", content: "先看 MODEL-A" }],
      entry: "assistant",
    });
    expect(inherited.entityKeys).toEqual(["MODEL-A"]);

    const ambiguous = await parseKnowledgeRequest("user", {
      question: "那它有几个网口？",
      history: [{ role: "user", content: "比较 MODEL-A 与 MODEL-A-PRO" }],
      entry: "assistant",
    });
    expect(ambiguous.entityKeys).toEqual([]);
  });
});
