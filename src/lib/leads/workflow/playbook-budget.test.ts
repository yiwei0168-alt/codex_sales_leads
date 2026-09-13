import {afterEach,expect,it,vi} from "vitest";
const invoke=vi.hoisted(()=>vi.fn());
vi.mock("@langchain/openai",()=>({ChatOpenAI:class {withStructuredOutput(){return {invoke};}}}));
import {buildLeadMarketPlaybook} from "./playbook";
import {BudgetDeniedError,PaidCallOutcomeUnknownError} from "@/lib/billing/policy";
const plan={countryCode:"GB",countryName:"United Kingdom",objective:"new-market" as const,roles:["Distributor" as const],targetCount:1,queryLanguage:"en",userRequest:"synthetic"};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it.each([new BudgetDeniedError("missing-tariff"),new PaidCallOutcomeUnknownError()])("does not turn budget/unknown-paid stops into a successful standard playbook",async error=>{
  vi.stubEnv("OPENROUTER_API_KEY","fixture");invoke.mockRejectedValue(error);
  await expect(buildLeadMarketPlaybook(plan,[])).rejects.toBe(error);
  expect(invoke).toHaveBeenCalledOnce();
});
it("preserves the existing fallback for ordinary non-budget errors",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","fixture");invoke.mockRejectedValue(new Error("invalid schema"));
  expect((await buildLeadMarketPlaybook(plan,[])).generatedBy).toBe("deterministic-fallback");
});
