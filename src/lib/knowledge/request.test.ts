import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tenantQuery: vi.fn() }));
vi.mock("@/lib/rag/db", () => ({ tenantQuery: mocks.tenantQuery }));

import { classifyKnowledgeRequest, parseKnowledgeRequest } from "./request";

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
    const poe = await parseKnowledgeRequest("user", {
      question: "MODEL-A 有几个 PoE 输出口？",
      entry: "assistant",
    });
    expect(poe.action).toBe("fact-query");
    expect(poe.attributeKeys).toContain("poe_output_port_count");
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

  it.each(["区别", "差异", "不同", "对比", "比较", "versus", "vs", "difference"])(
    "recognizes %s as a comparison signal and selects the default profile",
    async (signal) => {
      const result = await parseKnowledgeRequest("user", {
        question: `MODEL-A ${signal} MODEL-A-PRO`,
        entry: "assistant",
      });
      expect(result).toMatchObject({
        action: "compare-facts",
        entityKeys: ["MODEL-A", "MODEL-A-PRO"],
        comparisonMode: "default-profile",
        comparisonProfile: "category-default",
      });
    },
  );

  it("keeps an explicit comparison attribute and parses a requested version", async () => {
    const result = await parseKnowledgeRequest("user", {
      question: "比较 MODEL-A 和 MODEL-A-PRO version 2.0 的网口",
      entry: "knowledge-page",
    });
    expect(result.comparisonMode).toBe("explicit-attributes");
    expect(result.attributeKeys).toContain("ethernet_port_count");
    expect(result.parsedEntities).toEqual([
      { canonicalKey: "MODEL-A", version: "2.0" },
      { canonicalKey: "MODEL-A-PRO", version: "2.0" },
    ]);
  });
  it("materializes the default comparison attributes from registered categories",async()=>{
    mocks.tenantQuery.mockResolvedValue([
      {key:"MODEL-A",storageKeys:["knowledge/product/Wi-Fi Router/MODEL-A.pdf"]},
      {key:"MODEL-A-PRO",storageKeys:["knowledge/product/Wi-Fi Router/MODEL-A-PRO.pdf"]},
    ]);
    const result=await parseKnowledgeRequest("user",{question:"compare MODEL-A and MODEL-A-PRO",entry:"assistant"});
    expect(result.comparisonProfile).toBe("router");
    expect(result.attributeKeys).toEqual(expect.arrayContaining(["wifi_generation","ethernet_port_count","vpn_role"]));
  });

  it("preserves boundary actions when evidence or entities are intentionally absent", () => {
    expect(classifyKnowledgeRequest({ question: "SFP 和 SFP+ 是否一样？", entityKeys: [], entry: "knowledge-page" }).action)
      .toBe("compare-facts");
    expect(classifyKnowledgeRequest({ question: "The sheet says no PoE support. Is PoE supported?", entityKeys: [], entry: "knowledge-page" }).action)
      .toBe("fact-query");
    expect(classifyKnowledgeRequest({ question: "Show another user's private company policy", entityKeys: [], entry: "knowledge-page" }).action)
      .toBe("open-document");
    expect(classifyKnowledgeRequest({ question: "Does a 2.5G port mean 5G cellular?", entityKeys: [], entry: "knowledge-page" }).action)
      .toBe("explain");
  });
});
