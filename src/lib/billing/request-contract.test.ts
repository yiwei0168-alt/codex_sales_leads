import {afterEach,expect,it,vi} from "vitest";
import candidates from "../../../config/billing/deepseek-text-bounds-candidate-2026-09-13.json";
import solEvidence from "../../../docs/OPENROUTER_SOL_ENDPOINT_EVIDENCE_2026-09-13.json";
import extractCandidate from "../../../config/billing/tavily-basic-extract-candidate-2026-09-14.json";
import {billingPolicy,tariffSchema,quoteRequest} from "./policy";
import {assertRequestContract} from "./request-contract";
import {deepSeekRequestBody} from "@/providers/deepseek-request";
import {TavilySearchProvider} from "@/providers/tavily";
const rules=candidates.rules.map(rule=>tariffSchema.parse(rule));
afterEach(()=>vi.unstubAllEnvs());

it("covers all captured standard Sol endpoint prices, long-context overrides and removed discounts",()=>{
  const maxima={prompt:11,completion:49.5,input_cache_read:1.1,input_cache_write:13.75};
  const endpoints=solEvidence.endpoints.filter(endpoint=>!["openai/flex","openai/fast"].includes(endpoint.tag));
  expect(endpoints).toHaveLength(5);
  for(const endpoint of endpoints){
    expect(endpoint.contextLength).toBeLessThanOrEqual(1050000);
    const discount=endpoint.pricing.discount;
    for(const price of [endpoint.pricing,...endpoint.pricing.overrides]){
      for(const [sku,ceiling] of Object.entries(maxima)){
        const amount=Number(price[sku as keyof typeof price]);
        expect(Number.isFinite(amount)).toBe(true);
        expect(amount*1e6/(1-discount)).toBeLessThanOrEqual(ceiling+1e-9);
      }
    }
  }
  // Independently charge the entire context for each input SKU; no exclusivity assumption.
  const micros=(BigInt(1050000)*(BigInt(1100)+BigInt(110)+BigInt(1375))+BigInt(4096)*BigInt(4950))/BigInt(100);
  expect(billingPolicy.rules.find(rule=>rule.key==="openrouter-sol-credits-standard-text-json")?.maximumChargeMicros).toBe(Number(micros));
});

it("retains the narrow SearchAPI request validator while its account price bound is held",()=>{
  const rule=billingPolicy.rules.find(item=>item.requestContract==="searchapi-google-bing-v1");
  expect(rule).toBeDefined();
  const unverifiedAccount={origin:"https://www.searchapi.io",pathname:"/api/v1/search",model:"",requestBytes:100,outputTokens:null};
  expect(()=>quoteRequest(unverifiedAccount,undefined,Date.parse("2026-09-13T12:00:00Z"))).toThrow("missing-tariff");
  if(!rule)throw new Error("SearchAPI public request contract missing");
  const query="?engine=google&q=network&location=Colombia&gl=co&hl=es&num=10";
  expect(rule.maximumChargeMicros).toBe(8000);
  expect(()=>assertRequestContract(rule,{},query,"GET")).not.toThrow();
  expect(()=>assertRequestContract(rule,{},query.replace("google","bing").replace("num=10","num=20"),"GET")).not.toThrow();
  for(const bad of [query+"&page=2",query+"&engine=bing",query.replace("google","google_rank_tracking"),query.replace("num=10","num=20"),query+"&async=true"])
    expect(()=>assertRequestContract(rule,{},bad,"GET")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(rule,{},query,"POST")).toThrow("request-out-of-bounds");
});

