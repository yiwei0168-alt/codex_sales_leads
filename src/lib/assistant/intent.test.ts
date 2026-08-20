import { describe, expect, it } from "vitest";
import { interpretAssistantRequest, resolveCountry } from "./intent";

describe("assistant intent routing", () => {
  it("keeps product questions inside the knowledge workflow", () => {
    expect(interpretAssistantRequest("WR3000 支持哪些无线协议？").intent).toBe("knowledge-question");
  });

  it("recognizes a global lead search and creates a bounded plan", () => {
    const result = interpretAssistantRequest("搜索阿联酋 20 家分销商和系统集成商");
    expect(result.intent).toBe("lead-search");
    expect(result.plan).toMatchObject({ countryCode: "AE", targetCount: 20 });
    expect(result.plan?.roles).toEqual(["Distributor", "SI"]);
  });

  it("supports country names outside the original pilot market", () => {
    expect(resolveCountry("Find networking resellers in Brazil")).toMatchObject({ countryCode: "BR" });
    expect(resolveCountry("搜索德国的渠道伙伴")).toMatchObject({ countryCode: "DE" });
  });

  it("does not mistake years or product generations for a requested lead count", () => {
    const result = interpretAssistantRequest("搜索德国渠道。公司成立于2018年，产品包括4G和5G路由器。");
    expect(result.plan).toMatchObject({ countryCode: "DE", targetCount: 20 });
  });

  it("asks for a country before proposing an external search", () => {
    const result = interpretAssistantRequest("帮我搜索 30 家系统集成商");
    expect(result.intent).toBe("clarification");
    expect(result.plan).toBeUndefined();
  });

  it("answers greetings without invoking RAG", () => {
    expect(interpretAssistantRequest("你好")).toMatchObject({ intent: "general" });
  });
});
