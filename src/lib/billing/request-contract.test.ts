import {afterEach,expect,it,vi} from "vitest";
import candidates from "../../../config/billing/deepseek-text-bounds-candidate-2026-09-13.json";
import {billingPolicy,tariffSchema,quoteRequest} from "./policy";
import {assertRequestContract} from "./request-contract";
import {deepSeekRequestBody} from "@/providers/deepseek-request";
const rules=candidates.rules.map(rule=>tariffSchema.parse(rule));
afterEach(()=>vi.unstubAllEnvs());
const bodies=()=>rules.map(rule=>JSON.parse(deepSeekRequestBody({task:"lead-qualification",modelVersion:rule.model,promptVersion:"fixture",input:{},evidenceIds:[],outputSchema:{type:"object"}}).body));

it("permits only bounded Exa auto company text search and rejects unsupported or additional capabilities",()=>{
  const rule=quoteRequest({origin:"https://api.exa.ai",pathname:"/search",model:"",requestBytes:100,outputTokens:null},undefined,Date.parse("2026-09-13T12:00:00Z"));
  const body={query:"network companies",type:"auto",category:"company",userLocation:"CO",numResults:20,contents:{text:true}};
  expect(rule.maximumChargeMicros).toBe(27000);
  expect(()=>assertRequestContract(rule,body,"","POST")).not.toThrow();
  for(const change of [{type:"deep"},{numResults:21},{excludeDomains:[]},{outputSchema:{}},{contents:{text:true,summary:true}},{contents:{text:true,subpages:1}}])
    expect(()=>assertRequestContract(rule,{...body,...change},"","POST")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(rule,body,"","GET")).toThrow("request-out-of-bounds");
});

it("preserves reviewed native contracts while adding only narrow search endpoints",()=>{
  expect(billingPolicy.version).toBe("request-bounds-v1.3.0");
  expect(billingPolicy.rules).toHaveLength(5);
  billingPolicy.rules.slice(0,2).forEach((rule,index)=>expect({...rule,boundDescription:rules[index].boundDescription}).toEqual(rules[index]));
  expect(()=>quoteRequest({origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model:"kimi-k3",requestBytes:100,outputTokens:100},billingPolicy.rules,Date.parse("2026-09-13T12:00:00Z"))).toThrow("missing-tariff");
});

it("bounds ordinary search requests and rejects other methods, features, duplicate params and expired rules",()=>{
  const now=Date.parse("2026-09-13T12:00:00Z");
  const brave=quoteRequest({origin:"https://api.search.brave.com",pathname:"/res/v1/web/search",model:"",requestBytes:100,outputTokens:null},undefined,now);
  const query="?q=networking&country=ALL&search_lang=es&count=20";
  expect(brave.maximumChargeMicros).toBe(5000);
  expect(()=>assertRequestContract(brave,{},query,"GET")).not.toThrow();
  for(const bad of [query+"&q=second",query+"&summary=true",query.replace("count=20","count=100")])
    expect(()=>assertRequestContract(brave,{},bad,"GET")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(brave,{},query,"POST")).toThrow("request-out-of-bounds");
  const tavily=quoteRequest({origin:"https://api.tavily.com",pathname:"/search",model:"",requestBytes:100,outputTokens:null},undefined,now);
  const body={query:"networking",search_depth:"advanced",max_results:20,include_answer:false,include_raw_content:"markdown",auto_parameters:false};
  expect(tavily.maximumChargeMicros).toBe(16000);
  expect(()=>assertRequestContract(tavily,body,"","POST")).not.toThrow();
  for(const change of [{auto_parameters:true},{include_answer:true},{search_depth:"research"},{max_results:21},{tools:[]}])
    expect(()=>assertRequestContract(tavily,{...body,...change},"","POST")).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({origin:tavily.origin,pathname:tavily.pathname,model:"",requestBytes:100,outputTokens:null},undefined,Date.parse(tavily.expiresAt))).toThrow("expired-tariff");
  expect(()=>quoteRequest({origin:tavily.origin,pathname:"/research",model:"",requestBytes:100,outputTokens:null},undefined,now)).toThrow("missing-tariff");
});

it("accepts current exact Flash Chat and Pro Messages serializers with unchanged non-thinking settings",()=>{
  vi.stubEnv("DEEPSEEK_TRANSPORT","");
  bodies().forEach((body,index)=>expect(()=>assertRequestContract(rules[index],body,"")).not.toThrow());
});
it("rejects hidden paid capabilities, unknown fields, thinking, multimodal messages and alternate contracts",()=>{
  vi.stubEnv("DEEPSEEK_TRANSPORT","");
  bodies().forEach((body,index)=>{
    const invalid=[{...body,tools:[]},{...body,stream:false},{...body,n:2},{...body,service_tier:"fast"},
      {...body,thinking:{type:"enabled"}},{...body,thinking:{type:"disabled",budget_tokens:1000}},
      {...body,messages:[{role:"user",content:[{type:"text",text:"text"}]}]},
      {...body,max_tokens:8193},{...body,temperature:NaN},{...body,model:"unapproved"}];
    for(const changed of invalid)expect(()=>assertRequestContract(rules[index],changed,"")).toThrow("request-out-of-bounds");
    expect(()=>assertRequestContract(rules[index],body,"?feature=fast")).toThrow("request-out-of-bounds");
    expect(()=>assertRequestContract({...rules[index],origin:"https://gateway.test"},body,"")).toThrow();
  });
});
it("derives exact micro-USD ceilings independently of tokenizer measurements and expires them",()=>{
  for(const [index,inputCents,outputCents] of [[0,30,120],[1,132,396]]){
    const numerator=BigInt(1048576)*BigInt(inputCents)+BigInt(8192)*BigInt(outputCents);
    expect(rules[index].maximumChargeMicros).toBe(Number((numerator+BigInt(99))/BigInt(100)));
    const rule=rules[index];
    const input={origin:rule.origin,pathname:rule.pathname,model:rule.model,requestBytes:61440,outputTokens:8192};
    expect(quoteRequest(input,[rule],Date.parse("2026-09-13T12:00:00Z"))).toBe(rule);
    expect(()=>quoteRequest({...input,requestBytes:61441},[rule],Date.parse("2026-09-13T12:00:00Z"))).toThrow();
    expect(()=>quoteRequest(input,[rule],Date.parse("2026-09-20T00:00:00Z"))).toThrow("expired-tariff");
  }
});