it("checks Places FieldMask headers as part of the bound before accepting any request",()=>{
  const rule=quoteRequest({origin:"https://places.googleapis.com",pathname:"/v1/places:searchText",model:"",requestBytes:100,outputTokens:null},undefined,Date.parse("2026-09-13T12:00:00Z"));
  const body={textQuery:"network firms",pageSize:20,languageCode:"es",regionCode:"CO"};
  const mask="places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.businessStatus,places.primaryTypeDisplayName";
  const headers=new Headers({"X-Goog-FieldMask":mask});
  expect(rule.maximumChargeMicros).toBe(35000);
  expect(()=>assertRequestContract(rule,body,"","POST",headers)).not.toThrow();
  for(const value of ["","*",`${mask},places.reviews`,`${mask},places.generativeSummary`,`${mask},places.id`])
    expect(()=>assertRequestContract(rule,body,"","POST",new Headers({"x-goog-fieldmask":value}))).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(rule,body,"","POST")).toThrow("request-out-of-bounds");
  for(const change of [{pageSize:21},{pageToken:"next"},{routingParameters:{}}])
    expect(()=>assertRequestContract(rule,{...body,...change},"","POST",headers)).toThrow("request-out-of-bounds");
});
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

it("preserves reviewed native contracts while adding narrow search and Sol contracts",()=>{
  expect(billingPolicy.version).toBe("request-bounds-v1.11.0");
  expect(billingPolicy.rules).toHaveLength(12);
  rules.forEach(expected=>{
    const rule=billingPolicy.rules.find(candidate=>candidate.key===expected.key);
    expect({...rule,boundDescription:expected.boundDescription}).toEqual(expected);
  });
  expect(()=>quoteRequest({origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model:"kimi-k3",requestBytes:100,outputTokens:100},billingPolicy.rules,Date.parse("2026-09-13T12:00:00Z"))).toThrow("missing-tariff");
});

it("keeps uncapped OpenRouter correction and review routes blocked despite public price metadata",()=>{
  const now=Date.parse("2026-09-14T00:00:00Z");
  for(const model of ["openai/gpt-5.6-terra","openai/gpt-4o-mini","openai/gpt-4o",
    "deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro"]){
    expect(()=>quoteRequest({origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",
      model,requestBytes:100,outputTokens:8192},undefined,now)).toThrow("missing-tariff");
  }
  expect(()=>quoteRequest({origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",
    model:"openai/gpt-5.6-sol",requestBytes:100,outputTokens:12000},undefined,now)).toThrow("request-out-of-bounds");
});

it.each([{model:"openai/gpt-5.6-terra",key:"openrouter-terra-review-credits-standard-json",
  contract:"openrouter-terra-review-json-v2",maximum:11019202,output:8192,
  effort:"medium",name:"lead-review-secondary"},
{model:"openai/gpt-5.6-sol",key:"openrouter-sol-judge-credits-standard-json",
  contract:"openrouter-sol-judge-json-v1",maximum:27736500,output:12000,
  effort:"high",name:"lead-review-judge"}])("admits only the confirmed $name task's exact OpenRouter wire",entry=>{
  const now=Date.parse("2026-09-14T10:30:00Z");
  const quote={origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",
    model:entry.model,requestBytes:61440,outputTokens:entry.output};
  const rule=quoteRequest(quote,undefined,now,entry.key);
  expect(rule).toMatchObject({requestContract:entry.contract,maximumChargeMicros:entry.maximum,
    maximumOutputTokens:entry.output});
  const terraV2=entry.contract==="openrouter-terra-review-json-v2";
  const body={model:entry.model,...(terraV2?{}:{temperature:0}),reasoning:{effort:entry.effort},
    ...(terraV2?{max_tokens:entry.output}:{max_completion_tokens:entry.output}),
    provider:{require_parameters:true,data_collection:"deny"},
    response_format:{type:"json_schema",json_schema:{name:entry.name,strict:true,schema:{type:"object"}}},
    messages:[{role:"system",content:"instructions"},{role:"user",content:"facts"}]};
  expect(()=>assertRequestContract(rule,body,"")).not.toThrow();
  for(const change of [{reasoning:{effort:"low"}},terraV2?{max_tokens:entry.output+1}:{max_completion_tokens:entry.output+1},
    {response_format:{type:"json_schema",json_schema:{name:"unrelated",strict:true,schema:{type:"object"}}}},
    {provider:{...body.provider,only:["openai"]}},{stream:true},{tools:[]},{plugins:[]},
    {service_tier:"priority"},terraV2?{max_completion_tokens:entry.output}:{max_tokens:entry.output},
    ...(terraV2?[{temperature:0}]:[]),{messages:[...body.messages,{role:"assistant",content:"extra"}]}])
    expect(()=>assertRequestContract(rule,{...body,...change},"")).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({...quote,requestBytes:61441},undefined,now,entry.key)).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest(quote,undefined,Date.parse(rule.expiresAt),entry.key)).toThrow("expired-tariff");
});

