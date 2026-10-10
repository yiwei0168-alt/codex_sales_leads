import {afterEach,expect,it,vi} from "vitest";
vi.mock("@/lib/billing/denial-metrics",()=>({recordBudgetDenial:vi.fn().mockResolvedValue(undefined)}));
import {withProductSpend} from "./context";
import {planAssistantRequest} from "@/lib/assistant/intent-agent";
import {generateFollowUp} from "@/lib/outreach/kimi-agent";

afterEach(()=>vi.unstubAllEnvs());
it("returns disabled intent without entering paid admission",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-not-secret");
  await expect(withProductSpend("owner","intent",()=>planAssistantRequest("Find distributors",[]))).resolves.toMatchObject({plannerSource:"disabled",plannerCalls:[]});
});
it("blocks follow-up generation without a retry",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-not-secret");const transport=vi.fn();
  await expect(withProductSpend("owner","follow-up",()=>generateFollowUp({instructions:"Follow up",originalSubject:"Hello",originalBody:"Dear partner"},transport))).rejects.toMatchObject({name:"BudgetDeniedError",code:expect.stringMatching(/^(missing|expired)-tariff$/)});
  expect(transport).not.toHaveBeenCalled();
});
