import {afterEach,expect,it,vi} from "vitest";
vi.mock("@/lib/billing/denial-metrics",()=>({recordBudgetDenial:vi.fn().mockResolvedValue(undefined)}));
import {withProductSpend} from "./context";
import {planAssistantRequest} from "@/lib/assistant/intent-agent";
import {generateFollowUp} from "@/lib/outreach/kimi-agent";

afterEach(()=>vi.unstubAllEnvs());
it("blocks intent before transport without provider fallback or deterministic success",async()=>{
  vi.stubEnv("KIMI_API_KEY","test-not-secret");const transport=vi.fn();
  await expect(withProductSpend("owner","intent",()=>planAssistantRequest("Find distributors",[],transport))).rejects.toMatchObject({name:"BudgetDeniedError",code:"missing-tariff"});
  expect(transport).not.toHaveBeenCalled();
});
it("blocks follow-up generation without a retry",async()=>{
  vi.stubEnv("KIMI_API_KEY","test-not-secret");const transport=vi.fn();
  await expect(withProductSpend("owner","follow-up",()=>generateFollowUp({instructions:"Follow up",originalSubject:"Hello",originalBody:"Dear partner"},transport))).rejects.toMatchObject({name:"BudgetDeniedError",code:"missing-tariff"});
  expect(transport).not.toHaveBeenCalled();
});