it("admits only the credits-only Sol standard text schema contract and enforces its envelope",()=>{
  const now=Date.parse("2026-09-13T13:00:00Z");
  const input={origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",model:"openai/gpt-5.6-sol",requestBytes:61440,outputTokens:4096};
  const rule=quoteRequest(input,undefined,now);
  const body={model:input.model,messages:[{role:"system",content:"instructions"},{role:"user",content:"facts"}],
    provider:{require_parameters:true,data_collection:"deny"},response_format:{type:"json_schema",json_schema:{name:"result",strict:true,schema:{type:"object"}}},
    stream:false,temperature:0,max_completion_tokens:4096};
  expect(rule.maximumChargeMicros).toBe(27345252);
  expect(()=>assertRequestContract(rule,body,"")).not.toThrow();
  for(const change of [{tools:[]},{plugins:[]},{service_tier:"priority"},{n:2},{max_tokens:4096},{max_completion_tokens:4097},
    {max_completion_tokens:0},{stream:true},{model:"openai/gpt-5.6-sol:fast"},{provider:{...body.provider,only:["openai/fast"]}},
    {messages:[{role:"system",content:"instructions"},{role:"user",content:[{type:"text",text:"facts"}]}]},
    {messages:[...body.messages,{role:"assistant",content:"extra"}]}])
    expect(()=>assertRequestContract(rule,{...body,...change},"")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(rule,body,"?service_tier=priority")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(rule,body,"","GET")).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({...input,requestBytes:61441},undefined,now)).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({...input,outputTokens:4097},undefined,now)).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest(input,undefined,Date.parse(rule.expiresAt))).toThrow("expired-tariff");
});

