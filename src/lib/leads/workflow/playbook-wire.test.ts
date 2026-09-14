import {afterEach,expect,it,vi} from "vitest";
import {buildLeadMarketPlaybook} from "./playbook";
import {BudgetDeniedError,quoteRequest} from "@/lib/billing/policy";
import {assertRequestContract} from "@/lib/billing/request-contract";

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("captures the real LangChain playbook wire without sending a model request",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-never-sent");
  vi.stubEnv("OPENAI_GENERATION_MODEL","gpt-5.6-sol");
  vi.stubEnv("LEAD_PLANNER_MODEL","");
  vi.stubEnv("OPENROUTER_BASE_URL","https://openrouter.ai/api/v1");
  const captured:Request[]=[];
  vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    captured.push(new Request(input,init));
    throw new BudgetDeniedError("missing-tariff");
  });
  await expect(buildLeadMarketPlaybook({countryCode:"CO",countryName:"Colombia",objective:"new-market",
    roles:["Distributor"],targetCount:1,queryLanguage:"es",userRequest:"Synthetic minimum acceptance request"},[]))
    .rejects.toMatchObject({code:"missing-tariff"});
  expect(captured).toHaveLength(1);
  const request=captured[0];
  expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");expect(request.method).toBe("POST");
  const body=await request.json();
  const tariff=quoteRequest({origin:new URL(request.url).origin,pathname:new URL(request.url).pathname,model:body.model,
    requestBytes:Buffer.byteLength(JSON.stringify(body)),outputTokens:body.max_tokens},undefined,Date.parse("2026-09-14T00:00:00Z"),"openrouter-sol-openai-playbook-credits");
  expect(tariff.maximumChargeMicros).toBe(10622880);
  expect(tariff.requestContract).toBe("openrouter-sol-openai-playbook-v2");
  expect(()=>assertRequestContract(tariff,body,"",request.method,request.headers)).not.toThrow();
  expect(Object.keys(body).sort()).toEqual(["max_tokens","messages","model","provider","response_format","stream"].sort());
  expect(body.model).toBe("openai/gpt-5.6-sol");
  expect(body.max_tokens).toBe(4096);
  expect(body.max_completion_tokens).toBeUndefined();
  expect(body.temperature).toBeUndefined();
  expect(body.provider).toEqual({require_parameters:true,data_collection:"deny",only:["openai"],allow_fallbacks:false});
  expect(body.response_format.type).toBe("json_schema");
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.messages).toHaveLength(2);
  expect(body.messages.every((message:{content:unknown})=>typeof message.content==="string")).toBe(true);
  for(const key of ["tools","tool_choice","plugins","web_search_options","service_tier","models","cache_control","prompt_cache_options"])
    expect(body).not.toHaveProperty(key);
  expect(body.stream??false).toBe(false);expect(body.n??1).toBe(1);
},15000);
