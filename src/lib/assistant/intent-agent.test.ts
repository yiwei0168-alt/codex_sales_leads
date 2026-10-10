import { afterEach, expect, it, vi } from "vitest";
import { planAssistantRequest } from "./intent-agent";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each(["Open AP3000", "Find German distributors", "Complex multi-market research", "Change budget", "Send mail"])(
  "keeps legacy classification disabled for %s even with configured credentials", async content => {
    vi.stubEnv("OPENROUTER_API_KEY", "configured-test");
    vi.stubEnv("KIMI_API_KEY", "legacy-test");
    vi.stubEnv("DEEPSEEK_API_KEY", "legacy-test");
    const transport = vi.fn(() => { throw new Error("Unexpected external call"); });
    vi.stubGlobal("fetch", transport);
    const result = await planAssistantRequest(content, [{ role: "user", content: "Previous task" }]);
    expect(result).toMatchObject({ intent: "clarification", plannerSource: "disabled",
      plannerModel: "none", plannerCalls: [], externalQuestions: [] });
    expect(result.leadPlan).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
  },
);