it("selects S01 only by its explicit playbook contract and rejects routing or paid-capability drift",()=>{
  const now=Date.parse("2026-09-14T00:00:00Z");
  const input={origin:"https://openrouter.ai",pathname:"/api/v1/chat/completions",model:"openai/gpt-5.6-sol",requestBytes:61440,outputTokens:4096};
  const ordinary=quoteRequest(input,undefined,now);
  const pinned=quoteRequest(input,undefined,now,"openrouter-sol-openai-playbook-credits");
  expect(ordinary.maximumChargeMicros).toBe(27345252);
  expect(pinned.maximumChargeMicros).toBe(10622880);
  const body={model:input.model,messages:[{role:"system",content:"instructions"},{role:"user",content:"facts"}],
    provider:{require_parameters:true,data_collection:"deny",only:["openai"],allow_fallbacks:false},
    response_format:{type:"json_schema",json_schema:{name:"result",strict:true,schema:{type:"object"}}},
    stream:false,max_tokens:4096};
  expect(pinned.requestContract).toBe("openrouter-sol-openai-playbook-v2");
  expect(()=>assertRequestContract(pinned,body,"")).not.toThrow();
  expect(()=>assertRequestContract(ordinary,body,"")).toThrow("request-out-of-bounds");
  for(const provider of [{...body.provider,only:["azure"]},{...body.provider,only:["openai","azure"]},
    {...body.provider,allow_fallbacks:true},{require_parameters:true,data_collection:"deny"}])
    expect(()=>assertRequestContract(pinned,{...body,provider},"")).toThrow("request-out-of-bounds");
  for(const change of [{tools:[]},{plugins:[]},{service_tier:"priority"},{max_tokens:4097},
    {max_completion_tokens:4096},{temperature:0},
    {response_format:{type:"json_object"}},{messages:[...body.messages,{role:"assistant",content:"extra"}]}])
    expect(()=>assertRequestContract(pinned,{...body,...change},"")).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest({...input,requestBytes:61441},undefined,now,pinned.key)).toThrow("request-out-of-bounds");
  expect(()=>quoteRequest(input,undefined,Date.parse(pinned.expiresAt),pinned.key)).toThrow("expired-tariff");
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

it("admits only the confirmed Tavily basic Extract wire under its expiry and byte bounds",async()=>{
  expect(billingPolicy.rules.filter(rule=>rule.pathname==="/extract")).toHaveLength(1);
  const proposed=tariffSchema.parse(extractCandidate);
  const active=billingPolicy.rules.find(rule=>rule.key===proposed.key)!;
  expect(active).toMatchObject({origin:proposed.origin,pathname:proposed.pathname,model:"",
    maximumChargeMicros:32000,maximumRequestBytes:32768,maximumOutputTokens:0,
    requestContract:"tavily-basic-extract-v1",expiresAt:"2026-09-21T00:00:00Z"});
  const body={urls:["https://example.com/a","https://example.com/b"],extract_depth:"basic",
    format:"text",include_images:false,include_usage:true,timeout:20};
  expect(()=>assertRequestContract(proposed,body,"")).not.toThrow();
  expect(quoteRequest({origin:proposed.origin,pathname:proposed.pathname,model:"",
    requestBytes:JSON.stringify(body).length,outputTokens:null},undefined,Date.parse(active.verifiedAt))).toBe(active);
  expect(()=>quoteRequest({origin:proposed.origin,pathname:proposed.pathname,model:"",
    requestBytes:32769,outputTokens:null},undefined,Date.parse(active.verifiedAt))).toThrow("request-out-of-bounds");
  expect(quoteRequest({origin:proposed.origin,pathname:proposed.pathname,model:"",
    requestBytes:JSON.stringify(body).length,outputTokens:null},[proposed],Date.parse(proposed.verifiedAt))).toBe(proposed);
  expect(()=>quoteRequest({origin:proposed.origin,pathname:proposed.pathname,model:"",
    requestBytes:JSON.stringify(body).length,outputTokens:null},[proposed],Date.parse(proposed.expiresAt)))
    .toThrow("expired-tariff");
  for(const change of [{urls:[]},{urls:Array.from({length:21},(_,index)=>`https://example.com/${index}`)},
    {urls:["http://example.com"]},{urls:["https://user:pass@example.com"]},
    {extract_depth:"advanced"},{query:"network"},{include_images:true},{include_usage:false},
    {format:"markdown"},{timeout:21},{tools:[]}])
    expect(()=>assertRequestContract(proposed,{...body,...change},"")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(proposed,body,"?page=2")).toThrow("request-out-of-bounds");
  expect(()=>assertRequestContract(proposed,body,"","GET")).toThrow("request-out-of-bounds");
  vi.stubEnv("TAVILY_API_KEY","synthetic-key");
  let captured=0;
  const provider=new TavilySearchProvider({maxAttempts:1,fetchImplementation:async(input,init)=>{
    const request=new Request(input,init);
    expect(new URL(request.url).pathname).toBe("/extract");
    const actual=JSON.parse(await request.clone().text()) as Record<string,unknown>;
    expect(()=>assertRequestContract(proposed,actual,"",request.method,request.headers)).not.toThrow();
    expect(Buffer.byteLength(JSON.stringify(actual))).toBeLessThanOrEqual(proposed.maximumRequestBytes);
    captured++;
    return new Response(JSON.stringify({results:[],failed_results:[],usage:{credits:0}}),{status:200});
  }});
  await provider.extract(body.urls);
  await provider.extract(Array.from({length:20},(_,index)=>`https://example.com/${index}`));
  expect(captured).toBe(2);
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
